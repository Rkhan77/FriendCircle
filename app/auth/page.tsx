"use client";
import { appHref } from "@/lib/paths";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Mail, Phone, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import BrandLogo from "@/components/BrandLogo";

type Step = "identifier" | "password" | "signup" | "code" | "sent";
export default function AccountAccess() {
  const [demo, setDemo] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [step, setStep] = useState<Step>("identifier");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const phone = !identifier.includes("@");
  const identity = phone ? { phone: identifier.trim() } : { email: identifier.trim().toLowerCase() };
  useEffect(() => { api<{ demo: boolean }>("/config").then((value) => setDemo(value.demo)).catch(() => {}); }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await work(); } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  function submitIdentifier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(async () => {
      const result = await api<{ exists: boolean }>("/auth/lookup", { method: "POST", body: JSON.stringify(identity) });
      setStep(result.exists ? "password" : "signup");
    });
  }
  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") || "");
    run(async () => {
      await api("/login", { method: "POST", body: JSON.stringify({ ...identity, password }) });
      window.location.assign(appHref("/app"));
    });
  }
  function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(async () => {
      const result = await api<{ signedIn?: boolean; demo?: boolean; message?: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ ...identity, password: String(form.get("password")), adult: form.get("adult") === "on" }),
      });
      if (result.demo) return setNotice(result.message || "Open the sample account to explore.");
      if (result.signedIn) return window.location.assign(appHref("/app"));
      setStep(phone ? "code" : "sent");
      setNotice(phone ? "Enter the code sent to your phone." : "Check your email for a confirmation link.");
    });
  }
  function requestCode() {
    run(async () => {
      const result = await api<{ demo?: boolean; message?: string }>("/auth/request-code", { method: "POST", body: JSON.stringify(identity) });
      if (result.demo) return setNotice(result.message || "Demo mode does not send codes.");
      setStep("code");
      setNotice(phone ? "We sent a sign-in code to your phone." : "Check your email for a code or sign-in link.");
    });
  }
  function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("token") || "");
    run(async () => {
      await api("/auth/verify-code", { method: "POST", body: JSON.stringify({ ...identity, token }) });
      window.location.assign(appHref("/app"));
    });
  }
  return <main className="auth-page access-page"><div className="auth-card">
    <BrandLogo className="access-brand" />
    <div className="access-icon">{phone ? <Phone size={24} /> : <Mail size={24} />}</div>
    <h1>{step === "identifier" ? "Find your circle." : step === "signup" ? "Join your circle." : step === "code" ? "Enter your code." : step === "sent" ? "Check your email." : "Welcome back."}</h1>
    <p>{step === "identifier" ? "Start with your email or mobile number." : step === "signup" ? "Create an account to see your people nearby." : step === "sent" ? "Open the confirmation link to finish signing up." : `Continue with ${identifier}.`}</p>
    {error && <div className="admin-error" role="alert">{error}</div>}
    {notice && <div className="admin-notice" role="status">{notice}</div>}
    {demo && <div className="admin-demo-note">Local demo · no real accounts, email, or SMS are created</div>}
    {step === "identifier" && <form onSubmit={submitIdentifier}><label>Email or phone number<input autoFocus type="text" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="you@example.com or +614…" autoComplete="username" /></label><button className="primary" disabled={busy}>Continue <ArrowRight size={17} /></button></form>}
    {step === "password" && <form onSubmit={submitPassword}><label>Password<input name="password" type="password" required autoComplete="current-password" /></label><button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button><button className="access-text-button" type="button" disabled={busy} onClick={requestCode}>{phone ? "Send a code to my phone" : "Send a code or link to my email"}</button><button className="access-text-button" type="button" onClick={() => setStep("signup")}>Create a new account instead</button></form>}
    {step === "signup" && <form onSubmit={submitSignup}><label>Create a password<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label><label className="access-check"><input type="checkbox" name="adult" required /> I confirm I am at least 18.</label><button className="primary" disabled={busy}>{busy ? "Creating…" : "Create account"}<ArrowRight size={17} /></button><button className="access-text-button" type="button" onClick={() => setStep("password")}>I already have an account</button></form>}
    {step === "code" && <form onSubmit={verifyCode}><label>One-time code<input name="token" inputMode="numeric" autoComplete="one-time-code" required minLength={4} maxLength={12} /></label><button className="primary" disabled={busy}>Verify code <ArrowRight size={17} /></button><button className="access-text-button" type="button" disabled={busy} onClick={requestCode}>Send another code</button></form>}
    {step !== "identifier" && <button className="access-back" onClick={() => { setStep("identifier"); setNotice(""); }}><ArrowLeft size={15} /> Use another email or phone</button>}
    {demo && <a className="access-demo-link" href={appHref("/app")}>Open sample account</a>}
    <div className="access-footer"><ShieldCheck size={15} /> Restaurant partner? <a href={appHref("/partner/login")}>Partner sign in</a></div>
  </div></main>;
}
