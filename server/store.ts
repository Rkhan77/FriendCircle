import { Pool } from "pg";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
import path from "node:path";
import { chmod, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { expire, seed, type State } from "../lib/model";
export const demo = process.env.APP_MODE !== "live";
const dataDir = path.resolve(process.env.DATA_DIR || ".data");
const pool = demo
  ? null
  : new Pool({ connectionString: process.env.DATABASE_URL });
let queue: Promise<unknown> = Promise.resolve();
export async function initStore() {
  if (pool) {
    await pool.query(await readFile("database/schema.sql", "utf8"));
  } else {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await chmod(dataDir, 0o700);
    let raw: string;
    try {
      raw = await readFile(path.join(dataDir, "demo.json"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeFile(path.join(dataDir, "demo.json"), JSON.stringify(seed()), {
        flag: "wx",
        mode: 0o600,
      });
      return;
    }
    const existing = JSON.parse(raw) as State;
    await chmod(path.join(dataDir, "demo.json"), 0o600);
    let changed = false;
    for (const p of existing.people)
      if (!p.visibility) {
        p.visibility = p.id === "ella" ? "public" : "private";
        changed = true;
      }
    if (!existing.mealOffers) {
      existing.mealOffers = seed().mealOffers;
      changed = true;
    }
    if (!existing.mealOffers?.some((o) => o.id === "demo-circle-kitchen")) {
      existing.mealOffers ??= [];
      existing.mealOffers.push(
        seed().mealOffers!.find((o) => o.id === "demo-circle-kitchen")!,
      );
      changed = true;
    }
    const demoVenue = existing.mealOffers?.find((o) => o.id === "demo-circle-kitchen");
    for (const offer of existing.mealOffers || [])
      if (offer.active && offer.partnerConfirmedAt && !offer.venueApprovedAt && !offer.venueId) {
        offer.venueApprovedAt = offer.partnerConfirmedAt;
        changed = true;
      }
    if (demoVenue && !demoVenue.redemptionLimit) {
      demoVenue.redemptionLimit = 100;
      changed = true;
    }
    if (
      demoVenue &&
      ((demoVenue.lat === -31.9529 && demoVenue.lng === 115.862) ||
        (demoVenue.lat === -31.9535 && demoVenue.lng === 115.871))
    ) {
      demoVenue.lat = -31.9535;
      demoVenue.lng = 115.858;
      changed = true;
    }
    if (!existing.people.some((p) => p.id === "ruby")) {
      existing.people.push(seed().people.find((p) => p.id === "ruby")!);
      changed = true;
    }
    const alex = existing.people.find((p) => p.id === "you");
    for (const person of existing.people) {
      const legacy = person as typeof person & { fist?: number };
      if (legacy.socialCredits === undefined && legacy.fist !== undefined) {
        legacy.socialCredits = legacy.fist;
        delete legacy.fist;
        changed = true;
      }
    }
    if (alex && !alex.hobbies?.length) {
      Object.assign(alex, {
        hobbies: ["coffee", "walking"],
        favoriteFoods: ["pizza"],
        movies: ["comedy"],
      });
      changed = true;
    }
    if (
      existing.people.some((p) => p.id === "mia") &&
      existing.people.some((p) => p.id === "ava") &&
      !existing.friendships.some(
        (f) =>
          (f.a === "mia" && f.b === "ava") || (f.a === "ava" && f.b === "mia"),
      )
    ) {
      existing.friendships.push({
        a: "mia",
        b: "ava",
        since: Date.now() - 86400000 * 30,
        requestId: "seed-mia-ava",
      });
      changed = true;
    }
    if (changed)
      await writeFile(
        path.join(dataDir, "demo.json"),
        JSON.stringify(existing),
      );
  }
}
export function transact<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
  const operation = queue.then(async () => {
    if (pool) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const { rows } = await c.query(
          "SELECT document FROM app_state WHERE id=1 FOR UPDATE",
        );
        const s = rows[0].document as State;
        expire(s);
        const result = await fn(s);
        await c.query("UPDATE app_state SET document=$1 WHERE id=1", [
          JSON.stringify(s),
        ]);
        for (const p of s.people) {
          await c.query(
            "INSERT INTO locations (user_id,position,sharing,updated_at) VALUES ($1,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,$4,to_timestamp($5 / 1000.0)) ON CONFLICT (user_id) DO UPDATE SET position=EXCLUDED.position,sharing=EXCLUDED.sharing,updated_at=EXCLUDED.updated_at",
            [p.id, p.lng, p.lat, p.sharing, p.updatedAt],
          );
        }
        await c.query("COMMIT");
        return result;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    }
    const s = JSON.parse(
      await readFile(path.join(dataDir, "demo.json"), "utf8"),
    ) as State;
    expire(s);
    const result = await fn(s);
    await writeFile(path.join(dataDir, "demo.tmp"), JSON.stringify(s), {
      mode: 0o600,
    });
    await rename(
      path.join(dataDir, "demo.tmp"),
      path.join(dataDir, "demo.json"),
    );
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}
export async function nearbyUserIds(
  me: { lat: number; lng: number },
  radiusKm: number,
): Promise<Set<string> | null> {
  if (!pool) return null;
  const { rows } = await pool.query(
    "SELECT user_id FROM locations WHERE sharing AND updated_at > now() - interval '2 minutes' AND ST_DWithin(position, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)",
    [me.lng, me.lat, radiusKm * 1000],
  );
  return new Set(rows.map((r) => r.user_id as string));
}
export async function closeStore() {
  await pool?.end();
}
