import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { distanceKm, mealBrowseKm, type MealOffer } from "../lib/model";
import {
  acceptMealInvitation,
  createMealGathering,
  respondMealGathering,
  gatheringDiscount,
  offerDiscountTiers,
  offerHasCapacity,
  remainingOfferRedemptions,
  redeemMealGathering,
  publishedOffer,
  validOfferDiscountTiers,
} from "../lib/meals";
import { demo, transact } from "./store";
import { ensureOfferAnalytics, recordOfferEvent } from "../lib/analytics";

const fields = z.object({
  restaurantName: z.string().trim().min(2).max(80).optional(),
  area: z.string().trim().min(2).max(80).optional(),
  address: z.string().trim().max(140).optional(),
  contactName: z.string().trim().min(2).max(100).optional(),
  contactEmail: z.email().max(254).optional(),
  contactPhone: z.string().trim().min(6).max(30).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  managerId: z.string().trim().min(2).max(100).optional(),
  discountPercent: z.number().int().min(1).max(50).optional(),
  redemptionLimit: z.number().int().min(1).max(1000000).optional(),
  groupDiscountTiers: z
    .array(
      z.object({
        diners: z.number().int().min(2).max(4),
        discountPercent: z.number().int().min(1).max(50),
      }),
    )
    .length(3)
    .optional(),
  terms: z.string().trim().min(10).max(500).optional(),
  fundedBy: z.enum(["restaurant", "friendcircle", "shared"]).optional(),
  validUntil: z.number().int().positive().optional(),
});
const createFields = fields
  .extend({
    restaurantName: z.string().trim().min(2).max(80),
    area: z.string().trim().min(2).max(80),
    contactName: z.string().trim().min(2).max(100),
    contactEmail: z.email().max(254),
    contactPhone: z.string().trim().min(6).max(30),
    redemptionLimit: z.number().int().min(1).max(1000000),
  })
  .refine(
    (x) => (x.lat === undefined) === (x.lng === undefined),
    "Provide both coordinates",
  );
const updateFields = fields
  .extend({
    active: z.boolean().optional(),
    partnerConfirmed: z.boolean().optional(),
  })
  .refine(
    (x) => (x.lat === undefined) === (x.lng === undefined),
    "Provide both coordinates",
  );

export function mealGatheringsForUser(
  s: import("../lib/model").State,
  uid: string,
) {
  return (s.mealGatherings || [])
    .filter(
      (g) =>
        g.hostId === uid || g.invites.some((invite) => invite.userId === uid),
    )
    .slice(-30)
    .map((g) => {
      const myStatus =
        g.hostId === uid
          ? "host"
          : g.invites.find((invite) => invite.userId === uid)?.state;
      const acceptedFriends = g.invites.filter(
        (invite) => invite.state === "accepted",
      ).length;
      return {
        id: g.id,
        offerId: g.offerId,
        hostName: s.people.find((p) => p.id === g.hostId)?.name || "A friend",
        invitedCount: g.invites.length,
        acceptedFriends,
        myStatus,
        discountPercent: gatheringDiscount(g),
        discountTiers: g.discountTiers,
        code:
          (myStatus === "host" || myStatus === "accepted") &&
          acceptedFriends > 0
            ? g.code
            : undefined,
        expiresAt: s.mealOffers?.some(
          (offer) =>
            offer.id === g.offerId &&
            publishedOffer(offer) &&
            offerHasCapacity(s, offer),
        )
          ? g.expiresAt
          : Math.min(g.expiresAt, Date.now()),
        redeemedAt: g.redeemedAt,
      };
    });
}

