import previewState from "@/data/pages-preview-state.json";

export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  if (process.env.NEXT_PUBLIC_PAGES_PREVIEW === "1") {
    if (!options.method || options.method === "GET") {
      if (url === "/config") return { demo: true } as T;
      if (url === "/state") return structuredClone(previewState) as T;
      if (url.startsWith("/messages/") || url === "/groups") return [] as T;
    }
    throw Error("This is a sample-data preview. Run FriendCircle locally to try live actions.");
  }
  const response = await fetch(`/api${url}`, {
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Something went wrong");
  return data;
}
