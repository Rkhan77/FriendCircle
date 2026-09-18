"use client";
import { appHref } from "@/lib/paths";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
export default function AcceptPartnerInvite() {
  const [error, setError] = useState("");
  useEffect(() => {
    const demoInvite = new URLSearchParams(window.location.search).get("demo_invite");
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    window.history.replaceState({}, "", appHref("/partner/accept"));
    if (!demoInvite && !accessToken) return setError(fragment.get("error_description") || "This partner invitation is invalid or expired.");
    api("/partner/accept", { method: "POST", body: JSON.stringify(demoInvite ? { token: demoInvite } : { accessToken }) })
      .then(() => window.location.replace(appHref("/partner")))
      .catch((cause) => setError((cause as Error).message));
  }, []);
  return <main className="admin-auth"><div className="admin-auth-card"><h1>Opening your partner space…</h1>{error && <div className="admin-error" role="alert">{error}</div>}<a href={appHref("/partner/login")}>Partner sign in</a></div></main>;
}
