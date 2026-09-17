import { randomBytes, randomUUID } from "node:crypto";
import { ensureOfferAnalytics, recordOfferEvent } from "./analytics";
import {
  distanceKm,
  isFriend,
  type MealOffer,
  type MealInvitation,
  type MealVoucher,
  type MealGathering,
  type State,
} from "./model";
import { sameSuburb } from "./suburbs";

export const mealClaimKm = 2;
export const mealMeetKm = 0.05;
export const mealAcceptanceHours = 24;
export const voucherHours = 24;

export function offerDiscountTiers(o: MealOffer) {
  if (o.groupDiscountTiers?.length)
    return [...o.groupDiscountTiers].sort((a, b) => a.diners - b.diners);
  const base = o.discountPercent || 0;
  return [
    { diners: 2, discountPercent: base },
    { diners: 3, discountPercent: Math.min(50, base + 5) },
    { diners: 4, discountPercent: Math.min(50, base + 10) },
  ];
}
export function validOfferDiscountTiers(o: MealOffer) {
  const tiers = o.groupDiscountTiers;
  return (
    !tiers ||
    (tiers.length === 3 &&
      [2, 3, 4].every((diners, i) => tiers[i]?.diners === diners) &&
      tiers[0].discountPercent === o.discountPercent &&
      tiers.every(
        (tier, i) =>
          Number.isInteger(tier.discountPercent) &&
          tier.discountPercent >= 1 &&
          tier.discountPercent <= 50 &&
          (i === 0 || tier.discountPercent > tiers[i - 1].discountPercent),
      ))
  );
}

export function gatheringDiscount(g: MealGathering) {
  const diners =
    1 + g.invites.filter((invite) => invite.state === "accepted").length;
  return diners < 2
    ? 0
    : [...g.discountTiers]
        .filter((tier) => tier.diners <= diners)
        .sort((a, b) => b.diners - a.diners)[0]?.discountPercent || 0;
}

export function remainingOfferRedemptions(s: State, offer: MealOffer) {
  const redeemed = ensureOfferAnalytics(s).byOffer[offer.id]?.redeemed || 0;
  return Math.max(0, (offer.redemptionLimit || 0) - redeemed);
}

export function offerHasCapacity(s: State, offer: MealOffer) {
  return remainingOfferRedemptions(s, offer) > 0;
}

export function createMealGathering(
  s: State,
  offerId: string,
  hostId: string,
  friendIds: string[],
  now = Date.now(),
) {
  const offer = s.mealOffers?.find((o) => o.id === offerId);
  if (!offer || !publishedOffer(offer, now) || !offerHasCapacity(s, offer))
    throw Error("This restaurant offer is unavailable.");
  const unique = [...new Set(friendIds)];
  if (
    unique.length !== friendIds.length ||
    unique.length < 1 ||
    unique.length > 7
  )
    throw Error("Invite between one and seven different friends.");
  if (
    unique.some(
      (id) =>
        id === hostId ||
        !s.people.some((p) => p.id === id) ||
        !isFriend(s, hostId, id) ||
        s.blocks.some(
          (b) =>
            (b.from === hostId && b.to === id) ||
            (b.from === id && b.to === hostId),
        ),
    )
  )
    throw Error("Choose connected friends to invite.");
  if (
    s.mealGatherings?.some(
      (g) =>
        g.offerId === offerId &&
        g.hostId === hostId &&
        !g.redeemedAt &&
        g.expiresAt > now,
    )
  )
    throw Error("You already have an open meal invitation here.");
  const gathering: MealGathering = {
    id: randomUUID(),
    offerId,
    hostId,
    invites: unique.map((userId) => ({ userId, state: "pending" })),
    discountTiers: offerDiscountTiers(offer),
    terms: offer.terms!,
    createdAt: now,
    expiresAt: Math.min(now + mealAcceptanceHours * 3600000, offer.validUntil!),
  };
  ensureOfferAnalytics(s, now);
  s.mealGatherings ??= [];
  s.mealGatherings.push(gathering);
  for (const _ of unique) recordOfferEvent(s, offerId, "invitations", now);
  return gathering;
}

export function respondMealGathering(
  s: State,
  gatheringId: string,
  userId: string,
  accept: boolean,
  now = Date.now(),
) {
  const gathering = s.mealGatherings?.find((g) => g.id === gatheringId);
  const invite = gathering?.invites.find((i) => i.userId === userId);
  if (!gathering || !invite || invite.state !== "pending")
    throw Error("Meal invitation unavailable.");
  const offer = s.mealOffers?.find((o) => o.id === gathering.offerId);
  if (
    gathering.expiresAt <= now ||
    gathering.redeemedAt ||
    !offer ||
    !publishedOffer(offer, now) ||
    !offerHasCapacity(s, offer) ||
    !isFriend(s, gathering.hostId, userId)
  )
    throw Error("This meal invitation has expired or is unavailable.");
  invite.state = accept ? "accepted" : "declined";
  invite.respondedAt = now;
  if (accept) {
    gathering.code ??= randomBytes(8).toString("hex").toUpperCase();
    recordOfferEvent(s, gathering.offerId, "accepted", now);
  }
  return gathering;
}

