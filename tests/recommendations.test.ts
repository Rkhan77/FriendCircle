import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../lib/model";
import { recommendedMealFriends } from "../lib/recommendations";

test("Meal invitation suggestions rank actual interaction metadata and stay empty for a new circle", () => {
  const state = seed(), now = Date.now();
  assert.deepEqual(recommendedMealFriends(state, "you", ["mia", "james"], now), []);
  state.messages.push({ id: "m1", from: "you", to: "james", kind: "hi", createdAt: now });
  state.meetings = [{ a: "you", b: "mia", startedAt: now - 600000, lastTickAt: now, seconds: 600, awardedSteps: 1, active: false }];
  assert.deepEqual(recommendedMealFriends(state, "you", ["james", "mia"], now), ["mia", "james"]);
  state.messages.push({ id: "old", from: "you", to: "leo", kind: "hi", createdAt: now - 100 * 86400000 });
  assert.equal(recommendedMealFriends(state, "you", ["leo"], now).length, 0);
});
