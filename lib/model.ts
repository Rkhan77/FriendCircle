export const activities = {
  coffee: { emoji: "☕", label: "Hanging out", color: "#c98e45" },
  running: { emoji: "🏃", label: "Running", color: "#70a579" },
  working: { emoji: "💻", label: "Working", color: "#7b85c8" },
  gaming: { emoji: "🎮", label: "Gaming", color: "#ad7db9" },
  sleeping: { emoji: "🌙", label: "Sleeping", color: "#788ab7" },
};
export type Activity = keyof typeof activities;
export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
  activity: Activity;
  status: string;
  statusEmoji?: string;
  lat: number;
  lng: number;
  sharing: boolean;
  updatedAt: number;
  publicKey?: JsonWebKey;
  adult: boolean;
  visibility?: "public" | "private";
  avatarFile?: string;
  bio?: string;
  hobbies?: string[];
  favoriteFoods?: string[];
  sports?: string[];
  movies?: string[];
  games?: string[];
  textCharacters?: number;
  socialCredits?: number;
  radiusPassExpiresAt?: number;
  radiusPasses?: { km: number; expiresAt: number }[];
  proUntil?: number;
  stripeCustomerId?: string;
}
export interface Meeting {
  a: string;
  b: string;
  startedAt: number;
  lastTickAt: number;
  seconds: number;
  awardedSteps: number;
  active: boolean;
}
export interface MealOffer {
  id: string;
  deletedAt?: number;
  restaurantName: string;
  area: string;
  address?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  lat?: number;
  lng?: number;
  managerId?: string;
  discountPercent?: number;
  groupDiscountTiers?: { diners: number; discountPercent: number }[];
  redemptionLimit?: number;
  terms?: string;
  fundedBy?: "restaurant" | "friendcircle" | "shared";
  partnerConfirmedAt?: number;
  active: boolean;
  validUntil?: number;
  createdAt: number;
}
export interface MealVoucher {
  id: string;
  code: string;
  offerId: string;
  a: string;
  b: string;
  discountPercent: number;
  terms: string;
  createdAt: number;
  expiresAt: number;
  redeemedAt?: number;
  inviteId?: string;
}
export interface MealInvitation {
  id: string;
  offerId: string;
  a: string;
  b: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt?: number;
  acceptedBy?: string;
  voucherId?: string;
}
export interface MealGathering {
  id: string;
  offerId: string;
  hostId: string;
  invites: {
    userId: string;
    state: "pending" | "accepted" | "declined";
    respondedAt?: number;
  }[];
  discountTiers: { diners: number; discountPercent: number }[];
  terms: string;
  createdAt: number;
  expiresAt: number;
  code?: string;
  redeemedAt?: number;
}
export interface MealGatheringView {
  id: string;
  offerId: string;
  hostName: string;
  invitedCount: number;
  acceptedFriends: number;
  myStatus: "host" | "pending" | "accepted" | "declined";
  discountPercent: number;
  discountTiers: { diners: number; discountPercent: number }[];
  code?: string;
  expiresAt: number;
  redeemedAt?: number;
}
export interface MeetingAnalytics {
  trackingStartedAt: number;
  totalMeets: number;
  totalDurationSeconds: number;
  activityAtMeet: Partial<Record<Activity, number>>;
  daily: Record<string, { meets: number; seconds: number }>;
}
export interface OfferAnalytics {
  trackingStartedAt: number;
  invitations: number;
  accepted: number;
  redeemed: number;
  byOffer: Record<
    string,
    { invitations: number; accepted: number; redeemed: number }
  >;
}
export interface Friendship {
  a: string;
  b: string;
  since: number;
  requestId: string;
}
export interface ChatRequest {
  id: string;
  from: string;
  to: string;
  state: "pending" | "accepted" | "declined";
  createdAt: number;
  remainingFrom: number;
  remainingTo: number;
}
export interface Verification {
  id: string;
  from: string;
  to: string;
  state: "review" | "pending" | "accepted" | "rejected";
  createdAt: number;
  photo?: string;
  faceCount?: number;
  reason: string;
}
export interface Message {
  groupId?: string;
  id: string;
  from: string;
  to: string;
  kind: "hi" | "encrypted";
  text?: string;
  ciphertext?: string;
  iv?: string;
  senderKey?: JsonWebKey;
  recipientKey?: JsonWebKey;
  createdAt: number;
  expiresAt?: number;
}
export interface Report {
  id: string;
  from: string;
  target: string;
  reason: string;
  createdAt: number;
  resolved: boolean;
}
export interface State {
  suburbAchievements?: Record<string, number[]>;
  meetingAnalytics?: MeetingAnalytics;
  offerAnalytics?: OfferAnalytics;
  mealOffers?: MealOffer[];
  mealVouchers?: MealVoucher[];
  mealInvitations?: MealInvitation[];
  mealGatherings?: MealGathering[];
  meetings?: Meeting[];
  stripeEvents?: string[];
  groups?: Group[];
  people: Person[];
  friendships: Friendship[];
  chatRequests?: ChatRequest[];
  requests: Verification[];
  messages: Message[];
  blocks: { from: string; to: string }[];
  reports: Report[];
}
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const r = Math.PI / 180;
  const dlat = (b.lat - a.lat) * r,
    dlng = (b.lng - a.lng) * r;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export const mealBrowseKm = 5;
