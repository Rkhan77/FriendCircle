import express from "express";
import next from "next";
import { createServer } from "node:http";
import { Server } from "socket.io";
import multer from "multer";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { activities, distanceKm, isFriend, type Person } from "../lib/model";
import { demo, initStore, transact } from "./store";
import { suburbAt } from "../lib/suburbs";
import { updateSuburbAchievements } from "../lib/achievements";
import { commonTraits, acceptedChatRequest } from "../lib/traits";
import { groupRoutes } from "./groups";
import { mealRoutes, mealOffersForUser, mealGatheringsForUser } from "./meals";
import { syncMealInvitations } from "../lib/meals";
import { adminAnalytics } from "../lib/analytics";
import {
  tickMeetings,
  encryptedTextCost,
  spendCharacters,
} from "../lib/economy";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
// Load .env before startup; APP_MODE must also be exported when choosing live store.
loadEnvConfig(process.cwd());
const port = Number(process.env.PORT || 3000),
  host = demo ? "127.0.0.1" : "0.0.0.0";
if (
  !demo &&
  (!process.env.DATABASE_URL ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY)
)
  throw Error("Live mode requires database and Supabase credentials.");
const photoDir = path.resolve(process.env.PHOTO_DIR || ".data/photos");
const avatarDir = path.resolve(process.env.AVATAR_DIR || ".data/avatars");
const execFileAsync = promisify(execFile);
await mkdir(photoDir, { recursive: true, mode: 0o700 });
await mkdir(avatarDir, { recursive: true, mode: 0o700 });
await initStore();
const app = express(),
  http = createServer(app),
  io = new Server(http, { maxHttpBufferSize: 32768 });
const web =
  process.env.NODE_ENV === "test"
    ? null
    : next({
        dev: process.env.NODE_ENV !== "production",
        hostname: host,
        port,
      });
