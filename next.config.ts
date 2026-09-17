import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  ...(process.env.NEXT_PUBLIC_PAGES_PREVIEW === "1"
    ? {
        output: "export" as const,
        basePath: "/FriendCircle",
        trailingSlash: true,
      }
    : {}),
};
export default config;