export function isFriend(s: State, a: string, b: string) {
  return (
    a !== b &&
    !s.blocks.some(
      (x) => (x.from === a && x.to === b) || (x.from === b && x.to === a),
    ) &&
    s.friendships.some(
      (x) => (x.a === a && x.b === b) || (x.a === b && x.b === a),
    )
  );
}
export function expire(s: State, now = Date.now()) {
  s.messages = s.messages.filter((x) => !x.expiresAt || x.expiresAt > now);
  if (s.meetings)
    s.meetings = s.meetings.filter((m) => m.lastTickAt > now - 86400000);
  if (s.mealVouchers)
    s.mealVouchers = s.mealVouchers.filter(
      (v) => v.createdAt > now - 86400000 * 90,
    );
  if (s.mealInvitations)
    s.mealInvitations = s.mealInvitations.filter(
      (v) => v.createdAt > now - 86400000 * 90,
    );
  if (s.mealGatherings)
    s.mealGatherings = s.mealGatherings.filter(
      (g) => g.createdAt > now - 86400000 * 90,
    );
  for (const r of s.requests)
    if (
      (r.state === "pending" || r.state === "review") &&
      r.createdAt + 86400000 <= now
    ) {
      r.state = "rejected";
      r.reason = "Expired after 24 hours";
    }
}
export function seed(): State {
  const now = Date.now();
  const people: Person[] = [
    {
      id: "you",
      name: "Alex Morgan",
      initials: "AM",
      color: "#efad94",
      activity: "coffee",
      status: "Up for a coffee",
      bio: "Perth local who enjoys coffee, films and getting outdoors.",
      hobbies: ["coffee", "walking"],
      favoriteFoods: ["pizza"],
      sports: ["running"],
      movies: ["comedy"],
      games: ["board games"],
      lat: -31.9523,
      lng: 115.8613,
      sharing: true,
      adult: true,
      visibility: "private",
      textCharacters: 100,
      socialCredits: 0,
      updatedAt: now,
    },
    {
      id: "mia",
      name: "Mia Chen",
      initials: "MC",
      color: "#d5bbad",
      activity: "coffee",
      status: "Coffee at Little Bird ☕",
      lat: -31.9471,
      lng: 115.8594,
      sharing: true,
      adult: true,
      updatedAt: now,
    },
    {
      id: "james",
      name: "James Wilson",
      initials: "JW",
      color: "#bbcab2",
      activity: "running",
      status: "A little fresh air",
      lat: -31.9583,
      lng: 115.8514,
      sharing: true,
      adult: true,
      updatedAt: now,
    },
    {
      id: "sophie",
      name: "Sophie Taylor",
      initials: "ST",
      color: "#c7c2dd",
      activity: "working",
      status: "Finding my focus",
      lat: -31.9528,
      lng: 115.8723,
      sharing: true,
      adult: true,
      updatedAt: now,
    },
    {
      id: "leo",
      name: "Leo Martinez",
      initials: "LM",
      color: "#ddc691",
      activity: "gaming",
      status: "One more round 🎮",
      lat: -31.9445,
      lng: 115.8728,
      sharing: true,
      adult: true,
      updatedAt: now,
    },
    {
      id: "ava",
      name: "Ava Thompson",
      initials: "AT",
      color: "#b9cfce",
      activity: "coffee",
      status: "Exploring the neighbourhood",
      lat: -31.9598,
      lng: 115.8666,
      sharing: true,
      adult: true,
      updatedAt: now,
    },
    {
      id: "noah",
      name: "Noah Park",
      initials: "NP",
      color: "#c4c7dc",
      activity: "sleeping",
      status: "Recharging",
      lat: -31.949,
      lng: 115.8457,
      sharing: true,
      adult: true,
      updatedAt: now,
    },
    {
      id: "ella",
      name: "Ella Brooks",
      initials: "EB",
      color: "#dbc4b9",
      activity: "coffee",
      status: "New around here",
      lat: -31.95,
      lng: 115.86,
      sharing: false,
      visibility: "public",
      adult: true,
      updatedAt: now,
    },
    {
      id: "ruby",
      name: "Ruby Clarke",
      initials: "RC",
      color: "#e6c5d5",
      activity: "coffee",
      status: "Looking for a coffee buddy",
      bio: "Coffee, comedies and slow weekends around Perth.",
      hobbies: ["coffee"],
      favoriteFoods: ["pizza"],
      movies: ["comedy"],
      lat: -31.9528,
      lng: 115.864,
      sharing: true,
      visibility: "public",
      adult: true,
      updatedAt: now,
    },
  ];
  return {
    mealOffers: [
      {
        id: "draft-hj-carlisle",
        restaurantName: "Hungry Jack's",
        area: "Carlisle (near Kewdale)",
        address: "Lot 310, 232 Orrong Road, Carlisle WA 6101",
        lat: -31.9719618,
        lng: 115.9171984,
        active: false,
        createdAt: now,
      },
      {
        id: "demo-circle-kitchen",
        restaurantName: "Circle Kitchen (demo)",
        area: "Perth (WA)",
        address: "Fictional demo venue",
        lat: -31.9535,
        lng: 115.858,
        managerId: "you",
        discountPercent: 10,
        groupDiscountTiers: [
          { diners: 2, discountPercent: 10 },
          { diners: 3, discountPercent: 15 },
          { diners: 4, discountPercent: 20 },
        ],
        redemptionLimit: 100,
        terms:
          "Demo only. Illustrative group discount; no real restaurant offer or redemption.",
        fundedBy: "restaurant",
        partnerConfirmedAt: now,
        validUntil: now + 365 * 86400000,
        active: true,
        createdAt: now,
      },
    ],
    people,
    friendships: [
      ...people.slice(1, 7).map((p) => ({
        a: "you",
        b: p.id,
        since: now - 86400000 * 30,
        requestId: `seed-${p.id}`,
      })),
      {
        a: "mia",
        b: "ava",
        since: now - 86400000 * 30,
        requestId: "seed-mia-ava",
      },
    ],
    requests: [],
    messages: [],
    blocks: [],
    reports: [],
  };
}
export interface Group {
  id: string;
  name: string;
  members: string[];
  createdAt: number;
}
export function clusterAllowed(
  s: State,
  g: Group,
  demo = false,
  now = Date.now(),
) {
  return g.members.every((id, i) => {
    const p = s.people.find((p) => p.id === id);
    return (
      p &&
      p.sharing &&
      (demo || p.updatedAt > now - 120000) &&
      g.members.slice(i + 1).every((other) => {
        const q = s.people.find((p) => p.id === other);
        return q && isFriend(s, id, other) && distanceKm(p, q) <= 2;
      })
    );
  });
}
