import type { Express } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { MealOffer, RestaurantChangeRequest } from "../lib/model";
import { validOfferDiscountTiers } from "../lib/meals";
import { ensureOfferAnalytics } from "../lib/analytics";
import { demo, transact } from "./store";

const tiers = z.array(z.object({
  diners: z.number().int().min(2).max(4),
  discountPercent: z.number().int().min(1).max(50),
})).length(3);
const offerFields = z.object({
  redemptionLimit: z.number().int().min(1).max(1_000_000),
  startsAt: z.number().int().nonnegative(),
  validUntil: z.number().int().positive(),
  groupDiscountTiers: tiers,
  active: z.boolean().optional(),
});
const restaurantFields = z.object({
  restaurantName: z.string().trim().min(2).max(80),
  area: z.string().trim().min(2).max(80),
  address: z.string().trim().max(140).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  reason: z.string().trim().min(5).max(500),
}).refine((value) => (value.lat === undefined) === (value.lng === undefined), {
  message: "Provide both latitude and longitude.",
});
const contactFields = z.object({
  contactName: z.string().trim().min(2).max(100),
  contactEmail: z.email().max(254),
  contactPhone: z.string().trim().min(6).max(30),
});
const venueIdOf = (offer: MealOffer) => offer.venueId || offer.id;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function partnerVenue(s: import("../lib/model").State, uid: string, id: string) {
  return s.mealOffers?.find((offer) =>
    offer.id === id && !offer.venueId && !offer.deletedAt && offer.managerId === uid,
  );
}
function validateOffer(input: z.infer<typeof offerFields>, current?: MealOffer, redeemed = 0) {
  if (input.validUntil <= Math.max(Date.now(), input.startsAt))
    throw Error("Expiration must be after the offer starts and in the future.");
  if (input.redemptionLimit < redeemed)
    throw Error("Offer limit cannot be below the number already redeemed.");
  const proposed = {
    ...(current || {}),
    discountPercent: input.groupDiscountTiers[0].discountPercent,
    groupDiscountTiers: input.groupDiscountTiers,
  } as MealOffer;
  if (!validOfferDiscountTiers(proposed))
    throw Error("Set increasing discounts for 2, 3, and 4+ diners.");
}

