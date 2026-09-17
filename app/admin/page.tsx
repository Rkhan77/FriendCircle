"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Clock3,
  LogOut,
  MapPin,
  Plus,
  ShieldCheck,
  Utensils,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { MealOffer } from "@/lib/model";

type Count = { invitations: number; accepted: number; redeemed: number };
type Analytics = {
  trackingStartedAt: number;
  people: number;
  openReports: number;
  meetings: {
    total: number;
    durationSeconds: number;
    averageSeconds: number;
    daily: { date: string; meets: number; seconds: number }[];
    activityAtMeet: Record<string, number>;
  };
  currentActivities: Record<string, number>;
  offers: Count & {
    peopleNotified: number;
    acceptanceRate: number;
    byRestaurant: (Count & {
      id: string;
      restaurantName: string;
      area: string;
      published: boolean;
      discountPercent?: number;
      redemptionLimit?: number;
      acceptanceRate: number;
    })[];
  };
};
type CommunityReport = {
  id: string;
  from: string;
  target: string;
  reason: string;
  resolved: boolean;
};
function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600),
    mins = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${mins}m` : `${mins}m ${Math.round(seconds % 60)}s`;
}
function Metric({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Users;
}) {
  return (
    <article className="admin-metric">
      <Icon size={19} />
      <small>{label}</small>
      <strong>{value}</strong>
      {sub && <span>{sub}</span>}
    </article>
  );
}
function RestaurantDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="admin-manage-dialog"
      aria-label={title}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close restaurant editor"
          onClick={close}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<Analytics>();
  const [restaurants, setRestaurants] = useState<MealOffer[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [demo, setDemo] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const session = await api<{ demo: boolean }>("/admin/session");
      setDemo(session.demo);
      const [numbers, offers, review] = await Promise.all([
        api<Analytics>("/admin/analytics"),
        api<MealOffer[]>("/admin/meal-offers"),
        api<{ reports: CommunityReport[] }>("/admin"),
      ]);
      setAnalytics(numbers);
      setRestaurants(offers);
      setReports(review.reports);
      setError("");
      setEditingId((id) => id || offers[0]?.id || "");
    } catch (e) {
      const message = (e as Error).message;
      if (/sign in|admin access|Reviewer access/i.test(message))
        window.location.replace("/admin/login");
      else setError(message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function change(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      setNotice(success);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const editing = restaurants.find((o) => o.id === editingId);
  const maxDaily = Math.max(
    1,
    ...(analytics?.meetings.daily.map((v) => v.meets) || []),
  );
  return (
    <main className="platform-dashboard">
      <header className="admin-topbar">
        <div className="admin-topbrand">
          <ShieldCheck size={24} /> friendcircle <b>admin</b>
        </div>
        <div>
          <span className="admin-mode">
            {demo ? "LOCAL DEMO" : "LIVE ADMIN"}
          </span>
          <a href="/">
            <ArrowLeft size={16} /> App
          </a>
          <button
            onClick={async () => {
              await api("/logout", { method: "POST" });
              window.location.assign("/admin/login");
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>
      <div className="admin-body">
        <div className="admin-intro">
          <small>PLATFORM OVERVIEW</small>
          <h1>See the moments that matter.</h1>
          <p>
            Manage partner restaurants and measure verified meetings and shared
            meal offers.
          </p>
          {analytics && (
            <span>
              Aggregate tracking since{" "}
              {new Date(analytics.trackingStartedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        {error && (
          <div className="admin-error" role="alert">
            {error} <button onClick={load}>Retry</button>
          </div>
        )}
        {notice && (
          <div className="admin-notice" role="status">
            {notice}
            <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {!analytics ? (
          <p>Loading admin reports…</p>
        ) : (
          <>
            <section className="admin-metrics" aria-label="Platform totals">
              <Metric label="Users" value={analytics.people} icon={Users} />
              <Metric
                label="Total verified meets"
                value={analytics.meetings.total}
                icon={MapPin}
              />
              <Metric
                label="Verified meet duration"
                value={duration(analytics.meetings.durationSeconds)}
                sub={`Average ${duration(analytics.meetings.averageSeconds)} per meet`}
                icon={Clock3}
              />
              <Metric
                label="Offer acceptance rate"
                value={`${analytics.offers.acceptanceRate}%`}
                sub={`${analytics.offers.accepted} of ${analytics.offers.invitations} invitations`}
                icon={CheckCheck}
              />
            </section>
            <section
              className="admin-panel admin-restaurant-list"
              aria-label="Restaurant offers summary"
            >
              <div className="admin-section-head">
                <h2>Restaurants & discounts</h2>
                <div className="admin-restaurant-heading-actions">
                  <span>{analytics.offers.byRestaurant.length} registered</span>
                  <a
                    className="admin-register-button"
                    href="/admin/restaurants/new"
                  >
                    <Plus size={15} /> Register restaurant
                  </a>
                </div>
              </div>
              <p className="admin-panel-note">
                Offer counts are shared invitations sent to friend pairs since
                aggregate tracking began. Draft restaurants have no live offer.
              </p>
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Restaurant</th>
                      <th>Discount rate</th>
                      <th>No. of offers</th>
                      <th>No. accepted</th>
                      <th>Redeemed / limit</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.offers.byRestaurant.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.restaurantName}</strong>
                          <small>
                            {o.area} · {o.published ? "Published" : "Draft"}
                          </small>
                        </td>
                        <td>
                          {o.discountPercent ? (
                            <span>
                              {o.discountPercent}%
                              {!o.published && <small>Draft rate</small>}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{o.invitations || 0}</td>
                        <td>{o.accepted || 0}</td>
                        <td>{o.redeemed || 0} / {o.redemptionLimit ?? "—"}</td>
                        <td>
                          <button
                            className="admin-row-action"
                            onClick={() => {
                              setEditingId(o.id);
                              setError("");
                              setDeleteConfirm(false);
                              setManageOpen(true);
                            }}
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!analytics.offers.byRestaurant.length && (
                  <p className="admin-empty">
                    No restaurants registered yet. Use the registration form
                    below to create a draft.
                  </p>
                )}
              </div>
            </section>
            <section className="admin-two-col">
              <div className="admin-panel">
                <div className="admin-section-head">
                  <h2>User activities</h2>
                  <span>Current profiles</span>
                </div>
                <div className="activity-report">
                  {Object.entries(analytics.currentActivities).map(
                    ([name, count]) => (
                      <div key={name}>
                        <span>{name}</span>
                        <b>{count}</b>
                      </div>
                    ),
                  )}
                  {!Object.keys(analytics.currentActivities).length && (
                    <p>No profiles yet.</p>
                  )}
                </div>
                <p className="admin-panel-note">
                  Activity at verified meets:{" "}
                  {Object.entries(analytics.meetings.activityAtMeet)
                    .map(([name, count]) => `${name} ${count}`)
                    .join(" · ") || "No recorded meets yet"}
                </p>
              </div>
              <div className="admin-panel">
                <div className="admin-section-head">
                  <h2>Meet activity</h2>
                  <span>Last 30 recorded days</span>
                </div>
                {analytics.meetings.daily.length ? (
                  <div className="daily-bars">
                    {analytics.meetings.daily.map((item) => (
                      <div
                        key={item.date}
                        title={`${item.date}: ${item.meets} meets, ${duration(item.seconds)}`}
                      >
                        <span>{item.meets}</span>
                        <i
                          style={{
                            height: `${Math.max(5, (item.meets / maxDaily) * 100)}%`,
                          }}
                        />
                        <small>{item.date.slice(5)}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="admin-empty">
                    No verified meetings have been recorded since aggregate
                    tracking began.
                  </p>
                )}
              </div>
            </section>
            <section className="admin-panel">
              <div className="admin-section-head">
                <h2>Discount offer reports</h2>
                <span>Shared invitations</span>
              </div>
              <div className="admin-offer-totals">
                <Metric
                  label="Invitations"
                  value={analytics.offers.invitations}
                  sub={`${analytics.offers.peopleNotified} people notified`}
                  icon={Bell}
                />
                <Metric
                  label="Accepted"
                  value={analytics.offers.accepted}
                  icon={CheckCheck}
                />
                <Metric
                  label="Redeemed once"
                  value={analytics.offers.redeemed}
                  icon={Utensils}
                />
              </div>
            </section>
            {manageOpen && editing && (
              <RestaurantDialog
                title={`Manage ${editing.restaurantName}`}
                close={() => {
                  setManageOpen(false);
                  setDeleteConfirm(false);
                }}
              >
                {error && (
                  <div className="admin-error" role="alert">
                    {error}
                  </div>
                )}
                {restaurants.length ? (
                  <>
                    <label className="admin-select-label">
                      Restaurant
                      <select
                        value={editingId}
                        onChange={(e) => setEditingId(e.target.value)}
                      >
                        {restaurants.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.restaurantName} · {o.area}
                          </option>
                        ))}
                      </select>
                    </label>
                    {editing && (
                      <form
                        key={editing.id}
                        className="admin-form"
                        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget),
                            value = (key: string) =>
                              String(f.get(key) || "").trim(),
                            confirmed = f.get("partnerConfirmed") === "on";
                          const body = {
                            restaurantName: value("restaurantName"),
                            area: value("area"),
                            address: value("address") || undefined,
                            contactName: value("contactName") || undefined,
                            contactEmail: value("contactEmail") || undefined,
                            contactPhone: value("contactPhone") || undefined,
                            lat: value("lat")
                              ? Number(value("lat"))
                              : undefined,
                            lng: value("lng")
                              ? Number(value("lng"))
                              : undefined,
                            managerId: value("managerId") || undefined,
                            discountPercent: value("discountPercent")
                              ? Number(value("discountPercent"))
                              : undefined,
                            redemptionLimit: value("redemptionLimit")
                              ? Number(value("redemptionLimit"))
                              : undefined,
                            groupDiscountTiers: [2, 3, 4].map((diners) => ({
                              diners,
                              discountPercent: Number(
                                value(diners === 2 ? "discountPercent" : `discount${diners}`),
                              ),
                            })),
                            fundedBy: value("fundedBy") || undefined,
                            terms: value("terms") || undefined,
                            validUntil: value("validUntil")
                              ? new Date(
                                  `${value("validUntil")}T23:59:59`,
                                ).getTime()
                              : undefined,
                            ...(confirmed
                              ? { active: true, partnerConfirmed: true }
                              : {}),
                          };
                          const saved = await change(
                            () =>
                              api(`/admin/meal-offers/${editing.id}`, {
                                method: "PATCH",
                                body: JSON.stringify(body),
                              }),
                            confirmed
                              ? "Approved offer published"
                              : "Restaurant offer saved",
                          );
                          if (saved) setManageOpen(false);
                        }}
                      >
                        <div className="admin-offer-status">
                          {editing.active
                            ? `${editing.discountPercent}% published`
                            : "Unpublished draft · no discount promised"}
                        </div>
                        <div className="admin-form-row">
                          <label>
                            Name
                            <input
                              name="restaurantName"
                              required
                              defaultValue={editing.restaurantName}
                              maxLength={80}
                            />
                          </label>
                          <label>
                            Area
                            <input
                              name="area"
                              required
                              defaultValue={editing.area}
                              maxLength={80}
                            />
                          </label>
                        </div>
                        <label>
                          Address
                          <input
                            name="address"
                            defaultValue={editing.address || ""}
                            maxLength={140}
                          />
                        </label>
                        <h3>Restaurant contact</h3>
                        <label>
                          Contact person name
                          <input
                            name="contactName"
                            defaultValue={editing.contactName || ""}
                            maxLength={100}
                          />
                        </label>
                        <label>
                          Email
                          <input
                            name="contactEmail"
                            type="email"
                            defaultValue={editing.contactEmail || ""}
                            maxLength={254}
                          />
                        </label>
                        <label>
                          Phone
                          <input
                            name="contactPhone"
                            type="tel"
                            defaultValue={editing.contactPhone || ""}
                            maxLength={30}
                          />
                        </label>
                        <div className="admin-form-row">
                          <label>
                            Latitude
                            <input
                              name="lat"
                              type="number"
                              step="any"
                              defaultValue={editing.lat}
                            />
                          </label>
                          <label>
                            Longitude
                            <input
                              name="lng"
                              type="number"
                              step="any"
                              defaultValue={editing.lng}
                            />
                          </label>
                        </div>
                        <label>
                          Assigned staff Circle ID
                          <input
                            name="managerId"
                            defaultValue={editing.managerId || ""}
                            placeholder="Existing signed-in staff account"
                            maxLength={100}
                          />
                        </label>
                        <div className="admin-form-row">
                          <label>
                            2 diners (%)
                            <input
                              name="discountPercent"
                              type="number"
                              min={1}
                              max={50}
                              defaultValue={editing.discountPercent}
                            />
                          </label>
                          <label>
                            Funded by
                            <select
                              name="fundedBy"
                              defaultValue={editing.fundedBy || ""}
                            >
                              <option value="">Choose</option>
                              <option value="restaurant">Restaurant</option>
                              <option value="friendcircle">FriendCircle</option>
                              <option value="shared">Shared</option>
                            </select>
                          </label>
                        </div>
                        <div className="admin-form-row">
                          <label>
                            3 diners (%)
                            <input
                              name="discount3"
                              type="number"
                              min={1}
                              max={50}
                              required
                              defaultValue={
                                editing.groupDiscountTiers?.find((tier) => tier.diners === 3)?.discountPercent ??
                                Math.min(50, (editing.discountPercent || 10) + 5)
                              }
                            />
                          </label>
                          <label>
                            4+ diners (%)
                            <input
                              name="discount4"
                              type="number"
                              min={1}
                              max={50}
                              required
                              defaultValue={
                                editing.groupDiscountTiers?.find((tier) => tier.diners === 4)?.discountPercent ??
                                Math.min(50, (editing.discountPercent || 10) + 10)
                              }
                            />
                          </label>
                        </div>
                        <p className="admin-panel-note">
                          Four or more diners receive the highest tier. The
                          restaurant must approve every tier before publishing.
                        </p>
                        <label>
                          Maximum offer redemptions
                          <input
                            name="redemptionLimit"
                            type="number"
                            min={1}
                            max={1000000}
                            required
                            defaultValue={editing.redemptionLimit}
                          />
                        </label>
                        <p className="admin-panel-note">
                          {analytics?.offers.byRestaurant.find((o) => o.id === editing.id)?.redeemed || 0} already redeemed. Each meal code uses one offer; the venue leaves the map when the limit is reached.
                        </p>
                        <label>
                          Valid through
                          <input
                            name="validUntil"
                            type="date"
                            defaultValue={
                              editing.validUntil
                                ? new Date(editing.validUntil)
                                    .toISOString()
                                    .slice(0, 10)
                                : ""
                            }
                          />
                        </label>
                        <label>
                          Full offer terms
                          <textarea
                            name="terms"
                            maxLength={500}
                            defaultValue={editing.terms || ""}
                            placeholder="Eligible meals, exclusions and redemption conditions"
                          />
                        </label>
                        <label className="admin-confirm">
                          <input type="checkbox" name="partnerConfirmed" /> I
                          have written venue approval for this exact discount,
                          funding and terms; publish it.
                        </label>
                        <div className="admin-buttons">
                          <button className="primary" disabled={busy}>
                            Save offer
                          </button>
                          {editing.active && (
                            <button
                              className="secondary"
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                const unpublished = await change(
                                  () =>
                                    api(`/admin/meal-offers/${editing.id}`, {
                                      method: "PATCH",
                                      body: JSON.stringify({ active: false }),
                                    }),
                                  "Offer unpublished",
                                );
                                if (unpublished) setManageOpen(false);
                              }}
                            >
                              Unpublish
                            </button>
                          )}
                          <button
                            className="admin-delete-button"
                            type="button"
                            disabled={busy}
                            onClick={() => setDeleteConfirm(true)}
                          >
                            Delete restaurant
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                ) : (
                  <p className="admin-empty">No restaurants registered yet.</p>
                )}
              </RestaurantDialog>
            )}
            {manageOpen && editing && deleteConfirm && (
              <RestaurantDialog
                title={`Delete ${editing.restaurantName}?`}
                close={() => setDeleteConfirm(false)}
              >
                <p className="admin-delete-warning">
                  This removes the restaurant from the dashboard and map.
                  Pending invitations and unused discount codes for this
                  restaurant will expire. Past activity remains in aggregate
                  reports.
                </p>
                <div className="admin-buttons">
                  <button
                    className="secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="admin-delete-button admin-delete-confirm"
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const removed = await change(
                        () =>
                          api(`/admin/meal-offers/${editing.id}`, {
                            method: "DELETE",
                          }),
                        "Restaurant removed",
                      );
                      if (removed) {
                        setDeleteConfirm(false);
                        setManageOpen(false);
                      }
                    }}
                  >
                    Delete restaurant
                  </button>
                </div>
              </RestaurantDialog>
            )}
            <section className="admin-panel">
              <div className="admin-section-head">
                <h2>Community reports</h2>
                <span>{analytics.openReports} open</span>
              </div>
              {reports.filter((r) => !r.resolved).length ? (
                reports
                  .filter((r) => !r.resolved)
                  .map((r) => (
                    <div className="admin-report" key={r.id}>
                      <div>
                        <strong>Reported account {r.target}</strong>
                        <p>{r.reason}</p>
                        <small>Submitted by {r.from}</small>
                      </div>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          change(
                            () =>
                              api(`/admin/reports/${r.id}/resolve`, {
                                method: "POST",
                              }),
                            "Report resolved",
                          )
                        }
                      >
                        Mark resolved
                      </button>
                    </div>
                  ))
              ) : (
                <p className="admin-empty">No open community reports.</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
