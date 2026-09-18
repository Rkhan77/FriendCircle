// GitHub Pages hosts the static preview below the repository path.
export function appHref(path: `/${string}`) {
  return `${process.env.NEXT_PUBLIC_PAGES_PREVIEW === "1" ? "/FriendCircle" : ""}${path}`;
}
