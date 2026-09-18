"use client";
import { appHref } from "@/lib/paths";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

export default function AdminLogin() {
  const [demo, setDemo] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ demo: boolean }>("/config")
      .then((v) => setDemo(v.demo))
      .catch((e) => setError(e.message));
  }, []);
  async function signIn(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = demo
        ? undefined
        : JSON.stringify(Object.fromEntries(new FormData(e!.currentTarget)));
      await api("/admin/login", { method: "POST", body });
      window.location.assign(appHref("/admin"));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="admin-auth">
      <div className="admin-auth-card">
        <div className="admin-auth-brand">
          <ShieldCheck size={27} />
          <span>
            friendcircle <b>admin</b>
          </span>
        </div>
        <div className="admin-auth-symbol">
          <LockKeyhole size={29} />
        </div>
        <h1>Platform admin sign in</h1>
        <p>
          Manage restaurant offers and see aggregate activity and meeting
          reports.
        </p>
        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}
        {demo === null ? (
          <p>Checking access…</p>
        ) : demo ? (
          <>
            <div className="admin-demo-note">
              Local demo preview · fictional accounts and no live restaurant
              discounts
            </div>
            <button
              className="primary admin-auth-submit"
              disabled={busy}
              onClick={() => signIn()}
            >
              Open demo dashboard <ArrowRight size={17} />
            </button>
          </>
        ) : (
          <form onSubmit={signIn}>
            <label>
              Admin email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button className="primary admin-auth-submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to dashboard"}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        <a href={appHref("/")}>Back to FriendCircle</a>
      </div>
    </main>
  );
}