await web?.prepare();
const origin = process.env.PUBLIC_ORIGIN || `http://${host}:${port}`;
async function stripeApi(
  pathname: string,
  form?: URLSearchParams,
): Promise<any> {
  if (!process.env.STRIPE_SECRET_KEY) throw Error("Billing is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form?.toString(),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error?.message || "Stripe request failed");
  return data;
}
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (demo && !["localhost", "127.0.0.1", "[::1]"].includes(req.hostname))
    return res
      .status(403)
      .json({ error: "Demo is available only on localhost" });
  next();
});
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (demo || !process.env.STRIPE_WEBHOOK_SECRET)
      return res.status(503).end();
    let event: any;
    try {
      const signature = String(req.headers["stripe-signature"] || "");
      const timestamp = signature.match(/(?:^|,)t=(\d+)/)?.[1],
        supplied = signature.match(/(?:^|,)v1=([a-f0-9]+)/)?.[1];
      if (
        !timestamp ||
        !supplied ||
        Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
      )
        throw Error("Expired signature");
      const digest = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
        .update(`${timestamp}.${req.body.toString()}`)
        .digest();
      const given = Buffer.from(supplied, "hex");
      if (given.length !== digest.length || !timingSafeEqual(given, digest))
        throw Error("Invalid signature");
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).end();
    }
    if (
      ![
        "checkout.session.completed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ].includes(event.type)
    )
      return res.json({ received: true });
    await transact(async (s) => {
      s.stripeEvents ??= [];
      if (s.stripeEvents.includes(event.id)) return;
      let subscription: any = null,
        uid: string | null = null;
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        uid = session.client_reference_id;
        if (session.subscription && typeof session.subscription === "string")
          subscription = await stripeApi(
            `subscriptions/${encodeURIComponent(session.subscription)}`,
          );
        if (subscription?.metadata?.friendcircle_uid !== uid) uid = null;
        if (uid && session.customer && typeof session.customer === "string") {
          const p = s.people.find((x) => x.id === uid);
          if (p) p.stripeCustomerId = session.customer;
        }
      } else subscription = event.data.object;
      if (subscription) {
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;
        const p = s.people.find(
          (x) => x.id === uid || x.stripeCustomerId === customerId,
        );
        const correctPrice = subscription.items.data.some(
          (item: any) => item.price.id === process.env.STRIPE_PRICE_ID_PRO,
        );
        if (p)
          p.proUntil =
            correctPrice && ["active", "trialing"].includes(subscription.status)
              ? Math.max(
                  subscription.current_period_end || 0,
                  ...subscription.items.data.map(
                    (item: any) => item.current_period_end || 0,
                  ),
                ) * 1000
              : 0;
      }
      s.stripeEvents.push(event.id);
      if (s.stripeEvents.length > 500)
        s.stripeEvents.splice(0, s.stripeEvents.length - 500);
    });
    push();
    res.json({ received: true });
  },
);
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !==
      (process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.headers.host}`)
  )
    return res.status(403).json({ error: "Request origin not allowed" });
  next();
});
const limits = new Map<string, { count: number; until: number }>();
app.use("/api", (req, res, next) => {
  const k = req.ip || "unknown",
    now = Date.now(),
    entry = limits.get(k);
  if (!entry || entry.until < now)
    limits.set(k, { count: 1, until: now + 60000 });
  else if (++entry.count > 180)
    return res
      .status(429)
      .json({ error: "Please wait a moment before trying again." });
  next();
});
setInterval(() => {
  for (const [k, v] of limits) if (v.until < Date.now()) limits.delete(k);
}, 60000).unref();
const jwks = demo
  ? null
  : createRemoteJWKSet(
      new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    );
const adminUserIds = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const demoAdminToken = randomUUID();
async function identity(cookie?: string) {
  if (demo) return "you";
  const token = cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("fc_token="))
    ?.slice(9);
  if (!token) throw Error("Sign in to continue");
  const { payload } = await jwtVerify(token, jwks!, {
    issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    audience: "authenticated",
  });
  if (!payload.sub) throw Error("Invalid session");
  return payload.sub;
}
app.get("/api/config", (_, res) => res.json({ demo }));
class InvalidCredentials extends Error {}
async function passwordSession(body: unknown) {
  const input = z
    .object({ email: z.email(), password: z.string().min(1).max(200) })
    .parse(body);
  const response = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new InvalidCredentials("Email or password was not accepted.");
  return data as { access_token: string; expires_in: number };
}
function setSessionCookie(
  res: express.Response,
  data: { access_token: string; expires_in: number },
) {
  res.cookie("fc_token", data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: data.expires_in * 1000,
    path: "/",
  });
}
app.post("/api/login", async (req, res) => {
  if (demo) return res.json({ ok: true });
  const data = await passwordSession(req.body);
  setSessionCookie(res, data);
  res.json({ ok: true });
});
app.post("/api/admin/login", async (req, res) => {
  if (demo) {
    res.cookie("fc_demo_admin", demoAdminToken, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    return res.json({ ok: true, demo: true });
  }
  const data = await passwordSession(req.body);
  const { payload } = await jwtVerify(data.access_token, jwks!, {
    issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    audience: "authenticated",
  });
  if (!payload.sub || !adminUserIds.includes(payload.sub))
    return res
      .status(403)
      .json({ error: "This account does not have platform admin access." });
  setSessionCookie(res, data);
  res.json({ ok: true });
});
app.post("/api/logout", (_, res) => {
  res.clearCookie("fc_token");
  res.clearCookie("fc_demo_admin");
  res.json({ ok: true });
});
app.use("/api", async (req, res, next) => {
  try {
    res.locals.uid = await identity(req.headers.cookie);
    res.locals.admin = demo
      ? req.headers.cookie
          ?.split(";")
          .some((part) => part.trim() === `fc_demo_admin=${demoAdminToken}`) ||
        false
      : adminUserIds.includes(res.locals.uid);
    next();
  } catch {
    res.status(401).json({ error: "Please sign in to continue." });
  }
});
function push() {
  io.emit("refresh");
} // Notification carries no personal data; clients refetch authorized state.
app.get("/api/state", async (req, res) => {
  const uid = res.locals.uid;
  res.json(
    await transact(async (s) => {
      const me = s.people.find((p) => p.id === uid);
      if (!me) return { onboarding: true, demo };
      tickMeetings(s, Date.now(), demo);
      syncMealInvitations(s, Date.now(), demo);
      const currentSuburb =
        me.sharing && (demo || me.updatedAt > Date.now() - 120000)
          ? suburbAt(me.lat, me.lng)
          : undefined;
      const inMySuburb = (p: Person) =>
        !!currentSuburb && currentSuburb.code === suburbAt(p.lat, p.lng)?.code;
      const friends = s.people
        .filter((p) => isFriend(s, uid, p.id))
        .map((p) => {
          const available =
            p.sharing && (demo || p.updatedAt > Date.now() - 120000);
          const {
            lat,
            lng,
            textCharacters,
            socialCredits,
            radiusPassExpiresAt,
            radiusPasses,
            proUntil,
            stripeCustomerId,
            ...safe
          } = p;
          return {
            ...safe,
            nearby: available && inMySuburb(p),
            publicKey: p.publicKey,
          };
        });
      const discoverable = s.people
        .filter(
          (p) =>
            p.id !== uid &&
            !isFriend(s, uid, p.id) &&
            p.visibility === "public" &&
            p.sharing &&
            inMySuburb(p) &&
            commonTraits(me, p).length > 0 &&
            (demo || p.updatedAt > Date.now() - 120000) &&
            !s.blocks.some(
              (b) =>
                (b.from === uid && b.to === p.id) ||
                (b.from === p.id && b.to === uid),
            ),
        )
        .map((p) => {
          const {
            lat,
            lng,
            publicKey,
            textCharacters,
            socialCredits,
            radiusPassExpiresAt,
            radiusPasses,
            proUntil,
            stripeCustomerId,
            ...safe
          } = p;
          return {
            ...safe,
            commonTraits: commonTraits(me, p),
            nearby: true,
            connected: false,
          };
        })
        .filter(Boolean);
      const publicProfiles = discoverable;
      const conversationIds = [
        ...new Set(
          [...s.messages]
            .reverse()
            .filter((m) => !m.groupId && (m.from === uid || m.to === uid))
            .map((m) => (m.from === uid ? m.to : m.from)),
        ),
      ].filter(
        (id) =>
          !s.blocks.some(
            (b) =>
              (b.from === uid && b.to === id) ||
              (b.from === id && b.to === uid),
          ) &&
          (isFriend(s, uid, id) || !!acceptedChatRequest(s, uid, id)),
      );
      const chatContacts = (s.chatRequests || [])
        .filter(
          (r) => r.state === "accepted" && (r.from === uid || r.to === uid),
        )
        .map((r) => {
          const p = s.people.find(
            (person) => person.id === (r.from === uid ? r.to : r.from),
          );
          if (
            !p ||
            isFriend(s, uid, p.id) ||
            s.blocks.some(
              (b) =>
                (b.from === uid && b.to === p.id) ||
                (b.from === p.id && b.to === uid),
            )
          )
            return null;
          const {
            lat,
            lng,
            textCharacters,
            socialCredits,
            radiusPassExpiresAt,
            radiusPasses,
            proUntil,
            stripeCustomerId,
            ...safe
          } = p;
          const available =
            p.sharing &&
            (demo || p.updatedAt > Date.now() - 120000) &&
            inMySuburb(p);
          return {
            ...safe,
            nearby: available,
            connected: false,
            chatRemaining: r.from === uid ? r.remainingFrom : r.remainingTo,
          };
        })
        .filter(Boolean);
      return {
        me,
        suburb: currentSuburb || null,
        friendPresence: friends
          .filter((f) => f.nearby)
          .map((f) => ({
            id: f.id,
            name: f.name,
          })),
        friends,
        conversationIds,
        discoverable,
        publicProfiles,
        suburbAchievements: updateSuburbAchievements(s, uid, Date.now(), demo),
        chatContacts,
        chatRequests: (s.chatRequests || [])
          .filter((r) => r.from === uid || r.to === uid)
          .map((r) => ({
            ...r,
            fromName: s.people.find((p) => p.id === r.from)?.name,
            toName: s.people.find((p) => p.id === r.to)?.name,
          })),
        mealOffers: mealOffersForUser(s, uid),
        mealGatherings: mealGatheringsForUser(s, uid),
        mealInvitations: (s.mealInvitations || [])
          .filter((v) => v.a === uid || v.b === uid)
          .map((v) => ({
            ...v,
            friendName: s.people.find((p) => p.id === (v.a === uid ? v.b : v.a))
              ?.name,
            restaurantName: s.mealOffers?.find((o) => o.id === v.offerId)
              ?.restaurantName,
          })),
        mealVouchers: (s.mealVouchers || [])
          .filter((v) => v.a === uid || v.b === uid)
          .map((v) => ({
            ...v,
            restaurantName: s.mealOffers?.find((o) => o.id === v.offerId)
              ?.restaurantName,
          })),
        merchant: (s.mealOffers || []).some(
          (o) => !o.deletedAt && o.managerId === uid,
        ),
        meetings: (s.meetings || [])
          .filter((m) => m.a === uid || m.b === uid)
          .map((m) => ({
            ...m,
            friendName: s.people.find((p) => p.id === (m.a === uid ? m.b : m.a))
              ?.name,
          })),
        requests: s.requests
          .filter((r) => r.from === uid || r.to === uid)
          .map(({ photo, ...r }) => ({
            ...r,
            fromName: s.people.find((p) => p.id === r.from)?.name,
            toName: s.people.find((p) => p.id === r.to)?.name,
          })),
        demo,
        admin: res.locals.admin,
      };
    }),
  );
});
app.post("/api/onboard", async (req, res) => {
  const input = z
    .object({ name: z.string().trim().min(2).max(60), adult: z.literal(true) })
    .parse(req.body);
  await transact((s) => {
    if (s.people.some((p) => p.id === res.locals.uid)) return;
    s.people.push({
      id: res.locals.uid,
      name: input.name,
      initials: input.name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join(""),
      color: "#efad94",
      activity: "coffee",
      status: "Hello, neighbourhood",
      lat: 0,
      lng: 0,
      sharing: false,
      visibility: "private",
      textCharacters: 0,
      socialCredits: 0,
      updatedAt: Date.now(),
      adult: true,
    });
  });
  res.json({ ok: true });
});
app.patch("/api/me", async (req, res) => {
  const input = z
    .object({
      activity: z
        .enum(Object.keys(activities) as [string, ...string[]])
        .optional(),
      status: z.string().max(100).optional(),
      bio: z.string().trim().max(500).optional(),
      hobbies: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
      favoriteFoods: z
        .array(z.string().trim().min(1).max(40))
        .max(12)
        .optional(),
      sports: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
      movies: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
      games: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
      statusEmoji: z
        .string()
        .max(16)
        .refine(
          (v) => v === "" || /\p{Extended_Pictographic}/u.test(v),
          "Choose an emoji",
        )
        .optional(),
      sharing: z.boolean().optional(),
      visibility: z.enum(["public", "private"]).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
    })
    .refine(
      (x) => (x.lat === undefined) === (x.lng === undefined),
      "Provide both coordinates",
    )
    .parse(req.body);
  await transact((s) => {
    const me = s.people.find((p) => p.id === res.locals.uid);
    if (!me) throw Error("Complete your profile first");
    Object.assign(me, input);
    if (input.lat !== undefined) me.updatedAt = Date.now();
    tickMeetings(s, Date.now(), demo);
    syncMealInvitations(s, Date.now(), demo);
  });
  push();
  res.json({ ok: true });
});
app.post("/api/radius/fist", (_, res) =>
  res.status(410).json({
    error: "Map radius passes are retired; discovery now follows your suburb.",
  }),
);
app.post("/api/billing/checkout", (_, res) =>
  res.status(410).json({
    error:
      "New Pro purchases are paused while suburb-based benefits are defined.",
  }),
);
app.post("/api/billing/portal", async (_, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.PUBLIC_ORIGIN)
    throw Error("Billing portal is unavailable.");
  const p = await transact((s) =>
    s.people.find((x) => x.id === res.locals.uid),
  );
  if (!p?.stripeCustomerId) throw Error("No Pro subscription found.");
  const session = await stripeApi(
    "billing_portal/sessions",
    new URLSearchParams({ customer: p.stripeCustomerId, return_url: origin }),
  );
  res.json({ url: session.url });
});
app.post("/api/keys", async (req, res) => {
  const key = z
    .object({
      kty: z.literal("EC"),
      crv: z.literal("P-256"),
      x: z.string().min(40).max(50),
      y: z.string().min(40).max(50),
      ext: z.boolean().optional(),
      key_ops: z.array(z.string()).optional(),
    })
    .parse(req.body);
  await transact((s) => {
    const me = s.people.find((p) => p.id === res.locals.uid);
    if (!me) throw Error("Profile missing");
    if (
      me.publicKey &&
      JSON.stringify([me.publicKey.x, me.publicKey.y]) !==
        JSON.stringify([key.x, key.y])
    )
      throw Error(
        "This account already has a chat key on another browser. Key recovery is not yet supported.",
      );
    me.publicKey = key;
  });
  push();
  res.json({ ok: true });
});
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});
app.post("/api/avatar", avatarUpload.single("photo"), async (req, res) => {
  if (!req.file) throw Error("Choose a JPEG, PNG, or WebP image under 4 MB.");
  const bytes = req.file.buffer;
  const valid =
    (bytes[0] === 0xff && bytes[1] === 0xd8) ||
    bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ||
    (bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP");
  if (!valid) throw Error("This file is not a supported image.");
  const uid = res.locals.uid,
    filename = randomUUID() + ".webp";
  const source = path.join(avatarDir, randomUUID()),
    output = path.join(avatarDir, filename);
  try {
    await writeFile(source, bytes, { mode: 0o600 });
    await execFileAsync(
      "magick",
      [
        source,
        "-auto-orient",
        "-strip",
        "-thumbnail",
        "256x256^",
        "-gravity",
        "center",
        "-extent",
        "256x256",
        "-quality",
        "80",
        output,
      ],
      {
        timeout: 10000,
        maxBuffer: 4096,
        env: {
          ...process.env,
          MAGICK_MEMORY_LIMIT: "64MiB",
          MAGICK_MAP_LIMIT: "128MiB",
          MAGICK_DISK_LIMIT: "128MiB",
          MAGICK_TIME_LIMIT: "10",
        },
      },
    );
    const image = await readFile(output);
    if (
      image.subarray(0, 4).toString() !== "RIFF" ||
      image.subarray(8, 12).toString() !== "WEBP" ||
      image.length > 300000
    )
      throw Error("Avatar processing failed.");
    const old = await transact((s) => {
      const p = s.people.find((x) => x.id === uid);
      if (!p) throw Error("Profile missing");
      const previous = p.avatarFile;
      p.avatarFile = filename;
      return previous;
    });
    if (old) await unlink(path.join(avatarDir, old)).catch(() => {});
    push();
    res.json({ ok: true });
  } finally {
    await unlink(source).catch(() => {});
    if (!res.headersSent) await unlink(output).catch(() => {});
  }
});
app.get("/api/avatar/:id", async (req, res) => {
  const uid = res.locals.uid;
  const file = await transact((s) => {
    const p = s.people.find((x) => x.id === String(req.params.id));
    const me = s.people.find((x) => x.id === uid);
    if (!p || !me) return null;
    if (p.id !== uid) {
      if (
        s.blocks.some(
          (b) =>
            (b.from === uid && b.to === p.id) ||
            (b.from === p.id && b.to === uid),
        )
      )
        return null;
      const mySuburb = suburbAt(me.lat, me.lng);
      const discoverable =
        p.visibility === "public" &&
        !!mySuburb &&
        me.sharing &&
        p.sharing &&
        (demo || me.updatedAt > Date.now() - 120000) &&
        (demo || p.updatedAt > Date.now() - 120000) &&
        mySuburb.code === suburbAt(p.lat, p.lng)?.code &&
        commonTraits(me, p).length > 0;
      if (
        !isFriend(s, uid, p.id) &&
        !acceptedChatRequest(s, uid, p.id) &&
        !discoverable
      )
        return null;
    }
    return p.avatarFile || null;
  });
  if (!file) return res.status(404).end();
  res.type("image/webp").send(await readFile(path.join(avatarDir, file)));
});
const upload = multer({
  storage: multer.diskStorage({
    destination: photoDir,
    filename: (_, __, cb) => cb(null, randomUUID()),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_, file, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});
app.post("/api/requests", upload.single("photo"), async (req, res) => {
  let keep = false;
  try {
    if (!req.file) throw Error("Choose a JPEG, PNG, or WebP photo under 8 MB.");
    const input = z
      .object({
        to: z.string().min(1).max(100),
        adult: z.literal("true"),
        consent: z.literal("true"),
      })
      .parse(req.body);
    const bytes = await readFile(req.file.path);
    if (
      !(bytes[0] === 0xff && bytes[1] === 0xd8) &&
      bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" &&
      !(
        bytes.subarray(0, 4).toString() === "RIFF" &&
        bytes.subarray(8, 12).toString() === "WEBP"
      )
    )
      throw Error("This file is not a supported image.");
    let faceCount: number | undefined,
      confidence = 0;
    let reason = demo
      ? "Demo upload: waiting for manual review. No AI result is simulated."
      : "Waiting for manual review";
    if (process.env.FACE_VERIFIER_URL) {
      try {
        const data = new FormData();
        data.set(
          "photo",
          new Blob([bytes], { type: req.file.mimetype }),
          "photo",
        );
        const r = await fetch(process.env.FACE_VERIFIER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.FACE_VERIFIER_TOKEN || ""}`,
          },
          body: data,
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) throw Error("Detector unavailable");
        const result = z
          .object({
            faceCount: z.number().int().min(0),
            confidence: z.number().min(0).max(1),
          })
          .parse(await r.json());
        faceCount = result.faceCount;
        confidence = result.confidence;
        reason =
          faceCount === 2 && confidence >= 0.95
            ? "Two clear faces detected. Awaiting your friend’s acceptance."
            : "Photo needs a human review.";
      } catch {
        reason = "Automatic check unavailable. Queued for human review.";
      }
    }
    const request = await transact((s) => {
      const me = s.people.find((p) => p.id === res.locals.uid),
        to = s.people.find((p) => p.id === input.to);
      if (!me?.adult || !to?.adult)
        throw Error(
          "Both people need an adult account. Check your friend’s Circle ID.",
        );
      if (me.id === to.id) throw Error("Choose another person");
      if (isFriend(s, me.id, to.id)) throw Error("You are already friends");
      if (
        s.blocks.some(
          (b) =>
            (b.from === me.id && b.to === to.id) ||
            (b.from === to.id && b.to === me.id),
        )
      )
        throw Error("This request cannot be sent");
      if (
        s.requests.some(
          (r) =>
            ((r.from === me.id && r.to === to.id) ||
              (r.from === to.id && r.to === me.id)) &&
            ["review", "pending"].includes(r.state),
        )
      )
        throw Error("A request is already waiting");
      const r = {
        id: randomUUID(),
        from: me.id,
        to: to.id,
        state:
          faceCount === 2 && confidence >= 0.95
            ? ("pending" as const)
            : ("review" as const),
        createdAt: Date.now(),
        photo: req.file!.filename,
        faceCount,
        reason,
      };
      s.requests.push(r);
      return r;
    });
    keep = true;
    push();
    const { photo, ...safe } = request;
    res.json(safe);
  } finally {
    if (!keep && req.file) await unlink(req.file.path).catch(() => {});
  }
});
app.post("/api/requests/:id/respond", async (req, res) => {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  await transact(async (s) => {
    const r = s.requests.find((r) => r.id === req.params.id);
    if (!r || r.to !== res.locals.uid || r.state !== "pending")
      throw Error("This request is not ready to accept");
    if (
      s.blocks.some(
        (b) =>
          (b.from === r.from && b.to === r.to) ||
          (b.from === r.to && b.to === r.from),
      )
    )
      throw Error("This request is no longer available");
    r.state = accept ? "accepted" : "rejected";
    if (accept)
      s.friendships.push({
        a: r.from,
        b: r.to,
        since: Date.now(),
        requestId: r.id,
      });
    if (r.photo) {
      await unlink(path.join(photoDir, r.photo)).catch(() => {});
      delete r.photo;
    }
  });
  push();
  res.json({ ok: true });
});
app.post("/api/chat-requests/:id", async (req, res) => {
  await transact((s) => {
    const from = s.people.find((p) => p.id === res.locals.uid);
    const to = s.people.find((p) => p.id === String(req.params.id));
    if (!from || !to || from.id === to.id || isFriend(s, from.id, to.id))
      throw Error("Chat request unavailable");
    if (
      !from.sharing ||
      !to.sharing ||
      (!demo &&
        (from.updatedAt < Date.now() - 120000 ||
          to.updatedAt < Date.now() - 120000))
    )
      throw Error("Both people must be sharing a fresh location");
    const suburb = suburbAt(from.lat, from.lng);
    if (
      !suburb ||
      suburb.code !== suburbAt(to.lat, to.lng)?.code ||
      to.visibility !== "public" ||
      !commonTraits(from, to).length
    )
      throw Error("This profile is not discoverable in your suburb");
    if (
      s.blocks.some(
        (b) =>
          (b.from === from.id && b.to === to.id) ||
          (b.from === to.id && b.to === from.id),
      )
    )
      throw Error("Chat request unavailable");
    if (
      (s.chatRequests || []).some(
        (r) =>
          (r.from === from.id && r.to === to.id) ||
          (r.from === to.id && r.to === from.id),
      )
    )
      throw Error("A chat request already exists");
    s.chatRequests ??= [];
    s.chatRequests.push({
      id: randomUUID(),
      from: from.id,
      to: to.id,
      state: "pending",
      createdAt: Date.now(),
      remainingFrom: 300,
      remainingTo: 300,
    });
  });
  push();
  res.json({ ok: true });
});
app.post("/api/chat-requests/:id/respond", async (req, res) => {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  await transact((s) => {
    const request = s.chatRequests?.find(
      (r) =>
        r.id === req.params.id &&
        r.to === res.locals.uid &&
        r.state === "pending",
    );
    if (!request) throw Error("Chat request unavailable");
    if (
      s.blocks.some(
        (b) =>
          (b.from === request.from && b.to === request.to) ||
          (b.from === request.to && b.to === request.from),
      )
    )
      throw Error("Chat request unavailable");
    request.state = accept ? "accepted" : "declined";
  });
  push();
  res.json({ ok: true });
});
app.get("/api/messages/:friend", async (req, res) =>
  res.json(
    await transact((s) => {
      if (
        !isFriend(s, res.locals.uid, String(req.params.friend)) &&
        !acceptedChatRequest(s, res.locals.uid, String(req.params.friend))
      )
        throw Error("An accepted friendship or chat request is required");
      return s.messages.filter(
        (m) =>
          !m.groupId &&
          ((m.from === res.locals.uid && m.to === req.params.friend) ||
            (m.to === res.locals.uid && m.from === req.params.friend)),
      );
    }),
  ),
);
app.post("/api/messages/:friend", async (req, res) => {
  const input = z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("hi") }),
      z.object({
        kind: z.literal("encrypted"),
        ciphertext: z.string().min(1).max(16000),
        iv: z.string().min(12).max(64),
        senderKey: z.record(z.string(), z.unknown()),
        recipientKey: z.record(z.string(), z.unknown()),
      }),
    ])
    .parse(req.body);
  await transact((s) => {
    const uid = res.locals.uid,
      to = String(req.params.friend);
    const friends = isFriend(s, uid, to);
    const chatRequest = acceptedChatRequest(s, uid, to);
    if (!friends && !chatRequest)
      throw Error("An accepted friendship or chat request is required");
    const sender = s.people.find((p) => p.id === uid)!,
      recipient = s.people.find((p) => p.id === to)!;
    if (input.kind === "hi" && !friends)
      throw Error("Hi is for connected friends");
    if (
      input.kind === "hi" &&
      (!recipient.sharing ||
        distanceKm(sender, recipient) > 5 ||
        (!demo && recipient.updatedAt < Date.now() - 120000))
    )
      throw Error("Your friend needs to be nearby to receive a hi");
    if (
      input.kind === "encrypted" &&
      (!sender.publicKey ||
        !recipient.publicKey ||
        input.senderKey.x !== sender.publicKey.x ||
        input.senderKey.y !== sender.publicKey.y ||
        input.recipientKey.x !== recipient.publicKey.x ||
        input.recipientKey.y !== recipient.publicKey.y)
    )
      throw Error("Chat keys changed. Refresh before sending.");
    if (input.kind === "encrypted") {
      const cost = encryptedTextCost(input.ciphertext);
      if (friends) spendCharacters(sender, cost);
      else if (chatRequest) {
        const key = chatRequest.from === uid ? "remainingFrom" : "remainingTo";
        if (chatRequest[key] < cost)
          throw Error(
            "Your 300-character chat allowance is used up. Meet in person to connect.",
          );
        chatRequest[key] -= cost;
      }
    }
    s.messages.push({
      ...input,
      id: randomUUID(),
      from: uid,
      to,
      createdAt: Date.now(),
      ...(input.kind === "hi" ? { expiresAt: Date.now() + 7200000 } : {}),
    });
  });
  push();
  res.json({ ok: true });
});
app.post("/api/block/:id", async (req, res) => {
  await transact((s) => {
    const from = res.locals.uid,
      to = String(req.params.id);
    if (from === to) throw Error("Cannot block yourself");
    if (!s.blocks.some((b) => b.from === from && b.to === to))
      s.blocks.push({ from, to });
    for (const r of s.requests)
      if (
        ((r.from === from && r.to === to) ||
          (r.from === to && r.to === from)) &&
        ["review", "pending"].includes(r.state)
      ) {
        r.state = "rejected";
        r.reason = "Request no longer available";
      }
    for (const r of s.chatRequests || [])
      if ((r.from === from && r.to === to) || (r.from === to && r.to === from))
        r.state = "declined";
  });
  push();
  res.json({ ok: true });
});
app.post("/api/report/:id", async (req, res) => {
  const { reason } = z
    .object({ reason: z.string().trim().min(5).max(1000) })
    .parse(req.body);
  await transact((s) => {
    if (!isFriend(s, res.locals.uid, String(req.params.id)))
      throw Error("Friend not found");
    s.reports.push({
      id: randomUUID(),
      from: res.locals.uid,
      target: String(req.params.id),
      reason,
      createdAt: Date.now(),
      resolved: false,
    });
  });
  res.json({ ok: true });
});
groupRoutes(app, push);
mealRoutes(app, push);
app.use("/api/admin", (req, res, next) =>
  res.locals.admin
    ? next()
    : res.status(403).json({ error: "Reviewer access required" }),
);
app.get("/api/admin/session", (_, res) => res.json({ admin: true, demo }));
app.get("/api/admin/analytics", async (_, res) =>
  res.json(await transact((s) => adminAnalytics(s))),
);
app.get("/api/admin", async (_, res) =>
  res.json(
    await transact((s) => ({
      requests: s.requests.map(({ photo, ...r }) => ({
        ...r,
        hasPhoto: !!photo,
        fromName: s.people.find((p) => p.id === r.from)?.name,
        toName: s.people.find((p) => p.id === r.to)?.name,
      })),
      reports: s.reports,
    })),
  ),
);
app.get("/api/admin/photo/:id", async (req, res) => {
  const file = await transact(
    (s) =>
      s.requests.find(
        (r) =>
          r.id === req.params.id &&
          r.createdAt > Date.now() - 86400000 &&
          ["review", "pending"].includes(r.state),
      )?.photo,
  );
  if (!file) return res.status(404).end();
  const bytes = await readFile(path.join(photoDir, file));
  res.type(
    bytes.subarray(0, 4).toString() === "RIFF"
      ? "image/webp"
      : bytes[0] === 0x89
        ? "image/png"
        : "image/jpeg",
  );
  res.send(bytes);
});
app.post("/api/admin/review/:id", async (req, res) => {
  const input = z.object({ approve: z.boolean() }).parse(req.body);
  await transact((s) => {
    const r = s.requests.find((r) => r.id === req.params.id);
    if (!r || r.state !== "review")
      throw Error("Request not available for review");
    r.state = input.approve ? "pending" : "rejected";
    r.reason = input.approve
      ? "Approved by a reviewer. Awaiting friend’s acceptance."
      : "The photo could not be verified. Please try a clearer photo.";
  });
  push();
  res.json({ ok: true });
});
app.post("/api/admin/reports/:id/resolve", async (req, res) => {
  await transact((s) => {
    const r = s.reports.find((x) => x.id === req.params.id);
    if (!r) throw Error("Report not found");
    r.resolved = true;
  });
  res.json({ ok: true });
});
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint not found" }),
);
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (res.headersSent) return next(err);
    res.status(err instanceof InvalidCredentials ? 401 : 400).json({
      error:
        err instanceof z.ZodError
          ? "Please check the form fields."
          : err instanceof Error
            ? err.message
            : "Request failed",
    });
  },
);
app.use((req, res) =>
  web ? web.getRequestHandler()(req, res) : res.status(404).end(),
);
io.use(async (socket, next) => {
  try {
    const origin = socket.handshake.headers.origin;
    if (
      origin &&
      origin !==
        (process.env.PUBLIC_ORIGIN || `http://${socket.handshake.headers.host}`)
    )
      throw Error("Invalid origin");
    socket.data.uid = await identity(socket.handshake.headers.cookie);
    next();
  } catch {
    next(Error("Unauthorized"));
  }
});
setInterval(() => {
  push();
}, 30000).unref();
async function cleanup() {
  await transact(async (s) => {
    for (const r of s.requests)
      if (
        r.photo &&
        (r.createdAt + 86400000 < Date.now() ||
          ["accepted", "rejected"].includes(r.state))
      ) {
        await unlink(path.join(photoDir, r.photo)).catch(() => {});
        delete r.photo;
      }
  });
  for (const name of await readdir(photoDir)) {
    const file = path.join(photoDir, name);
    if ((await stat(file)).mtimeMs + 86400000 < Date.now())
      await unlink(file).catch(() => {});
  }
}
await cleanup();
setInterval(() => cleanup().catch(console.error), 60000).unref();
http.listen(port, host, () =>
  console.log(
    `FriendCircle (${demo ? "demo" : "live"}) http://${host}:${port}`,
  ),
);
