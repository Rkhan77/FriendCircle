import type { State } from "./model";

// Only interaction metadata is used. Chat text and precise locations never enter the score.
export function recommendedMealFriends(s: State, uid: string, friendIds: string[], now = Date.now()) {
  const recent = now - 90 * 86400000;
  const score = new Map(friendIds.map((id) => [id, 0]));
  for (const message of s.messages)
    if (!message.groupId && message.createdAt >= recent) {
      const other = message.from === uid ? message.to : message.to === uid ? message.from : "";
      if (score.has(other)) score.set(other, (score.get(other) || 0) + (message.kind === "hi" ? 1 : 2));
    }
  for (const meeting of s.meetings || []) {
    const other = meeting.a === uid ? meeting.b : meeting.b === uid ? meeting.a : "";
    if (score.has(other)) score.set(other, (score.get(other) || 0) + 4 + Math.min(10, Math.floor(meeting.seconds / 600)));
  }
  for (const gathering of s.mealGatherings || [])
    if (gathering.createdAt >= recent) {
      if (gathering.hostId === uid)
        for (const invite of gathering.invites)
          if (invite.state === "accepted" && score.has(invite.userId))
            score.set(invite.userId, (score.get(invite.userId) || 0) + 6);
      else if (gathering.invites.some((invite) => invite.userId === uid && invite.state === "accepted") && score.has(gathering.hostId))
        score.set(gathering.hostId, (score.get(gathering.hostId) || 0) + 6);
    }
  return friendIds.filter((id) => (score.get(id) || 0) > 0).sort((a, b) => (score.get(b) || 0) - (score.get(a) || 0) || a.localeCompare(b));
}