export function partnerRoutes(app: Express, push: () => void, origin: string) {
  app.post("/api/admin/meal-offers/:id/invite", async (req, res) => {
    if (!res.locals.admin) return res.status(403).json({ error: "Admin access required" });
    const offerId = String(req.params.id);
    const offer = await transact((s) => s.mealOffers?.find((item) => item.id === offerId && !item.deletedAt && !item.venueId));
    if (!offer?.contactEmail) return res.status(404).json({ error: "Set a restaurant contact email first." });
    if (demo) {
      const token = randomBytes(24).toString("hex");
      const managerId = `partner-${randomUUID()}`;
      await transact((s) => {
        const current = s.mealOffers?.find((item) => item.id === offerId && !item.deletedAt);
        if (!current) throw Error("Restaurant no longer exists.");
        current.managerId = managerId;
        s.partnerInvites ??= [];
        s.partnerInvites = s.partnerInvites.filter((invite) => invite.offerId !== offerId);
        s.partnerInvites.push({ offerId, managerId, tokenHash: digest(token), expiresAt: Date.now() + 86400000 });
      });
      push();
      return res.json({ demo: true, delivered: false, link: `${origin}/partner/accept?demo_invite=${token}` });
    }
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return res.status(503).json({ error: "Partner email invitations need a server-side Supabase secret key." });
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/invite?redirect_to=${encodeURIComponent(`${origin}/partner/accept`)}`, {
      method: "POST",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: offer.contactEmail, data: { friendcircle_role: "partner" } }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json();
    if (!response.ok || !payload.id) throw Error(payload.msg || payload.message || "Could not send partner invite.");
    await transact((s) => {
      const current = s.mealOffers?.find((item) => item.id === offerId && !item.deletedAt);
      if (!current) throw Error("Restaurant no longer exists.");
      current.managerId = payload.id;
      s.partnerInvites ??= [];
      s.partnerInvites = s.partnerInvites.filter((invite) => invite.offerId !== offerId);
      s.partnerInvites.push({ offerId, managerId: payload.id, expiresAt: Date.now() + 86400000 });
    });
    push();
    res.json({ delivered: true, email: offer.contactEmail });
  });

  app.get("/api/partner/session", async (_, res) => {
    const uid = res.locals.partnerUid;
    if (!uid) return res.status(403).json({ error: "Partner sign in required" });
    const hasVenue = await transact((s) => (s.mealOffers || []).some((offer) => !offer.deletedAt && offer.managerId === uid));
    if (!hasVenue) return res.status(403).json({ error: "No restaurant is assigned to this account." });
    res.json({ ok: true, demo });
  });
  app.get("/api/partner/overview", async (_, res) => {
    const uid = res.locals.partnerUid;
    if (!uid) return res.status(403).json({ error: "Partner sign in required" });
    const overview = await transact((s) => {
      const own = (s.mealOffers || []).filter((offer) => !offer.deletedAt && offer.managerId === uid);
      return {
        demo,
        restaurants: own.filter((offer) => !offer.venueId).map((venue) => ({
          id: venue.id,
          restaurantName: venue.restaurantName,
          area: venue.area,
          address: venue.address,
          lat: venue.lat,
          lng: venue.lng,
          contactName: venue.contactName,
          contactEmail: venue.contactEmail,
          contactPhone: venue.contactPhone,
          approved: !!venue.venueApprovedAt,
          offers: own.filter((offer) => venueIdOf(offer) === venue.id).map((offer) => ({
            id: offer.id,
            startsAt: offer.startsAt || 0,
            validUntil: offer.validUntil || 0,
            groupDiscountTiers: offer.groupDiscountTiers,
            redemptionLimit: offer.redemptionLimit,
            redeemed: ensureOfferAnalytics(s).byOffer[offer.id]?.redeemed || 0,
            active: offer.active,
          })),
        })),
        changeRequests: (s.restaurantChangeRequests || []).filter((request) => request.managerId === uid).slice(-20),
      };
    });
    if (!overview.restaurants.length) return res.status(403).json({ error: "No restaurant is assigned to this account." });
    res.json(overview);
  });
  app.patch("/api/partner/restaurants/:id/contact", async (req, res) => {
    const uid = res.locals.partnerUid;
    if (!uid) return res.status(403).json({ error: "Partner sign in required" });
    const input = contactFields.parse(req.body);
    await transact((s) => {
      const venue = partnerVenue(s, uid, String(req.params.id));
      if (!venue) throw Error("Restaurant not assigned to this account.");
      for (const offer of s.mealOffers || [])
        if (venueIdOf(offer) === venue.id) Object.assign(offer, input);
    });
    push();
    res.json({ ok: true });
  });
  app.post("/api/partner/restaurants/:id/change-requests", async (req, res) => {
    const uid = res.locals.partnerUid;
    if (!uid) return res.status(403).json({ error: "Partner sign in required" });
    const input = restaurantFields.parse(req.body);
    const request = await transact((s) => {
      const venue = partnerVenue(s, uid, String(req.params.id));
      if (!venue) throw Error("Restaurant not assigned to this account.");
      if (s.restaurantChangeRequests?.some((item) => item.venueId === venue.id && item.status === "pending"))
        throw Error("A change request is already awaiting admin review.");
      const item: RestaurantChangeRequest = { ...input, id: randomUUID(), venueId: venue.id, managerId: uid, status: "pending", createdAt: Date.now() };
      s.restaurantChangeRequests ??= [];
      s.restaurantChangeRequests.push(item);
      return item;
    });
    res.json(request);
  });
  app.get("/api/admin/restaurant-change-requests", async (_, res) => {
    if (!res.locals.admin) return res.status(403).json({ error: "Admin access required" });
    res.json(await transact((s) => (s.restaurantChangeRequests || []).slice(-100).reverse()));
  });
  app.post("/api/admin/restaurant-change-requests/:id/respond", async (req, res) => {
    if (!res.locals.admin) return res.status(403).json({ error: "Admin access required" });
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    await transact((s) => {
      const request = s.restaurantChangeRequests?.find((item) => item.id === req.params.id && item.status === "pending");
      if (!request) throw Error("Change request is no longer pending.");
      const venue = s.mealOffers?.find((item) => item.id === request.venueId && !item.deletedAt);
      if (!venue) throw Error("Restaurant no longer exists.");
      request.status = approve ? "approved" : "rejected";
      request.reviewedAt = Date.now();
      if (approve) for (const offer of s.mealOffers || [])
        if (venueIdOf(offer) === venue.id && !offer.deletedAt) {
          offer.restaurantName = request.restaurantName;
          offer.area = request.area;
          offer.address = request.address;
          if (request.lat !== undefined && request.lng !== undefined) {
            offer.lat = request.lat;
            offer.lng = request.lng;
          }
        }
    });
    push();
    res.json({ ok: true });
  });
  app.post("/api/partner/restaurants/:id/offers", async (req, res) => {
    const uid = res.locals.partnerUid;
    if (!uid) return res.status(403).json({ error: "Partner sign in required" });
    const input = offerFields.parse(req.body);
    validateOffer(input);
    const offer = await transact((s) => {
      const venue = partnerVenue(s, uid, String(req.params.id));
      if (!venue) throw Error("Restaurant not assigned to this account.");
      const item: MealOffer = {
        ...venue,
        id: randomUUID(),
        venueId: venue.id,
        createdAt: Date.now(),
        startsAt: input.startsAt,
        validUntil: input.validUntil,
        redemptionLimit: input.redemptionLimit,
        discountPercent: input.groupDiscountTiers[0].discountPercent,
        groupDiscountTiers: input.groupDiscountTiers,
        partnerConfirmedAt: Date.now(),
        active: !!venue.venueApprovedAt && input.active !== false,
      };
      s.mealOffers ??= [];
      s.mealOffers.push(item);
      return item;
    });
    push();
    res.json({ id: offer.id });
  });
  app.patch("/api/partner/offers/:id", async (req, res) => {
    const uid = res.locals.partnerUid;
    if (!uid) return res.status(403).json({ error: "Partner sign in required" });
    const input = offerFields.parse(req.body);
    await transact((s) => {
      const offer = s.mealOffers?.find((item) => item.id === req.params.id && !item.deletedAt && item.managerId === uid);
      if (!offer) throw Error("Offer not assigned to this account.");
      const venue = s.mealOffers?.find((item) => item.id === venueIdOf(offer) && !item.deletedAt);
      if (!venue || venue.managerId !== uid) throw Error("Restaurant no longer exists or is not assigned to this account.");
      validateOffer(input, offer, ensureOfferAnalytics(s).byOffer[offer.id]?.redeemed || 0);
      offer.startsAt = input.startsAt;
      offer.validUntil = input.validUntil;
      offer.redemptionLimit = input.redemptionLimit;
      offer.discountPercent = input.groupDiscountTiers[0].discountPercent;
      offer.groupDiscountTiers = input.groupDiscountTiers;
      offer.partnerConfirmedAt = Date.now();
      offer.active = !!venue.venueApprovedAt && input.active !== false;
    });
    push();
    res.json({ ok: true });
  });
}

export function findDemoPartnerInvite(s: import("../lib/model").State, token: string) {
  return s.partnerInvites?.find((invite) => invite.tokenHash === digest(token) && invite.expiresAt > Date.now());
}
