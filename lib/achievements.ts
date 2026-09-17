import { isFriend, type State } from "./model";
import { suburbAt } from "./suburbs";

export const suburbMilestones = [3, 5, 8] as const;

export function updateSuburbAchievements(
  state: State,
  userId: string,
  now = Date.now(),
  demo = false,
) {
  const suburbs = new Set(
    state.people
      .filter(
        (person) =>
          isFriend(state, userId, person.id) &&
          person.sharing &&
          (demo || person.updatedAt > now - 120000),
      )
      .map((person) => suburbAt(person.lat, person.lng)?.code)
      .filter((code): code is string => !!code),
  );
  state.suburbAchievements ??= {};
  const unlocked = (state.suburbAchievements[userId] ??= []);
  for (const milestone of suburbMilestones)
    if (suburbs.size >= milestone && !unlocked.includes(milestone))
      unlocked.push(milestone);
  unlocked.sort((a, b) => a - b);
  return {
    connectedSuburbs: suburbs.size,
    milestones: [...suburbMilestones],
    unlocked,
    nextMilestone: suburbMilestones.find((milestone) => !unlocked.includes(milestone)) ?? null,
  };
}
