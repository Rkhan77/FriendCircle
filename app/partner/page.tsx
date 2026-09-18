"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarDays, CheckCheck, Clock3, LogOut, MapPin, Store } from "lucide-react";
import { api } from "@/lib/api";
import type { RestaurantChangeRequest } from "@/lib/model";

type Offer = {
  id: string;
  startsAt: number;
  validUntil: number;
  groupDiscountTiers?: { diners: number; discountPercent: number }[];
  redemptionLimit?: number;
  redeemed: number;
  active: boolean;
};
type Restaurant = {
  id: string;
  restaurantName: string;
  area: string;
  address?: string;
  lat?: number;
  lng?: number;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  approved: boolean;
  offers: Offer[];
};
type Overview = { demo: boolean; restaurants: Restaurant[]; changeRequests: RestaurantChangeRequest[] };
function dateTimeLocal(value: number) {
  const date = new Date(value || Date.now());
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function OfferForm({ offer, venue, save, busy }: { offer?: Offer; venue: Restaurant; save: (url: string, method: string, body: object, message: string) => Promise<boolean>; busy: boolean }) {
  const [open, setOpen] = useState(!offer);
  const tier = (diners: number) => offer?.groupDiscountTiers?.find((value) => value.diners === diners)?.discountPercent ?? (diners === 2 ? 10 : diners === 3 ? 15 : 20);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      startsAt: new Date(String(form.get("startsAt"))).getTime(),
      validUntil: new Date(String(form.get("validUntil"))).getTime(),
      redemptionLimit: Number(form.get("redemptionLimit")),
      groupDiscountTiers: [2, 3, 4].map((diners) => ({ diners, discountPercent: Number(form.get(`discount${diners}`)) })),
      active: form.get("active") === "on",
    };
    save(offer ? `/partner/offers/${offer.id}` : `/partner/restaurants/${venue.id}/offers`, offer ? "PATCH" : "POST", body, offer ? "Offer updated" : "Offer scheduled").then((saved) => { if (saved) setOpen(false); });
  }
  return <article className="partner-offer">
    <div className="partner-offer-head"><div><strong>{offer ? (offer.startsAt > Date.now() ? "Scheduled offer" : offer.active ? "Current offer" : "Paused offer") : "Schedule another offer"}</strong>{offer && <small>{offer.redemptionLimit || 0} available · {offer.redeemed} redeemed</small>}</div><button className="secondary" onClick={() => setOpen((value) => !value)}>{open ? "Close" : offer ? "Edit offer" : "Create offer"}</button></div>
    {offer && !open && <p><CalendarDays size={15} /> {new Date(offer.startsAt || Date.now()).toLocaleString()} <Clock3 size={15} /> Ends {new Date(offer.validUntil).toLocaleString()} · {offer.groupDiscountTiers?.map((value) => `${value.diners === 4 ? "4+" : value.diners} diners ${value.discountPercent}%`).join(" · ")}</p>}
    {open && <form className="admin-form partner-offer-form" onSubmit={submit}>
      <div className="admin-form-row"><label>Start date and time<input name="startsAt" type="datetime-local" required defaultValue={dateTimeLocal(offer?.startsAt || Date.now())} /></label><label>Expiration date and time<input name="validUntil" type="datetime-local" required defaultValue={dateTimeLocal(offer?.validUntil || Date.now() + 30 * 86400000)} /></label></div>
      <label>Number of offers available<input name="redemptionLimit" type="number" required min={Math.max(1, offer?.redeemed || 0)} max={1000000} defaultValue={offer?.redemptionLimit || 20} /></label>
      <div className="admin-form-row">{[2, 3, 4].map((diners) => <label key={diners}>{diners === 4 ? "4+" : diners} diners (%)<input name={`discount${diners}`} type="number" required min={1} max={50} defaultValue={tier(diners)} /></label>)}</div>
      <label className="access-check"><input type="checkbox" name="active" defaultChecked={offer ? offer.active : true} /> Make this offer visible during its scheduled time</label>
      {!venue.approved && <p className="admin-panel-note">The restaurant is still a draft. Offers become visible only after admin approval.</p>}
      <button className="primary" disabled={busy}>{offer ? "Save offer" : "Schedule offer"}</button>
    </form>}
  </article>;
}
export default function PartnerDashboard() {
  const [data, setData] = useState<Overview>();
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [redemptionCode, setRedemptionCode] = useState("");
  const [redeemedMeal, setRedeemedMeal] = useState<{ restaurantName: string; discountPercent: number; diners?: string[]; terms?: string }>();
  const load = useCallback(async () => {
    try {
      await api("/partner/session");
      const result = await api<Overview>("/partner/overview");
      setData(result);
      setSelectedId((id) => id || result.restaurants[0]?.id || "");
      setError("");
    } catch (cause) {
      const message = (cause as Error).message;
      if (/sign in|no restaurant|assigned/i.test(message)) window.location.replace("/partner/login");
      else setError(message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function save(url: string, method: string, body: object, message: string) {
    setBusy(true); setError("");
    try { await api(url, { method, body: JSON.stringify(body) }); await load(); setNotice(message); return true; }
    catch (cause) { setError((cause as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await api<typeof redeemedMeal>("/meals/redeem", { method: "POST", body: JSON.stringify({ code: redemptionCode }) });
      setRedeemedMeal(result);
      setRedemptionCode("");
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const venue = data?.restaurants.find((restaurant) => restaurant.id === selectedId);
  return <main className="platform-dashboard partner-dashboard">
    <header className="admin-topbar"><div className="admin-topbrand"><Store size={24} /> friendcircle <b>partner</b></div><div><a href="/"><ArrowLeft size={16} /> App</a><button onClick={async () => { await api("/logout", { method: "POST" }); window.location.assign("/partner/login"); }}><LogOut size={16} /> Sign out</button></div></header>
    <div className="admin-body"><div className="admin-intro"><small>RESTAURANT PARTNER SPACE</small><h1>Your restaurant, your offers.</h1><p>Keep contact details current and plan discounts for future catch-ups.</p></div>
      {data?.demo && <div className="admin-demo-note">Local partner preview · offers are fictional and cannot be redeemed for a real discount.</div>}
      {error && <div className="admin-error" role="alert">{error}</div>}
      {notice && <div className="admin-notice" role="status">{notice}</div>}
      {!data ? <p>Loading your restaurant…</p> : !venue ? <p>No restaurant is assigned to this account.</p> : <>
        {data.restaurants.length > 1 && <label className="partner-venue-select">Restaurant<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{data.restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.restaurantName}</option>)}</select></label>}
        <section className="admin-panel"><div className="admin-section-head"><h2>Restaurant profile</h2><span>{venue.approved ? "Approved" : "Awaiting admin approval"}</span></div><div className="partner-profile-grid"><div><small>NAME</small><strong>{venue.restaurantName}</strong></div><div><small>LOCATION</small><strong><MapPin size={16} /> {venue.address || venue.area}</strong><span>{venue.lat !== undefined && venue.lng !== undefined ? `${venue.lat.toFixed(5)}, ${venue.lng.toFixed(5)}` : "Map location not set"}</span></div><div><small>PUBLIC AREA</small><strong>{venue.area}</strong></div></div><p className="admin-panel-note">Restaurant name and location changes require admin review.</p>
          <details className="partner-change-details"><summary>Request a name or location change</summary><form className="admin-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); save(`/partner/restaurants/${venue.id}/change-requests`, "POST", { restaurantName: String(form.get("restaurantName")), area: String(form.get("area")), address: String(form.get("address")), lat: form.get("lat") ? Number(form.get("lat")) : undefined, lng: form.get("lng") ? Number(form.get("lng")) : undefined, reason: String(form.get("reason")) }, "Change request sent to the platform admin"); }}><div className="admin-form-row"><label>Restaurant name<input name="restaurantName" required defaultValue={venue.restaurantName} /></label><label>Area<input name="area" required defaultValue={venue.area} /></label></div><label>Street address<input name="address" defaultValue={venue.address || ""} /></label><div className="admin-form-row"><label>Latitude<input name="lat" type="number" step="any" defaultValue={venue.lat} /></label><label>Longitude<input name="lng" type="number" step="any" defaultValue={venue.lng} /></label></div><label>What should change?<textarea name="reason" required minLength={5} maxLength={500} placeholder="Briefly explain the correction" /></label><button className="primary" disabled={busy}>Submit for review</button></form></details>
          {data.changeRequests.filter((request) => request.venueId === venue.id).map((request) => <small className="partner-request-status" key={request.id}>Change request · {request.status} · {new Date(request.createdAt).toLocaleDateString()}</small>)}
        </section>
        <section className="admin-panel"><div className="admin-section-head"><h2>Contact details</h2><span>Only you and platform admins can edit these</span></div><form key={venue.id} className="admin-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); save(`/partner/restaurants/${venue.id}/contact`, "PATCH", { contactName: String(form.get("contactName")), contactEmail: String(form.get("contactEmail")), contactPhone: String(form.get("contactPhone")) }, "Contact details updated"); }}><div className="admin-form-row"><label>Contact person<input name="contactName" required defaultValue={venue.contactName} /></label><label>Email address<input name="contactEmail" type="email" required defaultValue={venue.contactEmail} /></label></div><label>Phone number<input name="contactPhone" type="tel" required defaultValue={venue.contactPhone} /></label><button className="primary" disabled={busy}>Save contact details</button></form></section>
        <section className="admin-panel"><div className="admin-section-head"><h2>Offers & schedule</h2><span>{venue.offers.length} offer{venue.offers.length === 1 ? "" : "s"}</span></div><p className="admin-panel-note">Each offer has its own number of redemptions, end date and time, and discounts for 2, 3, and 4+ diners. Choose a future start date to schedule it.</p><div className="partner-offer-list">{venue.offers.map((offer) => <OfferForm key={offer.id} offer={offer} venue={venue} save={save} busy={busy} />)}<OfferForm key={`new-${venue.id}`} venue={venue} save={save} busy={busy} /></div></section>
        <section className="admin-panel merchant-card"><div className="admin-section-head"><h2>Redeem a meal offer</h2><span>Restaurant owner access</span></div><p className="admin-panel-note">Ask an accepted diner for their meal code and check that the group is present before applying the discount.</p>{data.demo ? <p className="admin-demo-note">Demo codes are illustrative and cannot redeem a real discount.</p> : <form onSubmit={redeem}><label>Meal code<input value={redemptionCode} onChange={(event) => setRedemptionCode(event.target.value.toUpperCase())} placeholder="16-character code" maxLength={16} required /></label><button className="primary" disabled={busy || redemptionCode.length !== 16}>Redeem code</button></form>}{redeemedMeal && <div className="redeemed-result" role="status"><CheckCheck size={20} /><div><strong>{redeemedMeal.discountPercent}% discount redeemed at {redeemedMeal.restaurantName}</strong><p>{redeemedMeal.diners?.join(" and ")} · {redeemedMeal.terms}</p></div></div>}</section>
      </>}
    </div>
  </main>;
}
