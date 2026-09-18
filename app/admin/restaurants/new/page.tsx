"use client";
import { appHref } from "@/lib/paths";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Plus, ShieldCheck, Utensils } from "lucide-react";
import { api } from "@/lib/api";
import type { MealOffer } from "@/lib/model";

export default function RegisterRestaurant() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api("/admin/session")
      .then(() => setReady(true))
      .catch(() => window.location.replace(appHref("/admin/login")));
  }, []);
  async function register(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const sendInvite = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("name") === "sendInvite";
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const body = {
      restaurantName: String(f.get("restaurantName") || "").trim(),
      area: String(f.get("area") || "").trim(),
      address: String(f.get("address") || "").trim() || undefined,
      contactName: String(f.get("contactName") || "").trim(),
      contactEmail: String(f.get("contactEmail") || "").trim(),
      contactPhone: String(f.get("contactPhone") || "").trim(),
      lat: f.get("lat") ? Number(f.get("lat")) : undefined,
      lng: f.get("lng") ? Number(f.get("lng")) : undefined,
      discountPercent: Number(f.get("discount2")),
      redemptionLimit: Number(f.get("redemptionLimit")),
      groupDiscountTiers: [2, 3, 4].map((diners) => ({
        diners,
        discountPercent: Number(f.get(`discount${diners}`)),
      })),
    };
    try {
      let id = createdId;
      if (!id) {
        const offer = await api<MealOffer>("/admin/meal-offers", {
          method: "POST",
          body: JSON.stringify(body),
        });
        id = offer.id;
        setCreatedId(id);
      }
      if (sendInvite) {
        const result = await api<{ delivered: boolean; link?: string }>(`/admin/meal-offers/${id}/invite`, { method: "POST" });
        setInviteLink(result.link || "");
        setNotice(result.delivered ? "Restaurant saved. The partner invitation was emailed." : "Restaurant saved. This demo invitation is ready to copy; no email was sent.");
      } else window.location.assign(appHref("/admin"));
    } catch (e) {
      setError(`${createdId ? "Restaurant saved, but the invitation failed: " : ""}${(e as Error).message}`);
      setBusy(false);
    }
  }
  return (
    <main className="platform-dashboard">
      <header className="admin-topbar">
        <div className="admin-topbrand">
          <ShieldCheck size={24} /> friendcircle <b>admin</b>
        </div>
        <a className="admin-back-link" href={appHref("/admin")}>
          <ArrowLeft size={16} /> Dashboard
        </a>
      </header>
      <div className="admin-body">
        <div className="admin-intro">
          <small>RESTAURANT PARTNERS</small>
          <h1>Register a restaurant.</h1>
          <p>
            Add its details as a draft. Manage the discount and publish only
            after the venue approves the exact terms.
          </p>
        </div>
        <section className="admin-panel admin-new-restaurant">
          <div className="admin-section-head">
            <h2>Restaurant details</h2>
            <Utensils size={19} />
          </div>
          {error && (
            <div className="admin-error" role="alert">
              {error}
            </div>
          )}
          {notice && <div className="admin-notice" role="status">{notice}</div>}
          {inviteLink && <div className="admin-invite-link"><label>Demo partner invitation link<input readOnly value={inviteLink} onFocus={(event) => event.target.select()} /></label><button className="secondary" type="button" onClick={() => navigator.clipboard.writeText(inviteLink)}>Copy link</button></div>}
          {!ready ? (
            <p>Checking admin access…</p>
          ) : (
            <form className="admin-form" onSubmit={register}>
              <label>
                Restaurant name
                <input
                  name="restaurantName"
                  required
                  maxLength={80}
                  placeholder="Restaurant name"
                />
              </label>
              <label>
                Area
                <input
                  name="area"
                  required
                  maxLength={80}
                  placeholder="Suburb"
                />
              </label>
              <label>
                Address
                <input
                  name="address"
                  maxLength={140}
                  placeholder="Street address"
                />
              </label>
              <h3>Restaurant contact</h3>
              <label>
                Contact person name
                <input
                  name="contactName"
                  required
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Full name"
                />
              </label>
              <label>
                Email
                <input
                  name="contactEmail"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="name@restaurant.com"
                />
              </label>
              <label>
                Phone
                <input
                  name="contactPhone"
                  type="tel"
                  required
                  minLength={6}
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="Contact phone number"
                />
              </label>
              <div className="admin-form-row">
                <label>
                  Latitude
                  <input
                    name="lat"
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    name="lng"
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                  />
                </label>
              </div>
              <p className="admin-panel-note">
                If you add a map location, enter both latitude and longitude. A
                new restaurant remains unpublished.
              </p>
              <h3>Group meal discount tiers</h3>
              <p className="admin-panel-note">
                Set the discount for the host plus accepted friends. Four or
                more diners use the last tier. Confirm these rates with the
                restaurant before publishing.
              </p>
              <div className="admin-form-row">
                {[2, 3, 4].map((diners) => (
                  <label key={diners}>
                    {diners === 4 ? "4+" : diners} diners (%)
                    <input
                      name={`discount${diners}`}
                      type="number"
                      min={1}
                      max={50}
                      required
                      defaultValue={diners === 2 ? 10 : diners === 3 ? 15 : 20}
                    />
                  </label>
                ))}
              </div>
              <label>
                Maximum offer redemptions
                <input
                  name="redemptionLimit"
                  type="number"
                  min={1}
                  max={1000000}
                  required
                  placeholder="Total discounts the restaurant will honour"
                />
              </label>
              <p className="admin-panel-note">
                Each redeemed meal code uses one offer. The restaurant stops
                appearing on the map when this limit is reached.
              </p>
              <div className="admin-buttons">
                <button className="primary" disabled={busy || !!createdId}>
                  <Plus size={16} />{" "}
                  {busy ? "Registering…" : "Register restaurant"}
                </button>
                <button className="secondary" name="sendInvite" disabled={busy || !!inviteLink}>
                  {createdId ? "Retry partner invite" : "Register & send invite"}
                </button>
                <a className="secondary admin-cancel-link" href={appHref("/admin")}>
                  Cancel
                </a>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
