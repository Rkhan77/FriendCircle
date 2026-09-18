"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Store } from "lucide-react";
import { api } from "@/lib/api";
export default function PartnerLogin() {
  const [demo, setDemo] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { api<{ demo: boolean }>("/config").then((value) => setDemo(value.demo)).catch((cause) => setError(cause.message)); }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  function signIn(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const password = event ? String(new FormData(event.currentTarget).get("password") || "") : "";
    run(async () => {
      await api("/partner/login", { method: "POST", body: JSON.stringify({ email, password }) });
      window.location.assign("/partner");
    });
  }
  function requestCode() {
    run(async () => {
      await api("/auth/request-code", { method: "POST", body: JSON.stringify({ email }) });
      setMode("code"); setNotice("Check your email for a code or sign-in link.");
    });
  }
  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("token") || "");
    run(async () => {
      await api("/auth/verify-code", { method: "POST", body: JSON.stringify({ email, token }) });
      await api("/partner/session");
      window.location.assign("/partner");
    });
  }
  return <main className="admin-auth"><div className="admin-auth-card">
    <div className="admin-auth-brand"><Store size={27} /><span>friendcircle <b>partner</b></span></div>
    <h1>Partner sign in</h1><p>Manage your contact details and schedule restaurant offers.</p>
    {error && <div className="admin-error" role="alert">{error}</div>}
    {notice && <div className="admin-notice" role="status">{notice}</div>}
    {demo === null ? <p>Checking access…</p> : demo ? <div className="admin-demo-note">Local partner preview · only an invited restaurant owner can open this dashboard. Ask the platform admin for an invitation link.</div> : mode === "password" ? <form onSubmit={signIn}><label>Contact email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input name="password" type="password" required autoComplete="current-password" /></label><button className="primary admin-auth-submit" disabled={busy}>Sign in <ArrowRight size={17} /></button><button className="access-text-button" type="button" disabled={busy || !email} onClick={requestCode}>Email me a sign-in code</button></form> : <form onSubmit={verify}><label>Email code<input name="token" required inputMode="numeric" autoComplete="one-time-code" /></label><button className="primary admin-auth-submit" disabled={busy}>Verify code <ArrowRight size={17} /></button><button className="access-text-button" type="button" onClick={() => setMode("password")}>Use password instead</button></form>}
    <a href="/auth">FriendCircle member sign in</a>
  </div></main>;
}
