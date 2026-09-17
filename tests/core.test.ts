import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  isFriend,
  distanceKm,
  expire,
  clusterAllowed,
} from "../lib/model";
import { encrypt, decrypt } from "../lib/crypto";
import { updateSuburbAchievements } from "../lib/achievements";
test("Distance handles coincident and separated locations", () => {
  assert.equal(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  assert.ok(
    Math.abs(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.195) <
      0.01,
  );
});
test("Friend access is symmetric and either person can revoke it by blocking", () => {
  const s = seed();
  assert.ok(isFriend(s, "you", "mia"));
  assert.ok(isFriend(s, "mia", "you"));
  assert.equal(isFriend(s, "you", "ella"), false);
  s.blocks.push({ from: "mia", to: "you" });
  assert.equal(isFriend(s, "you", "mia"), false);
  assert.equal(isFriend(s, "mia", "you"), false);
});
test("Distinct friend suburbs unlock lasting achievements without revealing locations", () => {
  const state = seed();
  const first = updateSuburbAchievements(state, "you", Date.now(), true);
  assert.equal(first.connectedSuburbs, 5);
  assert.deepEqual(first.unlocked, [3, 5]);
  assert.equal(first.nextMilestone, 8);
  for (const friend of state.people)
    if (friend.id !== "you" && friend.id !== "james" && friend.id !== "ava")
      friend.sharing = false;
  const later = updateSuburbAchievements(state, "you", Date.now(), true);
  assert.equal(later.connectedSuburbs, 1);
  assert.deepEqual(later.unlocked, [3, 5]);
});
test("Retention expires hi messages and pending photos at their exact deadlines", () => {
  const s = seed();
  s.messages.push({
    id: "1",
    from: "you",
    to: "mia",
    kind: "hi",
    createdAt: 0,
    expiresAt: 7200000,
  });
  s.requests.push({
    id: "r",
    from: "you",
    to: "ella",
    state: "pending",
    createdAt: 0,
    photo: "private",
    reason: "",
  });
  expire(s, 7199999);
  assert.equal(s.messages.length, 1);
  expire(s, 7200000);
  assert.equal(s.messages.length, 0);
  expire(s, 86400000);
  assert.equal(s.requests[0].state, "rejected");
});
test("Group clusters require mutual friendship, sharing, proximity, and fresh locations", () => {
  const s = seed(),
    g = {
      id: "g",
      name: "Coffee",
      members: ["you", "mia", "sophie"],
      createdAt: Date.now(),
    };
  assert.equal(clusterAllowed(s, g, true), false);
  s.friendships.push({ a: "mia", b: "sophie", since: 0, requestId: "seed" });
  assert.equal(clusterAllowed(s, g, true), true);
  s.people.find((p) => p.id === "mia")!.sharing = false;
  assert.equal(clusterAllowed(s, g, true), false);
  s.people.find((p) => p.id === "mia")!.sharing = true;
  s.people.find((p) => p.id === "mia")!.updatedAt = 0;
  assert.equal(clusterAllowed(s, g, false), false);
});
test("Encrypted text decrypts for both endpoints, hides plaintext, rejects tampering and unrelated keys", async () => {
  const create = () =>
    crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, [
      "deriveKey",
    ]);
  const a = await create(),
    b = await create(),
    c = await create();
  const key = await crypto.subtle.exportKey("jwk", b.publicKey);
  const envelope = await encrypt("Coffee at 3?", a, key);
  assert.ok(!envelope.ciphertext.includes("Coffee"));
  const m = {
    ...envelope,
    kind: "encrypted" as const,
    id: "m",
    from: "a",
    to: "b",
    createdAt: 0,
  };
  assert.equal(await decrypt(m, "b", b), "Coffee at 3?");
  assert.equal(await decrypt(m, "a", a), "Coffee at 3?");
  assert.match(await decrypt(m, "b", c), /cannot be opened/);
  assert.match(
    await decrypt({ ...m, ciphertext: "AAAA" + m.ciphertext.slice(4) }, "b", b),
    /cannot be opened/,
  );
});
