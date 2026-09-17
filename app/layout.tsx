import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FriendCircle · A little closer",
  description: "Your people. Your neighbourhood. Find a moment to connect.",
  icons: { icon: `${process.env.NEXT_PUBLIC_PAGES_PREVIEW === "1" ? "/FriendCircle" : ""}/favicon.svg` },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
