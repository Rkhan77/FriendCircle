import type { Person, ChatRequest } from "./model";
export const traitFields = [
  "hobbies",
  "favoriteFoods",
  "sports",
  "movies",
  "games",
] as const;
export function commonTraits(a: Person, b: Person): string[] {
  const mine = new Set(
    traitFields
      .flatMap((key) => a[key] || [])
      .map((value) => value.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
  return [
    ...new Set(
      traitFields
        .flatMap((key) => b[key] || [])
        .filter((value) => mine.has(value.trim().toLocaleLowerCase())),
    ),
  ];
}
export function acceptedChatRequest(
  s: { chatRequests?: ChatRequest[] },
  a: string,
  b: string,
) {
  return s.chatRequests?.find(
    (r) =>
      r.state === "accepted" &&
      ((r.from === a && r.to === b) || (r.from === b && r.to === a)),
  );
}
