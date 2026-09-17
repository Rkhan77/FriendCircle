import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../lib/model";
import {
  tickMeetings,
  encryptedTextCost,
  spendCharacters,
} from "../lib/economy";

test("Ten continuous shared minutes reward both connected friends once, and separation stops the timer", () => {
  const s = seed(),
    a = s.people.find((p) => p.id === "you")!,
    b = s.people.find((p) => p.id === "mia")!;
  b.lat = a.lat;
  b.lng = a.lng;
  const start = 1000000;
  a.updatedAt = b.updatedAt = start;
  tickMeetings(s, start);
  for (let i = 1; i <= 20; i++) {
    const now = start + i * 30000;
    a.updatedAt = b.updatedAt = now;
    tickMeetings(s, now);
  }
  assert.equal(a.textCharacters, 200);
  assert.equal(b.textCharacters, 100);
  assert.equal(a.socialCredits, 5);
  assert.equal(b.socialCredits, 5);
  assert.equal(s.meetingAnalytics?.totalMeets, 1);
  assert.equal(s.meetingAnalytics?.totalDurationSeconds, 600);
  assert.equal(
    s.meetingAnalytics?.activityAtMeet[a.activity],
    a.activity === b.activity ? 2 : 1,
  );
  assert.equal(
    s.meetingAnalytics?.activityAtMeet[b.activity],
    a.activity === b.activity ? 2 : 1,
  );
  tickMeetings(s, start + 600000);
  assert.equal(a.socialCredits, 5);
  b.lat += 0.01;
  tickMeetings(s, start + 630000);
  assert.equal(s.meetings?.find((m) => m.b === "mia")?.active, false);
  assert.equal(s.meetingAnalytics?.totalMeets, 1);
});

test("Encrypted message cost follows authenticated byte length", () => {
  const p = seed().people[0];
  const ciphertext = Buffer.alloc(21).toString("base64");
  assert.equal(encryptedTextCost(ciphertext), 5);
  spendCharacters(p, 5);
  assert.equal(p.textCharacters, 95);
  assert.throws(() => spendCharacters(p, 96), /Meet a friend/);
});
