import { distanceKm, isFriend, type State } from "./model";
import {
  ensureMeetingAnalytics,
  recordMeetStart,
  recordMeetDuration,
} from "./analytics";

// Operators can tune these values without changing code. Both friends must send
// fresh location samples; stale or separated pairs stop earning credit.
function configuredPositive(key: string, fallback: number) {
  const n = Number(process.env[key] || fallback);
  if (!Number.isInteger(n) || n <= 0)
    throw Error(`${key} must be a positive integer`);
  return n;
}
export const rewardMinutes = configuredPositive("REWARD_MINUTES", 10);
export const rewardCharacters = configuredPositive("REWARD_CHARACTERS", 100);
export const rewardSocialCredits = configuredPositive(
  "REWARD_SOCIAL_CREDITS",
  5,
);
export function tickMeetings(s: State, now = Date.now(), localDemo = false) {
  s.meetings ??= [];
  ensureMeetingAnalytics(s, now);
  const fresh = (p: State["people"][number]) =>
    p.sharing && p.updatedAt > now - 60000;
  const pairs = new Set<string>();
  for (let i = 0; i < s.people.length; i++)
    for (let j = i + 1; j < s.people.length; j++) {
      const a = s.people[i],
        b = s.people[j];
      if (!isFriend(s, a.id, b.id)) continue;
      const key = [a.id, b.id].sort().join(":");
      const existing = s.meetings.find(
        (m) => [m.a, m.b].sort().join(":") === key,
      );
      // Demo never awards currency from the fictional seeded locations.
      const together =
        !localDemo && fresh(a) && fresh(b) && distanceKm(a, b) <= 0.05;
      if (!together) {
        if (existing) existing.active = false;
        continue;
      }
      pairs.add(key);
      if (!existing || !existing.active || now - existing.lastTickAt > 45000) {
        recordMeetStart(s, a, b, now);
        if (existing)
          Object.assign(existing, {
            startedAt: now,
            lastTickAt: now,
            seconds: 0,
            awardedSteps: 0,
            active: true,
          });
        else
          s.meetings.push({
            a: a.id,
            b: b.id,
            startedAt: now,
            lastTickAt: now,
            seconds: 0,
            awardedSteps: 0,
            active: true,
          });
        continue;
      }
      const elapsed = Math.max(
        0,
        Math.min(35, (now - existing.lastTickAt) / 1000),
      );
      existing.seconds += elapsed;
      recordMeetDuration(s, elapsed, now);
      existing.lastTickAt = now;
      const stepSeconds = rewardMinutes * 60;
      if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) continue;
      const earned =
        Math.floor(existing.seconds / stepSeconds) - existing.awardedSteps;
      if (earned > 0) {
        for (const p of [a, b]) {
          p.textCharacters =
            (p.textCharacters || 0) + earned * rewardCharacters;
          p.socialCredits =
            (p.socialCredits || 0) + earned * rewardSocialCredits;
        }
        existing.awardedSteps += earned;
      }
    }
  for (const m of s.meetings)
    if (!pairs.has([m.a, m.b].sort().join(":"))) m.active = false;
}
// AES-GCM authenticates the encrypted payload length. UTF-8 bytes are charged
// because the server cannot inspect end-to-end encrypted character content.
export function encryptedTextCost(ciphertext: string) {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      ciphertext,
    )
  )
    throw Error("Invalid encrypted message");
  const bytes = Buffer.from(ciphertext, "base64").length;
  if (bytes <= 16 || bytes > 4016)
    throw Error("Message length is outside the allowed range");
  return bytes - 16;
}
export function spendCharacters(p: State["people"][number], amount: number) {
  if ((p.textCharacters || 0) < amount)
    throw Error(
      `Meet a friend to earn more chat characters. This message needs ${amount}.`,
    );
  p.textCharacters = (p.textCharacters || 0) - amount;
}
