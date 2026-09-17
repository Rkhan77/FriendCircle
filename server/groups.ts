import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transact, demo } from "./store";
import { clusterAllowed, type Group } from "../lib/model";
import { encryptedTextCost, spendCharacters } from "../lib/economy";
export function groupRoutes(app: Express, push: () => void) {
  app.get("/api/groups", async (_, res) =>
    res.json(
      await transact((s) =>
        (s.groups || [])
          .filter((g) => g.members.includes(res.locals.uid))
          .map((g) => ({
            ...g,
            active: clusterAllowed(s, g, demo),
            people: g.members.map((id) => {
              const p = s.people.find((x) => x.id === id)!;
              return {
                id: p.id,
                name: p.name,
                initials: p.initials,
                color: p.color,
                publicKey: p.publicKey,
              };
            }),
          })),
      ),
    ),
  );
  app.post("/api/groups", async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(50),
        members: z.array(z.string()).min(2).max(7),
      })
      .parse(req.body);
    const result = await transact((s) => {
      const members = [
        ...new Set([res.locals.uid, ...input.members]),
      ] as string[];
      if (members.length < 3) throw Error("Choose at least two friends");
      const g: Group = {
        ...input,
        members,
        id: randomUUID(),
        createdAt: Date.now(),
      };
      if (!clusterAllowed(s, g, demo))
        throw Error(
          "Everyone must be mutual verified friends, sharing location, and within 2 km of each other.",
        );
      s.groups ??= [];
      s.groups.push(g);
      return g;
    });
    push();
    res.json(result);
  });
  app.get("/api/groups/:id/messages", async (req, res) =>
    res.json(
      await transact((s) => {
        const g = s.groups?.find(
          (g) => g.id === req.params.id && g.members.includes(res.locals.uid),
        );
        if (!g || !clusterAllowed(s, g, demo))
          throw Error(
            "This local group is paused until all members are nearby and sharing location.",
          );
        return s.messages.filter(
          (m) => m.groupId === g.id && m.to === res.locals.uid,
        );
      }),
    ),
  );
  app.post("/api/groups/:id/messages", async (req, res) => {
    const body = z
      .object({
        envelopes: z
          .array(
            z.object({
              to: z.string(),
              ciphertext: z.string().min(1).max(16000),
              iv: z.string().min(12).max(64),
              senderKey: z.record(z.string(), z.unknown()),
              recipientKey: z.record(z.string(), z.unknown()),
            }),
          )
          .min(3)
          .max(8),
      })
      .parse(req.body);
    await transact((s) => {
      const uid = res.locals.uid,
        g = s.groups?.find(
          (g) => g.id === req.params.id && g.members.includes(uid),
        );
      if (!g || !clusterAllowed(s, g, demo))
        throw Error("This group is no longer in the same location cluster.");
      if (
        body.envelopes.length !== g.members.length ||
        new Set(body.envelopes.map((x) => x.to)).size !== g.members.length ||
        body.envelopes.some((x) => !g.members.includes(x.to))
      )
        throw Error("An encrypted envelope is required for every member.");
      const sender = s.people.find((p) => p.id === uid);
      for (const e of body.envelopes) {
        const recipient = s.people.find((p) => p.id === e.to);
        if (
          !sender?.publicKey ||
          !recipient?.publicKey ||
          e.senderKey.x !== sender.publicKey.x ||
          e.senderKey.y !== sender.publicKey.y ||
          e.recipientKey.x !== recipient.publicKey.x ||
          e.recipientKey.y !== recipient.publicKey.y
        )
          throw Error("Every member needs an active chat key.");
      }
      const costs = body.envelopes.map((e) => encryptedTextCost(e.ciphertext));
      if (costs.some((cost) => cost !== costs[0]))
        throw Error("Group envelopes must contain the same text length.");
      spendCharacters(sender!, costs[0]);
      const id = randomUUID(),
        createdAt = Date.now();
      for (const e of body.envelopes)
        s.messages.push({
          ...e,
          kind: "encrypted",
          id,
          from: uid,
          groupId: g.id,
          createdAt,
        });
    });
    push();
    res.json({ ok: true });
  });
}