export function mealRoutes(app: Express, push: () => void) {
  app.post("/api/meals/gatherings", async (req, res) => {
    const { offerId, friends } = z
      .object({
        offerId: z.string().min(1),
        friends: z.array(z.string().min(1)).min(1).max(7),
      })
      .parse(req.body);
    const gathering = await transact((s) => {
      if (
        !mealOffersForUser(s, res.locals.uid).some(
          (offer) => offer.id === offerId,
        )
      )
        throw Error(
          `This restaurant is not offering within ${mealBrowseKm} km of you.`,
        );
      return createMealGathering(s, offerId, res.locals.uid, friends);
    });
    push();
    res.json({ id: gathering.id, expiresAt: gathering.expiresAt });
  });
  app.post("/api/meals/gatherings/:id/respond", async (req, res) => {
    const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    await transact((s) =>
      respondMealGathering(s, req.params.id, res.locals.uid, accept),
    );
    push();
    res.json({ ok: true });
  });
  app.post("/api/meal-invitations/:id/accept", async (req, res) => {
    if (demo)
      throw Error(
        "Illustrative demo locations cannot accept restaurant offers.",
      );
    const v = await transact((s) =>
      acceptMealInvitation(s, req.params.id, res.locals.uid),
    );
    push();
    res.json(v);
  });
  app.get("/api/meal-vouchers", async (_, res) =>
    res.json(
      await transact((s) =>
        (s.mealVouchers || [])
          .filter((v) => v.a === res.locals.uid || v.b === res.locals.uid)
          .map((v) => ({
            ...v,
            restaurantName: s.mealOffers?.find((o) => o.id === v.offerId)
              ?.restaurantName,
          })),
      ),
    ),
  );
  app.get("/api/meals/merchant", async (_, res) => {
    const ownerId = res.locals.partnerUid;
    if (!ownerId) return res.status(403).json({ error: "Restaurant owner access required" });
    const assigned = await transact((s) => (s.mealOffers || []).some((offer) => !offer.deletedAt && offer.managerId === ownerId));
    if (!assigned) return res.status(403).json({ error: "Restaurant owner access required" });
    return res.json(
      await transact((s) => ({
        offers: (s.mealOffers || [])
          .filter(
            (o) =>
              !o.deletedAt &&
              o.managerId === ownerId,
          )
          .map((o) => ({
            id: o.id,
            restaurantName: o.restaurantName,
            area: o.area,
            active: publishedOffer(o) && offerHasCapacity(s, o),
            redemptionLimit: o.redemptionLimit,
            remainingRedemptions: remainingOfferRedemptions(s, o),
          })),
        redeemed: [
          ...(s.mealVouchers || [])
            .filter(
              (v) =>
                v.redeemedAt &&
                s.mealOffers?.some(
                  (o) => o.id === v.offerId && o.managerId === ownerId,
                ),
            )
            .slice(-30)
            .map((v) => ({
              code: v.code,
              redeemedAt: v.redeemedAt,
              restaurantName: s.mealOffers?.find((o) => o.id === v.offerId)
                ?.restaurantName,
            })),
          ...(s.mealGatherings || [])
            .filter(
              (g) =>
                g.redeemedAt &&
                s.mealOffers?.some(
                  (o) => o.id === g.offerId && o.managerId === ownerId,
                ),
            )
            .map((g) => ({
              code: g.code,
              redeemedAt: g.redeemedAt,
              restaurantName: s.mealOffers?.find((o) => o.id === g.offerId)
                ?.restaurantName,
            })),
        ]
          .sort((a, b) => (a.redeemedAt || 0) - (b.redeemedAt || 0))
          .slice(-30),
      })),
    );
  });
  app.post("/api/meals/redeem", async (req, res) => {
    const ownerId = res.locals.partnerUid;
    if (!ownerId) return res.status(403).json({ error: "Restaurant owner access required" });
    const { code } = z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-F0-9]{16}$/),
      })
      .parse(req.body);
    const result = await transact((s) => {
      const gathering = s.mealGatherings?.find((g) => g.code === code);
      if (gathering) {
        const offer = s.mealOffers?.find((o) => o.id === gathering.offerId);
        if (
          demo ||
          !offer ||
          !publishedOffer(offer) ||
          offer.managerId !== ownerId
        )
          throw Error("Group offer unavailable for this restaurant");
        return redeemMealGathering(s, code);
      }
      const v = s.mealVouchers?.find((x) => x.code === code),
        o = s.mealOffers?.find((x) => x.id === v?.offerId);
      if (
        !v ||
        !o ||
        !publishedOffer(o) ||
        o.managerId !== ownerId
      )
        throw Error("Voucher not found for this restaurant");
      if (v.redeemedAt || v.expiresAt <= Date.now())
        throw Error("Voucher has expired or was already redeemed");
      if (!offerHasCapacity(s, o))
        throw Error("This restaurant has reached its redemption limit.");
      ensureOfferAnalytics(s);
      v.redeemedAt = Date.now();
      recordOfferEvent(s, o.id, "redeemed");
      return {
        restaurantName: o.restaurantName,
        discountPercent: v.discountPercent,
        terms: v.terms,
        diners: [
          s.people.find((p) => p.id === v.a)?.name,
          s.people.find((p) => p.id === v.b)?.name,
        ],
        redeemedAt: v.redeemedAt,
      };
    });
    push();
    res.json(result);
  });
  app.get("/api/admin/meal-offers", async (_, res) => {
    if (!res.locals.admin)
      return res.status(403).json({ error: "Reviewer access required" });
    res.json(
      await transact((s) => (s.mealOffers || []).filter((o) => !o.deletedAt)),
    );
  });
  app.post("/api/admin/meal-offers", async (req, res) => {
    if (!res.locals.admin)
      return res.status(403).json({ error: "Reviewer access required" });
    const input = createFields.parse(req.body);
    const o = await transact((s) => {
      const item: MealOffer = {
        ...input,
        id: randomUUID(),
        active: false,
        createdAt: Date.now(),
      };
      s.mealOffers ??= [];
      s.mealOffers.push(item);
      return item;
    });
    push();
    res.json(o);
  });
  app.patch("/api/admin/meal-offers/:id", async (req, res) => {
    if (!res.locals.admin)
      return res.status(403).json({ error: "Reviewer access required" });
    const input = updateFields.parse(req.body);
    await transact((s) => {
      const o = s.mealOffers?.find((x) => x.id === req.params.id);
      if (!o || o.deletedAt) throw Error("Restaurant draft not found");
      const { active, partnerConfirmed, ...updates } = input;
      if (
        o.active &&
        Object.keys(updates).length &&
        !partnerConfirmed &&
        active !== false
      )
        throw Error(
          "Reconfirm written partner approval when changing a published offer.",
        );
      Object.assign(o, updates);
      if (
        o.redemptionLimit !== undefined &&
        o.redemptionLimit <
          (ensureOfferAnalytics(s).byOffer[o.id]?.redeemed || 0)
      )
        throw Error(
          "The redemption limit cannot be below offers already redeemed.",
        );
      if (!validOfferDiscountTiers(o))
        throw Error(
          "Set ascending discounts for 2, 3 and 4+ diners; the first must equal the base discount.",
        );
      if (partnerConfirmed && o.active) o.partnerConfirmedAt = Date.now();
      if (active === false) o.active = false;
      if (active === true) {
        if (!partnerConfirmed)
          throw Error(
            "Confirm written partner approval before publishing a discount.",
          );
        if (!s.people.some((p) => p.id === o.managerId) && !s.partnerInvites?.some((invite) => invite.offerId === o.id && invite.managerId === o.managerId && invite.acceptedAt))
          throw Error(
            "Assign an existing staff account or have the partner accept their invitation before publishing.",
          );
        o.partnerConfirmedAt = Date.now();
        if (!o.venueId) o.venueApprovedAt = Date.now();
        o.active = true;
        if (!publishedOffer(o))
          throw Error(
            "Set location, manager, discount, funding, and full terms before publishing.",
          );
      }
    });
    push();
    res.json({ ok: true });
  });
  app.delete("/api/admin/meal-offers/:id", async (req, res) => {
    if (!res.locals.admin)
      return res.status(403).json({ error: "Platform admin access required" });
    await transact((s) => {
      const offer = s.mealOffers?.find(
        (o) => o.id === req.params.id && !o.deletedAt,
      );
      if (!offer) throw Error("Restaurant not found");
      const now = Date.now();
      offer.active = false;
      offer.deletedAt = now;
      for (const invite of s.mealInvitations || [])
        if (
          invite.offerId === offer.id &&
          !invite.acceptedAt &&
          invite.expiresAt > now
        )
          invite.expiresAt = now;
      for (const voucher of s.mealVouchers || [])
        if (
          voucher.offerId === offer.id &&
          !voucher.redeemedAt &&
          voucher.expiresAt > now
        )
          voucher.expiresAt = now;
      for (const gathering of s.mealGatherings || [])
        if (gathering.offerId === offer.id && !gathering.redeemedAt)
          gathering.expiresAt = now;
    });
    push();
    res.json({ ok: true });
  });
}

export function mealOffersForUser(
  s: import("../lib/model").State,
  uid: string,
  now = Date.now(),
) {
  const me = s.people.find((p) => p.id === uid);
  if (!me?.sharing || (!demo && me.updatedAt <= now - 120000)) return [];
  return (s.mealOffers || [])
    .filter((o) => publishedOffer(o, now) && offerHasCapacity(s, o))
    .map((offer) => ({
      offer,
      distance: distanceKm(me, offer as { lat: number; lng: number }),
    }))
    .filter(({ distance }) => distance <= mealBrowseKm)
    .sort((a, b) => a.distance - b.distance)
    .map(({ offer: o, distance }) => {
      const {
        managerId,
        contactName,
        contactEmail,
        contactPhone,
        partnerConfirmedAt,
        fundedBy,
        active,
        createdAt,
        ...safe
      } = o;
      return {
        ...safe,
        groupDiscountTiers: offerDiscountTiers(o),
        remainingRedemptions: remainingOfferRedemptions(s, o),
        distance: Math.round(distance * 10) / 10,
      };
    });
}