export function redeemMealGathering(s: State, code: string, now = Date.now()) {
  const gathering = s.mealGatherings?.find((g) => g.code === code);
  const offer = s.mealOffers?.find((o) => o.id === gathering?.offerId);
  if (!gathering || !offer || !publishedOffer(offer, now))
    throw Error("Group offer unavailable for this restaurant");
  if (
    gathering.redeemedAt ||
    gathering.expiresAt <= now ||
    gatheringDiscount(gathering) <= 0
  )
    throw Error("Group offer has expired or was already redeemed");
  if (!offerHasCapacity(s, offer))
    throw Error("This restaurant has reached its redemption limit.");
  gathering.redeemedAt = now;
  recordOfferEvent(s, offer.id, "redeemed", now);
  return {
    restaurantName: offer.restaurantName,
    discountPercent: gatheringDiscount(gathering),
    terms: gathering.terms,
    diners: [
      gathering.hostId,
      ...gathering.invites
        .filter((invite) => invite.state === "accepted")
        .map((invite) => invite.userId),
    ].map((id) => s.people.find((p) => p.id === id)?.name),
    redeemedAt: now,
  };
}

export function publishedOffer(o: MealOffer, now = Date.now()) {
  return (
    o.active &&
    !o.deletedAt &&
    !!o.partnerConfirmedAt &&
    !!o.managerId &&
    !!o.fundedBy &&
    !!o.terms &&
    !!o.discountPercent &&
    o.discountPercent > 0 &&
    o.discountPercent <= 50 &&
    validOfferDiscountTiers(o) &&
    Number.isInteger(o.redemptionLimit) &&
    (o.redemptionLimit || 0) > 0 &&
    o.lat !== undefined &&
    o.lng !== undefined &&
    !!o.validUntil &&
    o.validUntil > now
  );
}

export function eligibleMealPair(
  s: State,
  o: MealOffer,
  aId: string,
  bId: string,
  now = Date.now(),
  localDemo = false,
) {
  if (
    localDemo ||
    !publishedOffer(o, now) ||
    !offerHasCapacity(s, o) ||
    !isFriend(s, aId, bId)
  )
    return false;
  const a = s.people.find((p) => p.id === aId),
    b = s.people.find((p) => p.id === bId);
  if (
    !a ||
    !b ||
    !a.sharing ||
    !b.sharing ||
    a.updatedAt <= now - 60000 ||
    b.updatedAt <= now - 60000
  )
    return false;
  if (
    distanceKm(a, b) > mealMeetKm ||
    !sameSuburb(a, o as { lat: number; lng: number }) ||
    !sameSuburb(b, o as { lat: number; lng: number }) ||
    distanceKm(a, o as { lat: number; lng: number }) > mealClaimKm ||
    distanceKm(b, o as { lat: number; lng: number }) > mealClaimKm
  )
    return false;
  return true;
}

export function syncMealInvitations(
  s: State,
  now = Date.now(),
  localDemo = false,
) {
  if (localDemo) return 0;
  s.mealInvitations ??= [];
  ensureOfferAnalytics(s, now);
  let created = 0;
  for (const offer of s.mealOffers || []) {
    if (!publishedOffer(offer, now) || !offerHasCapacity(s, offer)) continue;
    for (let i = 0; i < s.people.length; i++)
      for (let j = i + 1; j < s.people.length; j++) {
        const [a, b] = [s.people[i].id, s.people[j].id].sort();
        if (!eligibleMealPair(s, offer, a, b, now)) continue;
        if (
          s.mealInvitations.some(
            (v) =>
              v.offerId === offer.id &&
              v.a === a &&
              v.b === b &&
              v.createdAt > now - 86400000,
          )
        )
          continue;
        if (
          (s.mealVouchers || []).some(
            (v) =>
              v.offerId === offer.id &&
              v.a === a &&
              v.b === b &&
              !v.redeemedAt &&
              v.expiresAt > now,
          )
        )
          continue;
        const invitation: MealInvitation = {
          id: randomUUID(),
          offerId: offer.id,
          a,
          b,
          createdAt: now,
          expiresAt: Math.min(
            now + mealAcceptanceHours * 3600000,
            offer.validUntil!,
          ),
        };
        s.mealInvitations.push(invitation);
        recordOfferEvent(s, offer.id, "invitations", now);
        created++;
      }
  }
  return created;
}

export function acceptMealInvitation(
  s: State,
  invitationId: string,
  userId: string,
  now = Date.now(),
): MealVoucher {
  const invite = s.mealInvitations?.find((v) => v.id === invitationId);
  if (!invite || (invite.a !== userId && invite.b !== userId))
    throw Error("Meal invitation not found");
  if (invite.acceptedAt || invite.expiresAt <= now)
    throw Error("This meal invitation was already accepted or has expired.");
  const o = s.mealOffers?.find((v) => v.id === invite.offerId);
  if (
    !o ||
    !publishedOffer(o, now) ||
    !offerHasCapacity(s, o) ||
    !isFriend(s, invite.a, invite.b)
  )
    throw Error("This restaurant offer is no longer available.");
  ensureOfferAnalytics(s, now);
  s.mealVouchers ??= [];
  const code = randomBytes(8).toString("hex").toUpperCase();
  const v: MealVoucher = {
    id: randomUUID(),
    code,
    offerId: o.id,
    a: invite.a,
    b: invite.b,
    discountPercent: o.discountPercent!,
    terms: o.terms!,
    createdAt: now,
    expiresAt: Math.min(now + voucherHours * 3600000, o.validUntil!),
    inviteId: invite.id,
  };
  invite.acceptedAt = now;
  invite.acceptedBy = userId;
  invite.voucherId = v.id;
  s.mealVouchers.push(v);
  recordOfferEvent(s, o.id, "accepted", now);
  return v;
}
