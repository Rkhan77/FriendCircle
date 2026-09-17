import type {
  Activity,
  MeetingAnalytics,
  OfferAnalytics,
  Person,
  State,
} from "./model";

function dayKey(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

export function ensureMeetingAnalytics(
  s: State,
  now = Date.now(),
): MeetingAnalytics {
  return (s.meetingAnalytics ??= {
    trackingStartedAt: now,
    totalMeets: 0,
    totalDurationSeconds: 0,
    activityAtMeet: {},
    daily: {},
  });
}

export function recordMeetStart(s: State, a: Person, b: Person, now: number) {
  const stats = ensureMeetingAnalytics(s, now),
    day = (stats.daily[dayKey(now)] ??= { meets: 0, seconds: 0 });
  stats.totalMeets++;
  day.meets++;
  for (const p of [a, b])
    stats.activityAtMeet[p.activity] =
      (stats.activityAtMeet[p.activity] || 0) + 1;
}

export function recordMeetDuration(s: State, seconds: number, now: number) {
  const stats = ensureMeetingAnalytics(s, now),
    day = (stats.daily[dayKey(now)] ??= { meets: 0, seconds: 0 });
  stats.totalDurationSeconds += seconds;
  day.seconds += seconds;
}

export function ensureOfferAnalytics(
  s: State,
  now = Date.now(),
): OfferAnalytics {
  if (s.offerAnalytics) return s.offerAnalytics;
  const stats: OfferAnalytics = {
    trackingStartedAt: now,
    invitations: 0,
    accepted: 0,
    redeemed: 0,
    byOffer: {},
  };
  for (const v of s.mealInvitations || []) {
    const bucket = (stats.byOffer[v.offerId] ??= {
      invitations: 0,
      accepted: 0,
      redeemed: 0,
    });
    stats.invitations++;
    bucket.invitations++;
    if (v.acceptedAt) {
      stats.accepted++;
      bucket.accepted++;
    }
  }
  for (const v of s.mealVouchers || [])
    if (v.redeemedAt) {
      const bucket = (stats.byOffer[v.offerId] ??= {
        invitations: 0,
        accepted: 0,
        redeemed: 0,
      });
      stats.redeemed++;
      bucket.redeemed++;
    }
  for (const gathering of s.mealGatherings || []) {
    const bucket = (stats.byOffer[gathering.offerId] ??= {
      invitations: 0,
      accepted: 0,
      redeemed: 0,
    });
    bucket.invitations += gathering.invites.length;
    stats.invitations += gathering.invites.length;
    const accepted = gathering.invites.filter((invite) => invite.state === "accepted").length;
    bucket.accepted += accepted;
    stats.accepted += accepted;
    if (gathering.redeemedAt) {
      bucket.redeemed++;
      stats.redeemed++;
    }
  }
  return (s.offerAnalytics = stats);
}

export function recordOfferEvent(
  s: State,
  offerId: string,
  event: "invitations" | "accepted" | "redeemed",
  now = Date.now(),
) {
  const stats = ensureOfferAnalytics(s, now),
    bucket = (stats.byOffer[offerId] ??= {
      invitations: 0,
      accepted: 0,
      redeemed: 0,
    });
  stats[event]++;
  bucket[event]++;
}

export function adminAnalytics(s: State, now = Date.now()) {
  const meeting = ensureMeetingAnalytics(s, now),
    offers = ensureOfferAnalytics(s, now);
  const currentActivities: Partial<Record<Activity, number>> = {};
  for (const p of s.people)
    currentActivities[p.activity] = (currentActivities[p.activity] || 0) + 1;
  return {
    trackingStartedAt: Math.min(
      meeting.trackingStartedAt,
      offers.trackingStartedAt,
    ),
    people: s.people.length,
    meetings: {
      total: meeting.totalMeets,
      durationSeconds: Math.round(meeting.totalDurationSeconds),
      averageSeconds: meeting.totalMeets
        ? Math.round(meeting.totalDurationSeconds / meeting.totalMeets)
        : 0,
      daily: Object.entries(meeting.daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, values]) => ({ date, ...values })),
      activityAtMeet: meeting.activityAtMeet,
    },
    currentActivities,
    offers: {
      invitations: offers.invitations,
      peopleNotified: offers.invitations + (s.mealInvitations || []).length,
      accepted: offers.accepted,
      redeemed: offers.redeemed,
      acceptanceRate: offers.invitations
        ? Math.round((offers.accepted / offers.invitations) * 1000) / 10
        : 0,
      byRestaurant: (s.mealOffers || [])
        .filter((o) => !o.deletedAt)
        .map((o) => ({
          id: o.id,
          restaurantName: o.restaurantName,
          area: o.area,
          published: o.active,
          discountPercent: o.discountPercent,
          redemptionLimit: o.redemptionLimit,
          ...offers.byOffer[o.id],
          acceptanceRate: offers.byOffer[o.id]?.invitations
            ? Math.round(
                (offers.byOffer[o.id].accepted /
                  offers.byOffer[o.id].invitations) *
                  1000,
              ) / 10
            : 0,
        })),
    },
    openReports: s.reports.filter((r) => !r.resolved).length,
  };
}
