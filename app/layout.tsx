import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FriendCircle · Less scrolling. More showing up.",
  description: "Find your local circle, make a plan, and meet face to face.",
  icons: { icon: `${process.env.NEXT_PUBLIC_PAGES_PREVIEW === "1" ? "/FriendCircle" : ""}/favicon.svg` },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
