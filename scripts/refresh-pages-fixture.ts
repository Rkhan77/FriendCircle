import { writeFile } from "node:fs/promises";
import { seed, distanceKm, mealBrowseKm, type Person } from "../lib/model";
import { suburbAt } from "../lib/suburbs";
import { commonTraits } from "../lib/traits";

// Publish only a fresh, fictional seed. Never export the local .data/demo.json store.
const state = seed();
const me = state.people.find((person) => person.id === "you")!;
const suburb = suburbAt(me.lat, me.lng)!;
const safePerson = (person: Person) => {
  const { lat, lng, email, phone, publicKey, avatarFile, ...publicFields } = person;
  return publicFields;
};
const friends = state.people
  .filter((person) => state.friendships.some((friendship) =>
    [friendship.a, friendship.b].includes(me.id) &&
    [friendship.a, friendship.b].includes(person.id) &&
    person.id !== me.id,
  ))
  .map((person) => ({
    ...safePerson(person),
    nearby: suburbAt(person.lat, person.lng)?.code === suburb.code,
  }));
const connectedSuburbs = new Set(
  state.people
    .filter((person) => friends.some((friend) => friend.id === person.id))
    .map((person) => suburbAt(person.lat, person.lng)?.code)
    .filter(Boolean),
).size;
const milestones = [3, 5, 8];
const publicProfiles = state.people
  .filter((person) =>
    person.id !== me.id &&
    !friends.some((friend) => friend.id === person.id) &&
    person.visibility === "public" &&
    person.sharing &&
    suburbAt(person.lat, person.lng)?.code === suburb.code &&
    commonTraits(me, person).length > 0,
  )
  .map((person) => ({
    ...safePerson(person),
    nearby: true,
    connected: false,
    commonTraits: commonTraits(me, person),
  }));
const mealOffers = (state.mealOffers || [])
  .filter((offer) =>
    offer.active &&
    offer.lat !== undefined &&
    offer.lng !== undefined &&
    distanceKm(me, offer as { lat: number; lng: number }) <= mealBrowseKm,
  )
  .map(({ contactName, contactEmail, contactPhone, managerId, ...offer }) => ({
    ...offer,
    distance: distanceKm(me, offer as { lat: number; lng: number }),
    remainingRedemptions: offer.redemptionLimit,
  }));
const fixture = {
  me: { ...safePerson(me), lat: me.lat, lng: me.lng },
  suburb,
  friendPresence: friends.filter((friend) => friend.nearby).map(({ id, name }) => ({ id, name })),
  friends,
  recommendedMealFriendIds: [],
  conversationIds: [],
  discoverable: publicProfiles,
  publicProfiles,
  suburbAchievements: {
    connectedSuburbs,
    milestones,
    unlocked: milestones.filter((milestone) => connectedSuburbs >= milestone),
    nextMilestone: milestones.find((milestone) => connectedSuburbs < milestone) || null,
  },
  chatContacts: [],
  chatRequests: [],
  mealOffers,
  mealGatherings: [],
  mealInvitations: [],
  mealVouchers: [],
  meetings: [],
  requests: [],
  demo: true,
};
await writeFile("data/pages-preview-state.json", JSON.stringify(fixture));
