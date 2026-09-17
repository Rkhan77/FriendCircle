import { test } from "node:test";
import assert from "node:assert/strict";
import { seed, type MealOffer } from "../lib/model";
import { adminAnalytics } from "../lib/analytics";
import {
  eligibleMealPair,
  syncMealInvitations,
  acceptMealInvitation,
  publishedOffer,
  createMealGathering,
  respondMealGathering,
  gatheringDiscount,
  redeemMealGathering,
  remainingOfferRedemptions,
} from "../lib/meals";

test("Accepted friends unlock configured group tiers and one shared redemption", () => {
  const s = seed();
  const now = Date.now();
  const gathering = createMealGathering(
    s,
    "demo-circle-kitchen",
    "you",
    ["mia", "james", "ava", "leo"],
    now,
  );
  assert.equal(gatheringDiscount(gathering), 0);
  assert.equal(gathering.expiresAt - now, 86400000);
  assert.equal(s.offerAnalytics?.invitations, 4);
  assert.throws(
    () => createMealGathering(s, "demo-circle-kitchen", "you", ["mia"], now),
    /already have an open/,
  );
  respondMealGathering(s, gathering.id, "mia", true, now + 1000);
  assert.equal(gatheringDiscount(gathering), 10);
  assert.match(gathering.code!, /^[A-F0-9]{16}$/);
  respondMealGathering(s, gathering.id, "james", true, now + 2000);
  assert.equal(gatheringDiscount(gathering), 15);
  respondMealGathering(s, gathering.id, "ava", true, now + 3000);
  assert.equal(gatheringDiscount(gathering), 20);
  respondMealGathering(s, gathering.id, "leo", true, now + 4000);
  assert.equal(gatheringDiscount(gathering), 20);
  assert.equal(s.offerAnalytics?.accepted, 4);
  const redeemed = redeemMealGathering(s, gathering.code!, now + 5000);
  assert.equal(redeemed.discountPercent, 20);
  assert.deepEqual(redeemed.diners, [
    "Alex Morgan",
    "Mia Chen",
    "James Wilson",
    "Ava Thompson",
    "Leo Martinez",
  ]);
  assert.equal(s.offerAnalytics?.redeemed, 1);
  assert.throws(
    () => redeemMealGathering(s, gathering.code!, now + 6000),
    /already redeemed/,
  );
});

test("Restaurant redemption limit is shared by group and pair offers", () => {
  const s = seed();
  const now = Date.now();
  const offer = s.mealOffers!.find((o) => o.id === "demo-circle-kitchen")!;
  offer.redemptionLimit = 1;
  const group = createMealGathering(s, offer.id, "you", ["mia"], now);
  const otherGroup = createMealGathering(s, offer.id, "james", ["you"], now);
  respondMealGathering(s, group.id, "mia", true, now + 1000);
  respondMealGathering(s, otherGroup.id, "you", true, now + 1000);
  redeemMealGathering(s, group.code!, now + 2000);
  assert.equal(remainingOfferRedemptions(s, offer), 0);
  assert.throws(
    () => redeemMealGathering(s, otherGroup.code!, now + 3000),
    /redemption limit/,
  );
  assert.throws(
    () => createMealGathering(s, offer.id, "james", ["you"], now + 3000),
    /unavailable/,
  );
});

test("A restaurant draft cannot be announced until all partner terms are approved", () => {
  const draft = seed().mealOffers![0];
  assert.equal(draft.restaurantName, "Hungry Jack's");
  assert.match(draft.area, /Carlisle/);
  assert.equal(publishedOffer(draft), false);
  assert.equal(
    publishedOffer({ ...draft, active: true, discountPercent: 10 }),
    false,
  );
});

test("Close connected friends receive one shared map invitation with a 24-hour acceptance deadline", () => {
  const s = seed();
  const now = Date.now();
  const a = s.people.find((p) => p.id === "you")!;
  const b = s.people.find((p) => p.id === "mia")!;
  b.lat = a.lat;
  b.lng = a.lng;
  a.updatedAt = b.updatedAt = now;
  const offer: MealOffer = {
    id: "approved-test-venue",
    restaurantName: "Test restaurant",
    area: "Test area",
    lat: a.lat,
    lng: a.lng,
    managerId: "staff-test",
    discountPercent: 10,
    redemptionLimit: 3,
    terms: "Ten percent off one eligible meal for two diners.",
    fundedBy: "restaurant",
    partnerConfirmedAt: now,
    validUntil: now + 86400000 * 3,
    active: true,
    createdAt: now,
  };
  s.mealOffers = [offer];
  assert.equal(eligibleMealPair(s, offer, "you", "mia", now), true);
  assert.equal(syncMealInvitations(s, now, true), 0);
  assert.equal(syncMealInvitations(s, now), 1);
  assert.equal(s.offerAnalytics?.invitations, 1);
  const invitation = s.mealInvitations![0];
  assert.deepEqual([invitation.a, invitation.b], ["mia", "you"]);
  assert.equal(invitation.expiresAt - now, 86400000);
  assert.equal(syncMealInvitations(s, now + 1000), 0);
  const code = acceptMealInvitation(s, invitation.id, "mia", now + 1000);
  assert.match(code.code, /^[A-F0-9]{16}$/);
  assert.equal(code.expiresAt - (now + 1000), 86400000);
  assert.equal(invitation.acceptedBy, "mia");
  assert.equal(invitation.voucherId, code.id);
  assert.equal(s.mealVouchers?.length, 1);
  assert.equal(s.offerAnalytics?.accepted, 1);
  assert.equal(adminAnalytics(s, now + 1000).offers.acceptanceRate, 100);
  assert.throws(
    () => acceptMealInvitation(s, invitation.id, "you", now + 2000),
    /already accepted/,
  );
  assert.throws(
    () => acceptMealInvitation(s, invitation.id, "ella", now + 2000),
    /not found/,
  );
  b.lat += 0.01;
  assert.equal(eligibleMealPair(s, offer, "you", "mia", now), false);
  b.lat = a.lat;
  b.updatedAt = now - 60001;
  assert.equal(eligibleMealPair(s, offer, "you", "mia", now), false);
});

test("A shared invitation expires before either friend accepts", () => {
  const s = seed(),
    now = Date.now();
  s.mealInvitations = [
    {
      id: "expired",
      offerId: "draft-hj-carlisle",
      a: "mia",
      b: "you",
      createdAt: now - 86400001,
      expiresAt: now - 1,
    },
  ];
  assert.throws(
    () => acceptMealInvitation(s, "expired", "you", now),
    /expired/,
  );
});
