"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
export default function CompleteSignIn() {
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    window.history.replaceState({}, "", "/auth/complete");
    if (!accessToken) return setError(params.get("error_description") || "This sign-in link is invalid or expired.");
    api("/auth/complete", { method: "POST", body: JSON.stringify({ accessToken }) })
      .then(() => window.location.replace("/"))
      .catch((cause) => setError((cause as Error).message));
  }, []);
  return <main className="auth-page"><div className="auth-card"><h1>Finishing sign in…</h1>{error && <p role="alert">{error}</p>}<a href="/auth">Return to sign in</a></div></main>;
}
