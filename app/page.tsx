"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { io } from "socket.io-client";
import {
  MapPin,
  Users,
  MessageCircle,
  ShieldCheck,
  Cable,
  Settings,
  Plus,
  Search,
  ChevronDown,
  ArrowUpRight,
  ArrowLeft,
  X,
  Send,
  Check,
  CheckCheck,
  ImagePlus,
  Lock,
  EyeOff,
  Navigation,
  Bell,
  LogOut,
  Flag,
  UserRoundX,
  Clock,
  Heart,
  LoaderCircle,
  Utensils,
  Store,
  BarChart3,
  Coins,
  Copy,
} from "lucide-react";
import MapView, { Avatar, type Friend } from "@/components/Map";
import {
  activities,
  mealBrowseKm,
  type Activity,
  type Person,
  type Message,
  type Verification,
  type MealOffer,
  type MealVoucher,
  type MealGatheringView,
  type MealInvitation,
  type ChatRequest,
} from "@/lib/model";
import { api } from "@/lib/api";
import GroupChats from "@/components/GroupChats";
import { keys, encrypt, decrypt } from "@/lib/crypto";
type RequestView = Verification & { fromName: string; toName: string };
type MealOfferView = MealOffer & {
  distance?: number;
  remainingRedemptions?: number;
};
type MealVoucherView = MealVoucher & { restaurantName?: string };
type MealInvitationView = MealInvitation & {
  friendName?: string;
  restaurantName?: string;
};
type AppState = {
  me: Person;
  friends: Friend[];
  discoverable: Friend[];
  publicProfiles: Friend[];
  suburbAchievements: {
    connectedSuburbs: number;
    milestones: number[];
    unlocked: number[];
    nextMilestone: number | null;
  };
  chatContacts: Friend[];
  conversationIds: string[];
  chatRequests: (ChatRequest & { fromName?: string; toName?: string })[];
  suburb: { code: string; name: string; geometry: GeoJSON.Geometry } | null;
  friendPresence: { id: string; name: string }[];
  mealOffers: MealOfferView[];
  mealVouchers: MealVoucherView[];
  mealInvitations: MealInvitationView[];
  mealGatherings: MealGatheringView[];
  merchant: boolean;
  meetings: {
    a: string;
    b: string;
    seconds: number;
    active: boolean;
    friendName?: string;
  }[];
  requests: RequestView[];
  demo: boolean;
  admin: boolean;
  onboarding?: boolean;
};
type View =
  | "map"
  | "catchup"
  | "friends"
  | "messages"
  | "requests"
  | "profile"
  | "settings"
  | "admin"
  | "merchant";
function Dialog({
  children,
  title,
  close,
}: {
  children: React.ReactNode;
  title: string;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      aria-label={title}
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Balance({
  characters,
  credits,
  className,
}: {
  characters: number;
  credits: number;
  className: string;
}) {
  return (
    <div
      className={`balance-display ${className}`}
      role="status"
      aria-label={`${characters} chat characters and ${credits} social credits`}
    >
      <span title="Chat characters available">
        <MessageCircle size={14} />
        <strong>{characters.toLocaleString()}</strong>
        <small>chars</small>
      </span>
      <span title="Social credits">
        <Coins size={14} />
        <strong>{credits.toLocaleString()}</strong>
        <small>credits</small>
      </span>
    </div>
  );
}
export default function Home() {
  const [messagesTab, setMessagesTab] = useState<
    "direct" | "groups" | "invitations"
  >("direct");
  const [config, setConfig] = useState<{ demo: boolean }>(),
    [data, setData] = useState<AppState>(),
    [view, setView] = useState<View>("map"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Friend>(),
    [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(
      null,
    ),
    [previewRestaurantId, setPreviewRestaurantId] = useState<string | null>(
      null,
    ),
    [openRestaurantId, setOpenRestaurantId] = useState<string | null>(null),
    [pendingTarget, setPendingTarget] = useState(""),
    [modal, setModal] = useState<
      "add" | "status" | "report" | "block" | "partner" | null
    >(null),
    [toast, setToast] = useState(""),
    [presenceAlert, setPresenceAlert] = useState(false),
    [publicProfileAlert, setPublicProfileAlert] = useState(false),
    [offerAlert, setOfferAlert] = useState(false),
    [error, setError] = useState(""),
    [login, setLogin] = useState(false),
    [busy, setBusy] = useState(false),
    [chat, setChat] = useState<Friend>(),
    [messages, setMessages] = useState<(Message & { plain: string })[]>([]),
    [draft, setDraft] = useState(""),
    [admin, setAdmin] = useState<any>(),
    [adminOffers, setAdminOffers] = useState<MealOffer[]>([]),
    [editingOffer, setEditingOffer] = useState<MealOffer>(),
    [merchantData, setMerchantData] = useState<any>(),
    [merchantCode, setMerchantCode] = useState(""),
    [redeemedMeal, setRedeemedMeal] = useState<any>(),
    [mealFocusNonce, setMealFocusNonce] = useState(0),
    [statusActivity, setStatusActivity] = useState<Activity>("coffee"),
    [statusText, setStatusText] = useState(""),
    [statusEmoji, setStatusEmoji] = useState(""),
    [photoPreview, setPhotoPreview] = useState(""),
    [loginBusy, setLoginBusy] = useState(false);
  const pair = useRef<CryptoKeyPair | undefined>(undefined),
    geoWatch = useRef<number | undefined>(undefined),
    chatEnd = useRef<HTMLDivElement>(null),
    seenMealInvitations = useRef<Set<string>>(new Set());
  const seenGatherings = useRef<Set<string>>(new Set());
  const lastPresence = useRef<Set<string> | null>(null);
  const lastPublicProfiles = useRef<Set<string> | null>(null);
  const lastOffers = useRef<Set<string> | null>(null);
  const lastSuburb = useRef<string | null>(null);
  const notify = useCallback((text: string) => setToast(text), []);
  const refresh = useCallback(async () => {
    try {
      const result = await api<AppState>("/state");
      setData(result);
      const suburbCode = result.suburb?.code || null;
      if (
        lastSuburb.current !== null &&
        suburbCode &&
        suburbCode !== lastSuburb.current
      )
        notify(
          `Welcome to ${result.suburb?.name}. Friends in this suburb are now on your map.`,
        );
      lastSuburb.current = suburbCode;
      const currentPresence = new Set(
        (result.friendPresence || []).map((friend) => friend.id),
      );
      if (lastPresence.current) {
        const arriving = (result.friendPresence || []).find(
          (friend) => !lastPresence.current?.has(friend.id),
        );
        if (arriving) {
          notify(
            `${arriving.name} is in ${result.suburb?.name || "your suburb"}.`,
          );
          setPresenceAlert(true);
        }
      }
      lastPresence.current = currentPresence;
      const nearbyProfiles = (result.publicProfiles || []).filter(
        (profile) => profile.nearby && profile.visibility === "public",
      );
      const freshProfiles = nearbyProfiles.filter(
        (profile) =>
          lastPublicProfiles.current &&
          !lastPublicProfiles.current.has(profile.id),
      );
      const nearbyOffers = result.mealOffers || [];
      const freshOffers = nearbyOffers.filter(
        (offer) => lastOffers.current && !lastOffers.current.has(offer.id),
      );
      lastPublicProfiles.current = new Set(
        nearbyProfiles.map((profile) => profile.id),
      );
      lastOffers.current = new Set(nearbyOffers.map((offer) => offer.id));
      if (freshProfiles.length) setPublicProfileAlert(true);
      if (freshOffers.length) setOfferAlert(true);
      if (freshProfiles.length || freshOffers.length) {
        notify(
          [
            freshProfiles.length
              ? `${freshProfiles.length} new public ${freshProfiles.length === 1 ? "profile" : "profiles"} in ${result.suburb?.name || "your suburb"}`
              : "",
            freshOffers.length
              ? `${freshOffers.length} new nearby restaurant ${freshOffers.length === 1 ? "offer" : "offers"} in Catch up`
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
        );
      }
      for (const invitation of result.mealInvitations || []) {
        if (invitation.acceptedAt || invitation.expiresAt <= Date.now())
          continue;
        if (seenMealInvitations.current.has(invitation.id)) continue;
        seenMealInvitations.current.add(invitation.id);
        setToast(
          `${invitation.friendName || "A friend"} is close by! A meal offer at ${invitation.restaurantName || "a nearby restaurant"} is waiting in Catch up. Accept within 24 hours.`,
        );
      }
      for (const gathering of result.mealGatherings || []) {
        if (
          gathering.myStatus !== "pending" ||
          gathering.expiresAt <= Date.now()
        )
          continue;
        if (seenGatherings.current.has(gathering.id)) continue;
        seenGatherings.current.add(gathering.id);
        const restaurant = result.mealOffers?.find(
          (offer) => offer.id === gathering.offerId,
        );
        notify(
          `${gathering.hostName} invited you to ${restaurant?.restaurantName || "a restaurant"}. Open Catch up to accept within 24 hours.`,
        );
      }
      setLogin(false);
      setError("");
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("sign in")) setLogin(true);
      else setError(msg);
    }
  }, [notify]);
  useEffect(() => {
    api("/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PAGES_PREVIEW === "1") return;
    if (!data?.me) return;
    const socket = io();
    socket.on("refresh", refresh);
    return () => {
      socket.disconnect();
    };
  }, [data?.me?.id, refresh]);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PAGES_PREVIEW === "1") return;
    if (!data?.me?.id) return;
    let stopped = false;
    keys(data.me.id)
      .then(async (p) => {
        if (stopped) return;
        pair.current = p;
        await api("/keys", {
          method: "POST",
          body: JSON.stringify(
            await crypto.subtle.exportKey("jwk", p.publicKey),
          ),
        });
      })
      .catch((e) => notify(`Chat setup: ${e.message}`));
    return () => {
      stopped = true;
    };
  }, [data?.me?.id, notify]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!data?.me || data.demo || !data.me.sharing) return;
    if (!navigator.geolocation) {
      notify("Location is not supported in this browser.");
      return;
    }
    let active = true;
    const update = () =>
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (active)
            api("/me", {
              method: "PATCH",
              body: JSON.stringify({
                lat: p.coords.latitude,
                lng: p.coords.longitude,
              }),
            }).catch((e) => notify(e.message));
        },
        () => {
          if (!active) return;
          api("/me", {
            method: "PATCH",
            body: JSON.stringify({ sharing: false }),
          }).then(refresh);
          notify("Location permission is needed. Sharing has been paused.");
        },
        { enableHighAccuracy: false, maximumAge: 25000, timeout: 15000 },
      );
    update();
    const timer = setInterval(update, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [data?.me?.sharing, data?.demo, refresh, notify]);
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );
  const loadChat = useCallback(async () => {
    if (!chat || !data?.me) return;
    try {
      const items = await api<Message[]>(`/messages/${chat.id}`);
      const p = pair.current || (await keys(data.me.id));
      setMessages(
        await Promise.all(
          items.map(async (m) => ({
            ...m,
            plain: await decrypt(m, data.me.id, p),
          })),
        ),
      );
    } catch (e) {
      notify((e as Error).message);
    }
  }, [chat?.id, data?.me?.id, notify]);
  useEffect(() => {
    loadChat();
  }, [loadChat, data]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);
  useEffect(() => {
    if (view === "admin") {
      api("/admin")
        .then(setAdmin)
        .catch((e) => notify(e.message));
      api<MealOffer[]>("/admin/meal-offers")
        .then(setAdminOffers)
        .catch((e) => notify(e.message));
    }
    if (view === "merchant")
      api("/meals/merchant")
        .then(setMerchantData)
        .catch((e) => notify(e.message));
  }, [view, data, notify]);
  async function action(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (success) notify(success);
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function hi(f: Friend) {
    await action(
      () =>
        api(`/messages/${f.id}`, {
          method: "POST",
          body: JSON.stringify({ kind: "hi" }),
        }),
      `Your hi is on its way to ${f.name.split(" ")[0]} 👋`,
    );
  }
  function openChat(f: Friend) {
    setMessagesTab("direct");
    setChat(f);
    setSelected(undefined);
    setView("messages");
  }
  function openAddFriend() {
    setPendingTarget("");
    setModal("add");
  }
  function copyCircleId() {
    if (!data?.me || !navigator.clipboard?.writeText) {
      notify("Please select and copy your Circle ID.");
      return;
    }
    navigator.clipboard
      .writeText(data.me.id)
      .then(() => notify("Circle ID copied"))
      .catch(() => notify("Please select and copy your Circle ID."));
  }
  function showStatus() {
    setStatusActivity(data!.me.activity);
    setStatusText(data!.me.status);
    setStatusEmoji(data!.me.statusEmoji || "");
    setModal("status");
  }
  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !chat || !pair.current) return;
    const friend = [
      ...(data?.friends || []),
      ...(data?.chatContacts || []),
    ].find((f) => f.id === chat.id);
    if (!friend?.publicKey) {
      notify(
        "Your friend needs to open FriendCircle on their device to enable encrypted chat.",
      );
      return;
    }
    const text = draft;
    const ok = await action(async () => {
      const encrypted = await encrypt(text, pair.current!, friend.publicKey!);
      await api(`/messages/${chat.id}`, {
        method: "POST",
        body: JSON.stringify(encrypted),
      });
    });
    if (ok) {
      setDraft("");
      await loadChat();
    }
  }
  const filtered =
    data?.friends.filter(
      (f) =>
        f.name.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "all" ||
          (filter === "nearby" && f.nearby) ||
          f.activity === filter),
    ) || [];
  const nearby = data?.friends.filter((f) => f.nearby) || [];
  const conversations = (data?.conversationIds || [])
    .map((id) =>
      [...(data?.friends || []), ...(data?.chatContacts || [])].find(
        (person) => person.id === id,
      ),
    )
    .filter((person): person is Friend => !!person);
  const pendingChatRequests = (data?.chatRequests || []).filter(
    (request) => request.state === "pending",
  );
  if (login)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <Brand />
          <h1>Welcome back to your circle.</h1>
          <p>Sign in to find your people nearby.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLoginBusy(true);
              const form = new FormData(e.currentTarget);
              try {
                await api("/login", {
                  method: "POST",
                  body: JSON.stringify(Object.fromEntries(form)),
                });
                await refresh();
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setLoginBusy(false);
              }
            }}
          >
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <button className="primary" disabled={loginBusy}>
              {loginBusy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <small>
            New accounts are invited by your community administrator.
          </small>
        </div>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </main>
    );
  if (data?.onboarding)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <Brand />
          <h1>Make yourself at home.</h1>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await action(() =>
                api("/onboard", {
                  method: "POST",
                  body: JSON.stringify({
                    name: f.get("name"),
                    adult: f.get("adult") === "on",
                  }),
                }),
              );
            }}
          >
            <label>
              Your name
              <input name="name" required maxLength={60} />
            </label>
            <label className="check-label">
              <input type="checkbox" name="adult" required />I confirm that I am
              18 or older.
            </label>
            <button className="primary" disabled={busy}>
              Create my profile
            </button>
          </form>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  if (!data?.me)
    return (
      <main className="auth-page">
        <Brand />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="primary" onClick={refresh}>
              Try again
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>Finding your circle…</p>
          </>
        )}
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="brand-symbol" href={process.env.NEXT_PUBLIC_PAGES_PREVIEW === "1" ? "/FriendCircle/" : "/"} aria-label="FriendCircle home">
          <span />
          <span />
        </a>
        <nav>
          {(
            [
              { id: "map", icon: MapPin, label: "Nearby map" },
              { id: "messages", icon: MessageCircle, label: "Messages" },
              { id: "catchup", icon: Utensils, label: "Catch up" },
              { id: "friends", icon: Users, label: "My circle" },
              { id: "requests", icon: Cable, label: "Friend requests" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              title={item.label}
              aria-label={item.label}
              aria-current={view === item.id ? "page" : undefined}
              className={view === item.id ? "active" : ""}
              onClick={() => {
                setView(item.id);
                setSelected(undefined);
                if (item.id === "map") {
                  setPresenceAlert(false);
                  setPublicProfileAlert(false);
                }
                if (item.id === "catchup") setOfferAlert(false);
              }}
            >
              <item.icon size={22} />
              {item.id === "requests" &&
                data.requests.some(
                  (r) => r.state === "pending" && r.to === data.me.id,
                ) && <i />}
              {item.id === "messages" &&
                pendingChatRequests.some((r) => r.to === data.me.id) && <i />}
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          {(data.merchant || data.admin) && (
            <button
              title="Restaurant redemption"
              aria-label="Restaurant redemption"
              className={view === "merchant" ? "active" : ""}
              onClick={() => setView("merchant")}
            >
              <Utensils size={22} />
            </button>
          )}
          {data.admin && (
            <button
              title="Platform admin"
              aria-label="Platform admin"
              onClick={() => window.location.assign("/admin/login")}
            >
              <BarChart3 size={22} />
            </button>
          )}
          {data.admin && (
            <button
              title="Review dashboard"
              aria-label="Review dashboard"
              className={view === "admin" ? "active" : ""}
              onClick={() => setView("admin")}
            >
              <ShieldCheck size={22} />
            </button>
          )}
          <button
            title="Settings"
            aria-label="Settings"
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <Settings size={22} />
          </button>
          <button
            className={view === "profile" ? "active" : ""}
            onClick={() => setView("profile")}
            aria-label="My profile"
          >
            <Avatar person={data.me} size="small" />
          </button>
        </div>
      </aside>
      <div className="workspace">
        {process.env.NEXT_PUBLIC_PAGES_PREVIEW === "1" && (
          <div className="pages-preview-note" role="note">
            Preview with fictional people and places · Live chat, rewards, sign-in, and redemption need the local app
          </div>
        )}
        <header className="header">
          <Brand />
          <div className="header-right">
            <span className="privacy-label">
              <Lock size={13} /> A space for your people
            </span>
            {config?.demo && <span className="demo-badge">DEMO</span>}
            <Balance
              characters={data.me.textCharacters || 0}
              credits={data.me.socialCredits || 0}
              className="header-balance"
            />
            <button
              className="icon-button notifications"
              aria-label={
                data.mealInvitations?.some(
                  (v) => !v.acceptedAt && v.expiresAt > Date.now(),
                ) ||
                data.mealGatherings?.some(
                  (g) => g.myStatus === "pending" && g.expiresAt > Date.now(),
                )
                  ? "View meal offer in Catch up"
                  : offerAlert
                    ? "View new restaurant offers in Catch up"
                    : presenceAlert
                      ? "View friends in your suburb"
                      : publicProfileAlert
                        ? "View new public profiles in your suburb"
                        : data.requests.some(
                              (r) =>
                                (r.to === data.me.id &&
                                  r.state === "pending") ||
                                (r.from === data.me.id && r.state === "review"),
                            )
                          ? "View friend requests"
                          : pendingChatRequests.some((r) => r.to === data.me.id)
                            ? "View chat invitations"
                            : "View friend requests"
              }
              onClick={() => {
                const hasMeal =
                  data.mealInvitations?.some(
                    (v) => !v.acceptedAt && v.expiresAt > Date.now(),
                  ) ||
                  data.mealGatherings?.some(
                    (g) => g.myStatus === "pending" && g.expiresAt > Date.now(),
                  );
                const hasFriendRequest = data.requests.some(
                  (r) =>
                    (r.to === data.me.id && r.state === "pending") ||
                    (r.from === data.me.id && r.state === "review"),
                );
                const destination: View =
                  hasMeal || offerAlert
                    ? "catchup"
                    : presenceAlert || publicProfileAlert
                      ? "map"
                      : hasFriendRequest
                        ? "requests"
                        : pendingChatRequests.some((r) => r.to === data.me.id)
                          ? "messages"
                          : "requests";
                setView(destination);
                if (
                  destination === "messages" &&
                  pendingChatRequests.some((r) => r.to === data.me.id)
                )
                  setMessagesTab("invitations");
                if (destination === "map") {
                  setPresenceAlert(false);
                  setPublicProfileAlert(false);
                }
                if (destination === "catchup") setOfferAlert(false);
                if (hasMeal) setMealFocusNonce((n) => n + 1);
              }}
            >
              <Bell size={20} />
              {data.requests.some(
                (r) =>
                  (r.to === data.me.id && r.state === "pending") ||
                  (r.from === data.me.id && r.state === "review"),
              ) ||
              pendingChatRequests.some((r) => r.to === data.me.id) ||
              presenceAlert ||
              publicProfileAlert ||
              offerAlert ||
              data.mealInvitations?.some(
                (v) => !v.acceptedAt && v.expiresAt > Date.now(),
              ) ||
              data.mealGatherings?.some(
                (g) => g.myStatus === "pending" && g.expiresAt > Date.now(),
              ) ? (
                <i />
              ) : null}
            </button>
            <button
              className={`profile-button ${view === "profile" ? "active" : ""}`}
              onClick={() => setView("profile")}
              aria-label="My profile"
            >
              <Avatar person={data.me} size="small" />
              <span>{data.me.name.split(" ")[0]}</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={refresh}>Retry</button>
          </div>
        )}
        {view !== "messages" && view !== "friends" && view !== "requests" && (
          <div className="page-title">
            <div>
              <div className="eyebrow">
                {view === "map"
                  ? "GOOD PEOPLE, CLOSE BY"
                  : view === "catchup"
                    ? "SHARE A MEAL NEARBY"
                    : "YOUR LITTLE CORNER"}
              </div>
              <h1>
                {
                  {
                    map: "Life happens nearby.",
                    catchup: "Catch up over a meal.",
                    friends: "Your kind of people.",
                    messages: "A little hello goes a long way.",
                    requests: "Real moments. Real friends.",
                    profile: "Your profile, your story.",
                    settings: "Your space, your rules.",
                    admin: "Keep the circle safe.",
                    merchant: "Make a meal moment count.",
                  }[view]
                }
              </h1>
              {view === "map" ? (
                <div className="page-location" aria-label="Your local circle">
                  <div className="page-location-name">
                    <MapPin size={17} />
                    <strong>{data.suburb?.name || "Suburb unavailable"}</strong>
                  </div>
                  <span className="suburb-pill">
                    {data.suburb ? "Local circle" : "Perth demo coverage"}
                  </span>
                  <button
                    className="circle-id-copy"
                    onClick={copyCircleId}
                    aria-label={`Copy Circle ID ${data.me.id}`}
                    title="Copy Circle ID"
                  >
                    <span>Circle ID</span>
                    <strong>{data.me.id}</strong>
                    <Copy size={14} />
                  </button>
                </div>
              ) : (
                <p>
                  {
                    {
                      catchup: `Explore restaurant deals within ${mealBrowseKm} km and invite friends along.`,
                      friends: "Every connection starts with a shared moment.",
                      messages: "Private conversations with people you know.",
                      requests: "Bring the people you know into your circle.",
                      profile: "Share what makes you, you.",
                      settings: "Choose what you share and how you show up.",
                      admin:
                        "Review photos and help resolve community reports.",
                      merchant:
                        "Redeem a shared-meal code for your restaurant.",
                    }[view]
                  }
                </p>
              )}
            </div>
            {view === "map" && (
              <button className="primary add-button" onClick={openAddFriend}>
                <Plus size={18} /> Add a friend
              </button>
            )}
          </div>
        )}
        <main className={`main-content view-${view}`}>
          {(view === "map" || view === "friends" || view === "catchup") && (
            <>
              {view === "map" ? null : view === "catchup" ? (
                <section
                  className="circle-panel restaurant-panel"
                  aria-label="Restaurants currently offering"
                >
                  <div className="panel-heading">
                    <h2>
                      Catch up <span>{data.mealOffers.length}</span>
                    </h2>
                  </div>
                  <p className="restaurant-panel-intro">
                    Restaurants offering within {mealBrowseKm} km of you. Hover
                    to locate one, or select it to see its distance and discount
                    tiers.
                  </p>
                  <div className="restaurant-offer-list">
                    {data.mealOffers.length ? (
                      data.mealOffers.map((offer) => (
                        <div
                          className={`restaurant-offer-row ${selectedRestaurantId === offer.id ? "chosen" : ""}`}
                          key={offer.id}
                        >
                          <button
                            className="restaurant-offer-select"
                            aria-label={`Show ${offer.restaurantName} location and offer details`}
                            aria-pressed={selectedRestaurantId === offer.id}
                            onMouseEnter={() =>
                              setPreviewRestaurantId(offer.id)
                            }
                            onMouseLeave={() => setPreviewRestaurantId(null)}
                            onFocus={() => setPreviewRestaurantId(offer.id)}
                            onBlur={() => setPreviewRestaurantId(null)}
                            onClick={() => {
                              setSelectedRestaurantId(offer.id);
                              setOpenRestaurantId(offer.id);
                            }}
                          >
                            <span className="restaurant-offer-icon">
                              <Store size={18} />
                            </span>
                            <span className="restaurant-offer-copy">
                              <strong>{offer.restaurantName}</strong>
                              <small>
                                {offer.area} · Up to{" "}
                                {offer.groupDiscountTiers?.at(-1)
                                  ?.discountPercent ?? offer.discountPercent}
                                % off
                              </small>
                              <small>
                                {offer.remainingRedemptions ?? 0} offers left
                              </small>
                            </span>
                          </button>
                          <button
                            className="restaurant-redeem-button"
                            onClick={() => {
                              setSelectedRestaurantId(offer.id);
                              setOpenRestaurantId(offer.id);
                            }}
                            aria-label={`Redeem offer at ${offer.restaurantName}`}
                          >
                            Redeem
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="restaurant-offer-empty">
                        <Store size={22} />
                        <p>
                          {data.me.sharing
                            ? `No restaurant offers within ${mealBrowseKm} km right now.`
                            : `Enable location sharing to see deals within ${mealBrowseKm} km.`}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              ) : (
                <section className="circle-panel">
                  <div className="panel-heading">
                    <h2>
                      Your circle <span>{data.friends.length}</span>
                    </h2>
                    <span className="small-caps">
                      {nearby.length} IN YOUR SUBURB
                    </span>
                  </div>
                  <div className="circle-add-row">
                    <button className="primary" onClick={openAddFriend}>
                      <Plus size={17} /> Add a friend
                    </button>
                  </div>
                  <div className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Search your circle"
                      placeholder="Find a friend…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <span>⌕</span>
                  </div>
                  <div className="filter-row">
                    <button
                      className={filter === "all" ? "selected" : ""}
                      onClick={() => setFilter("all")}
                    >
                      Everyone
                    </button>
                    <button
                      className={filter === "nearby" ? "selected" : ""}
                      onClick={() => setFilter("nearby")}
                    >
                      Same suburb
                    </button>
                    <select
                      aria-label="Filter by activity"
                      value={["all", "nearby"].includes(filter) ? "" : filter}
                      onChange={(e) => setFilter(e.target.value || "all")}
                    >
                      <option value="">Activity</option>
                      {Object.entries(activities).map(([key, a]) => (
                        <option key={key} value={key}>
                          {a.emoji} {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="friend-list">
                    {filtered.length ? (
                      filtered.map((f) => (
                        <button
                          className={`friend-row ${selected?.id === f.id ? "chosen" : ""}`}
                          key={f.id}
                          onClick={() => setSelected(f)}
                        >
                          <div className="avatar-wrap">
                            <Avatar person={f} />
                            <span
                              className={`friend-activity activity-${f.activity}`}
                            >
                              {f.statusEmoji || activities[f.activity].emoji}
                            </span>
                          </div>
                          <div className="friend-info">
                            <strong>
                              {f.name}
                              <ShieldCheck size={13} />
                            </strong>
                            <span>{f.status}</span>
                            <small>
                              {f.nearby ? (
                                <>
                                  <span className="tiny-dot" />
                                  In your suburb
                                </>
                              ) : f.sharing ? (
                                "Outside your suburb"
                              ) : (
                                "Location paused"
                              )}
                            </small>
                          </div>
                          <ArrowUpRight size={15} className="row-arrow" />
                        </button>
                      ))
                    ) : (
                      <div className="empty-inline">
                        <Search />
                        <p>
                          {data.friends.length
                            ? "No friends match this filter."
                            : "Your circle starts with one friend."}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="circle-footer">
                    <ShieldCheck size={19} />
                    <p>
                      Real friends. Verified together.
                      <span>
                        {data.me.visibility === "public"
                          ? "People in your suburb with shared interests can discover you."
                          : "Only your circle can see you here."}
                      </span>
                    </p>
                  </div>
                </section>
              )}
              {view === "map" || view === "catchup" ? (
                <section className="map-panel">
                  {view === "map" && (
                    <div className="status-bar">
                      <button className="my-status" onClick={showStatus}>
                        <span
                          className={`status-emoji activity-${data.me.activity}`}
                        >
                          {data.me.statusEmoji ||
                            activities[data.me.activity].emoji}
                        </span>
                        <div>
                          <small>YOUR STATUS</small>
                          <strong>{data.me.status}</strong>
                        </div>
                        <ChevronDown size={16} />
                      </button>
                      <div className="sharing-status">
                        <span
                          className={
                            data.me.sharing ? "live-dot" : "paused-dot"
                          }
                        />
                        <span>
                          {data.me.sharing
                            ? data.me.visibility === "public"
                              ? "Suburb presence visible to shared-interest matches"
                              : "Suburb presence visible to friends"
                            : "Location paused"}
                        </span>
                        <button
                          onClick={() =>
                            action(
                              () =>
                                api("/me", {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    sharing: !data.me.sharing,
                                  }),
                                }),
                              data.me.sharing
                                ? "Location sharing paused"
                                : "Location sharing enabled",
                            )
                          }
                        >
                          {data.me.sharing ? "Pause" : "Resume"}
                        </button>
                      </div>
                    </div>
                  )}
                  {view === "map" && (
                    <div className="suburb-achievements map-achievements">
                      <div className="map-achievements-intro">
                        <div>
                          <h3>Friends across suburbs</h3>
                          <p>
                            {data.suburbAchievements?.connectedSuburbs || 0}{" "}
                            distinct suburbs in your circle
                          </p>
                        </div>
                        <div
                          className="suburb-achievement-steps"
                          aria-label="Suburb achievements"
                        >
                          {(
                            data.suburbAchievements?.milestones || [3, 5, 8]
                          ).map((milestone) => (
                            <span
                              key={milestone}
                              className={
                                data.suburbAchievements?.unlocked.includes(
                                  milestone,
                                )
                                  ? "unlocked"
                                  : ""
                              }
                            >
                              {data.suburbAchievements?.unlocked.includes(
                                milestone,
                              )
                                ? "✓ "
                                : ""}
                              {milestone} suburbs
                            </span>
                          ))}
                        </div>
                      </div>
                      <small>
                        {data.suburbAchievements?.nextMilestone
                          ? `Connect across ${data.suburbAchievements.nextMilestone} suburbs for the next achievement.`
                          : "All suburb achievements unlocked."}{" "}
                        More perks are planned for the future.
                      </small>
                    </div>
                  )}
                  {view === "catchup" && (
                    <div className="map-toolbar">
                      <div className="location-heading">
                        <MapPin size={17} />
                        <strong>{mealBrowseKm} km around you</strong>
                        <span>Deals near your location</span>
                      </div>
                      <span className="suburb-pill">Local offers</span>
                    </div>
                  )}
                  <MapView
                    mode={view === "catchup" ? "restaurants" : "friends"}
                    friends={data.friends}
                    me={data.me}
                    suburb={data.suburb}
                    onConnect={openChat}
                    onCatchUp={() => {
                      setView("catchup");
                      setOfferAlert(false);
                    }}
                    demo={data.demo}
                    offers={view === "catchup" ? data.mealOffers || [] : []}
                    invitations={data.mealInvitations || []}
                    vouchers={data.mealVouchers || []}
                    gatherings={data.mealGatherings || []}
                    busy={busy}
                    focusNonce={mealFocusNonce}
                    selectedRestaurantId={selectedRestaurantId}
                    previewRestaurantId={previewRestaurantId}
                    openRestaurantId={openRestaurantId}
                    onSelectRestaurant={(id, open) => {
                      setSelectedRestaurantId(id);
                      setOpenRestaurantId(open ? id : null);
                    }}
                    onAccept={(id) =>
                      action(
                        () =>
                          api(`/meal-invitations/${id}/accept`, {
                            method: "POST",
                          }),
                        "Shared meal offer accepted",
                      )
                    }
                    onCreateGathering={(offerId, friends) =>
                      action(
                        () =>
                          api("/meals/gatherings", {
                            method: "POST",
                            body: JSON.stringify({ offerId, friends }),
                          }),
                        "Meal invitations sent",
                      )
                    }
                    onRespondGathering={(id, accept) =>
                      action(
                        () =>
                          api(`/meals/gatherings/${id}/respond`, {
                            method: "POST",
                            body: JSON.stringify({ accept }),
                          }),
                        accept
                          ? "Meal invitation accepted"
                          : "Meal invitation declined",
                      )
                    }
                  />
                  {view === "map" && (
                    <div className="meet-strip">
                      <Clock size={17} />
                      {data.meetings?.some((m) => m.active) ? (
                        data.meetings
                          .filter((m) => m.active)
                          .map((m) => (
                            <span key={`${m.a}:${m.b}`}>
                              With {m.friendName}: {Math.floor(m.seconds / 60)}m{" "}
                              {Math.floor(m.seconds % 60)}s
                            </span>
                          ))
                      ) : (
                        <span>
                          Meet a connected friend to earn chat characters and
                          social credits.
                        </span>
                      )}
                    </div>
                  )}
                  {view === "map" && data.suburb && (
                    <div className="public-list map-public-list">
                      <div className="map-public-heading">
                        <div>
                          <h3>Public profiles in {data.suburb.name}</h3>
                          <p>People in your suburb who share your interests.</p>
                        </div>
                        <span>
                          {data.publicProfiles?.filter(
                            (f) => f.nearby && f.visibility === "public",
                          ).length || 0}{" "}
                          nearby
                        </span>
                      </div>
                      <div className="map-public-profiles">
                        {data.publicProfiles?.filter(
                          (f) => f.nearby && f.visibility === "public",
                        ).length ? (
                          data.publicProfiles
                            .filter(
                              (f) => f.nearby && f.visibility === "public",
                            )
                            .map((f) => (
                              <button
                                className="friend-row"
                                key={f.id}
                                onClick={() => setSelected(f)}
                              >
                                <Avatar person={f} size="small" />
                                <div className="friend-info">
                                  <strong>{f.name}</strong>
                                  <small>
                                    {f.commonTraits?.length
                                      ? `In common: ${f.commonTraits.join(", ")}`
                                      : data.suburb?.name}
                                  </small>
                                </div>
                                <ArrowUpRight size={14} />
                              </button>
                            ))
                        ) : (
                          <p className="map-public-empty">
                            No shared-interest public profiles in this suburb
                            yet.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <section className="friend-grid">
                  {filtered.map((f) => (
                    <article className="person-card" key={f.id}>
                      <Avatar person={f} size="large" />
                      <h2>{f.name}</h2>
                      <span className="pill">
                        {f.statusEmoji || activities[f.activity].emoji}{" "}
                        {activities[f.activity].label}
                      </span>
                      <p>{f.status}</p>
                      <small>
                        {f.nearby ? "In your suburb" : "Location unavailable"}
                      </small>
                      <div>
                        <button
                          className="secondary"
                          onClick={() => setSelected(f)}
                        >
                          View profile
                        </button>
                        <button className="primary" onClick={() => openChat(f)}>
                          <MessageCircle size={16} /> Chat
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              )}
            </>
          )}
          {view === "messages" && (
            <>
              <div className="chat-mode-tabs">
                <button
                  className={messagesTab === "direct" ? "selected" : ""}
                  aria-pressed={messagesTab === "direct"}
                  onClick={() => setMessagesTab("direct")}
                >
                  Direct messages
                </button>
                <button
                  className={messagesTab === "groups" ? "selected" : ""}
                  aria-pressed={messagesTab === "groups"}
                  onClick={() => setMessagesTab("groups")}
                >
                  Local groups
                </button>
                <button
                  className={messagesTab === "invitations" ? "selected" : ""}
                  aria-pressed={messagesTab === "invitations"}
                  onClick={() => setMessagesTab("invitations")}
                >
                  Chat invitations
                  {pendingChatRequests.length > 0 && (
                    <span className="chat-invitation-count">
                      {pendingChatRequests.length}
                    </span>
                  )}
                </button>
              </div>
              {messagesTab === "groups" ? (
                <GroupChats
                  me={data.me}
                  friends={data.friends}
                  revision={data}
                  notify={notify}
                />
              ) : messagesTab === "invitations" ? (
                <section className="content-card chat-invitations">
                  <h2>Chat invitations</h2>
                  {pendingChatRequests.length ? (
                    pendingChatRequests.map((request) => (
                      <div className="request-row" key={request.id}>
                        <div className="request-icon">
                          <MessageCircle />
                        </div>
                        <div>
                          <strong>
                            {request.from === data.me.id
                              ? request.toName
                              : request.fromName}
                          </strong>
                          <p>300 chat characters each after acceptance</p>
                          <small>
                            {request.from === data.me.id
                              ? "Sent · waiting for a reply"
                              : "Invited you to chat"}
                          </small>
                        </div>
                        {request.to === data.me.id && (
                          <div className="button-row">
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                action(() =>
                                  api(`/chat-requests/${request.id}/respond`, {
                                    method: "POST",
                                    body: JSON.stringify({ accept: false }),
                                  }),
                                )
                              }
                            >
                              Decline
                            </button>
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() =>
                                action(
                                  () =>
                                    api(
                                      `/chat-requests/${request.id}/respond`,
                                      {
                                        method: "POST",
                                        body: JSON.stringify({
                                          accept: true,
                                        }),
                                      },
                                    ),
                                  "Chat opened with 300 characters each",
                                )
                              }
                            >
                              Accept chat
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="chat-invitations-empty">
                      No chat invitations right now.
                    </p>
                  )}
                </section>
              ) : (
                <div className="direct-messages">
                  <section className="messages-layout">
                    <aside className="conversation-list">
                      <h2>Conversations</h2>
                      {conversations.length === 0 && (
                        <p className="conversation-empty">
                          No conversations yet.
                        </p>
                      )}
                      {conversations.map((f) => (
                        <button
                          key={f.id}
                          className={`friend-row ${chat?.id === f.id ? "chosen" : ""}`}
                          onClick={() => {
                            setChat(f);
                            setMessages([]);
                          }}
                        >
                          <Avatar person={f} />
                          <div className="friend-info">
                            <strong>{f.name}</strong>
                            <span>
                              {f.statusEmoji || activities[f.activity].emoji}{" "}
                              {f.status}
                            </span>
                          </div>
                        </button>
                      ))}
                    </aside>
                    <div className="chat-panel">
                      {chat ? (
                        <>
                          <div className="chat-heading">
                            <Avatar person={chat} />
                            <div>
                              <h2>{chat.name}</h2>
                              <small>
                                <Lock size={12} /> Encrypted on your device
                              </small>
                            </div>
                            {data.friends.some((f) => f.id === chat.id) && (
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => hi(chat)}
                              >
                                👋 Send hi
                              </button>
                            )}
                          </div>
                          <div className="chat-messages">
                            {messages.length === 0 && (
                              <div className="empty-state">
                                <MessageCircle size={38} />
                                <h2>Say hello to {chat.name.split(" ")[0]}.</h2>
                                <p>
                                  {data.demo
                                    ? "Demo friends can receive a hi. Encrypted text needs a real friend signed in on their own device."
                                    : "A shared moment is just a message away."}
                                </p>
                              </div>
                            )}
                            {messages.map((m) => (
                              <div
                                className={`message ${m.from === data.me.id ? "outgoing" : "incoming"}`}
                                key={m.id}
                              >
                                <p>{m.plain}</p>
                                <small>
                                  {new Date(m.createdAt).toLocaleTimeString(
                                    [],
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                  {m.kind === "hi" && " · disappears in 2h"}
                                  {m.from === data.me.id && <Check size={12} />}
                                </small>
                              </div>
                            ))}
                            <div ref={chatEnd} />
                          </div>
                          <form
                            className="message-composer"
                            onSubmit={sendMessage}
                          >
                            <input
                              aria-label="Message"
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder="Send a little hello…"
                              maxLength={4000}
                            />
                            <small className="character-counter">
                              {(data.chatContacts || []).find(
                                (f) => f.id === chat.id,
                              )?.chatRemaining ??
                                (data.me.textCharacters || 0)}{" "}
                              characters available ·{" "}
                              {new TextEncoder().encode(draft).length} needed
                              {((data.chatContacts || []).find(
                                (f) => f.id === chat.id,
                              )?.chatRemaining ??
                                (data.me.textCharacters || 0)) === 0 &&
                                " · Meet a friend to earn more"}
                            </small>
                            <button
                              className="primary"
                              aria-label="Send message"
                              disabled={
                                busy ||
                                !draft.trim() ||
                                new TextEncoder().encode(draft).length >
                                  ((data.chatContacts || []).find(
                                    (f) => f.id === chat.id,
                                  )?.chatRemaining ??
                                    (data.me.textCharacters || 0))
                              }
                            >
                              <Send size={19} />
                            </button>
                          </form>
                          <div className="encryption-note">
                            <Lock size={12} /> Message content is encrypted
                            before it leaves your browser.
                          </div>
                        </>
                      ) : (
                        <div className="empty-state">
                          <MessageCircle size={44} />
                          <h2>Your people, one message away.</h2>
                          <p>
                            Open someone from My circle and say hello to start a
                            conversation.
                          </p>
                          {(data.chatContacts || [])
                            .filter(
                              (person) =>
                                !data.conversationIds.includes(person.id),
                            )
                            .map((person) => (
                              <button
                                className="secondary"
                                key={person.id}
                                onClick={() => openChat(person)}
                              >
                                Start a chat with {person.name}
                              </button>
                            ))}
                          <button
                            className="primary"
                            onClick={() => setView("friends")}
                          >
                            Browse My circle
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
          {view === "requests" && (
            <section className="content-card">
              <div className="section-heading">
                <h2>Friend requests</h2>
                <span className="pill">Photo verified connections</span>
              </div>
              {data.requests.length ? (
                data.requests.map((r) => (
                  <div className="request-row" key={r.id}>
                    <div className="request-icon">
                      <Cable />
                    </div>
                    <div>
                      <strong>
                        {r.from === data.me.id ? r.toName : r.fromName}
                      </strong>
                      <p>{r.reason}</p>
                      <small>
                        {new Date(r.createdAt).toLocaleDateString()} ·{" "}
                        {r.from === data.me.id ? "Sent" : "Received"}
                      </small>
                    </div>
                    <span className={`pill state-${r.state}`}>
                      {r.state === "review"
                        ? "In review"
                        : r.state === "pending"
                          ? "Awaiting acceptance"
                          : r.state}
                    </span>
                    {r.to === data.me.id && r.state === "pending" && (
                      <div className="button-row">
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            action(() =>
                              api(`/requests/${r.id}/respond`, {
                                method: "POST",
                                body: JSON.stringify({ accept: false }),
                              }),
                            )
                          }
                        >
                          Decline
                        </button>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            action(
                              () =>
                                api(`/requests/${r.id}/respond`, {
                                  method: "POST",
                                  body: JSON.stringify({ accept: true }),
                                }),
                              "Welcome to the circle!",
                            )
                          }
                        >
                          Accept
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <Cable size={46} />
                  <h2>Start with a shared memory.</h2>
                  <p>
                    Start a shared photo request from Nearby map or My circle.
                    Once it’s checked and your friend accepts, you’re connected.
                  </p>
                </div>
              )}
              {data.demo && (
                <div className="demo-request-history">
                  <h3>
                    Sample past requests <span>Demo examples</span>
                  </h3>
                  <div className="request-row">
                    <div className="request-icon">
                      <Cable />
                    </div>
                    <div>
                      <strong>James</strong>
                      <p>
                        Shared photo verified. James accepted your friend
                        request.
                      </p>
                      <small>Past request · Sent</small>
                    </div>
                    <span className="pill state-accepted">Accepted</span>
                  </div>
                  <div className="request-row">
                    <div className="request-icon">
                      <Cable />
                    </div>
                    <div>
                      <strong>Ella</strong>
                      <p>Example of a photo request that was declined.</p>
                      <small>Past request · Sent</small>
                    </div>
                    <span className="pill state-rejected">Declined</span>
                  </div>
                </div>
              )}
            </section>
          )}
          {view === "profile" && (
            <section className="settings-grid">
              <form
                className="content-card profile-editor"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const tags = (field: string) =>
                    String(form.get(field) || "")
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean);
                  await action(
                    () =>
                      api("/me", {
                        method: "PATCH",
                        body: JSON.stringify({
                          bio: String(form.get("bio") || "").trim(),
                          hobbies: tags("hobbies"),
                          favoriteFoods: tags("favoriteFoods"),
                          sports: tags("sports"),
                          movies: tags("movies"),
                          games: tags("games"),
                        }),
                      }),
                    "Profile updated",
                  );
                }}
              >
                <h2>Your profile</h2>
                <div className="profile-editor-intro">
                  <Avatar person={data.me} size="large" />
                  <p>
                    Use Profile details to change your profile picture. Public
                    profiles are discovered through shared interests in the same
                    suburb.
                  </p>
                </div>
                <label>
                  Bio
                  <textarea
                    name="bio"
                    maxLength={500}
                    defaultValue={data.me.bio || ""}
                    placeholder="A little about you"
                  />
                </label>
                <label>
                  Hobbies
                  <input
                    name="hobbies"
                    defaultValue={data.me.hobbies?.join(", ") || ""}
                    placeholder="Coffee, hiking, art"
                  />
                </label>
                <label>
                  Favorite food
                  <input
                    name="favoriteFoods"
                    defaultValue={data.me.favoriteFoods?.join(", ") || ""}
                    placeholder="Pizza, sushi"
                  />
                </label>
                <label>
                  Sports
                  <input
                    name="sports"
                    defaultValue={data.me.sports?.join(", ") || ""}
                    placeholder="Running, tennis"
                  />
                </label>
                <label>
                  Movies
                  <input
                    name="movies"
                    defaultValue={data.me.movies?.join(", ") || ""}
                    placeholder="Comedy, sci-fi"
                  />
                </label>
                <label>
                  Games
                  <input
                    name="games"
                    defaultValue={data.me.games?.join(", ") || ""}
                    placeholder="Board games, chess"
                  />
                </label>
                <small>
                  Separate interests with commas. Add up to 12 per field.
                </small>
                <button className="primary" disabled={busy}>
                  Save profile
                </button>
              </form>
              <div className="content-card">
                <h2>Profile details</h2>
                <div className="setting-row">
                  <div>
                    <strong>Profile visibility</strong>
                    <p>
                      Public appears to people in your suburb with a shared
                      interest. Private appears only to connected friends.
                    </p>
                  </div>
                  <select
                    aria-label="Profile visibility"
                    value={data.me.visibility || "private"}
                    onChange={(e) =>
                      action(() =>
                        api("/me", {
                          method: "PATCH",
                          body: JSON.stringify({ visibility: e.target.value }),
                        }),
                      )
                    }
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Profile picture</strong>
                    <p>
                      Share a photo with friends. Public photos are visible on
                      public profiles.
                    </p>
                  </div>
                  <label className="secondary avatar-upload">
                    Choose photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="Upload map avatar"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const form = new FormData();
                        form.set("photo", file);
                        await action(
                          () => api("/avatar", { method: "POST", body: form }),
                          "Map avatar updated",
                        );
                      }}
                    />
                  </label>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Current status</strong>
                    <p>
                      {data.me.statusEmoji ||
                        activities[data.me.activity].emoji}{" "}
                      {data.me.status}
                    </p>
                  </div>
                  <button className="secondary" onClick={showStatus}>
                    Update
                  </button>
                </div>
              </div>
            </section>
          )}
          {view === "settings" && (
            <section className="settings-grid">
              <div className="content-card">
                <h2>Privacy & location</h2>
                <div className="setting-row">
                  <div>
                    <strong>Chat & social credits</strong>
                    <p>
                      Each 10 minutes together earns 100 chat characters and 5
                      social credits.
                    </p>
                  </div>
                  <span>
                    {data.me.textCharacters || 0} characters ·{" "}
                    {data.me.socialCredits || 0} social credits
                  </span>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Use my location</strong>
                    <p>
                      We use your location to find your suburb and check meet
                      eligibility. Other users see only same-suburb presence,
                      never your coordinates.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={data.me.sharing}
                    aria-label="Use my location for suburb presence"
                    className={`switch ${data.me.sharing ? "on" : ""}`}
                    onClick={() =>
                      action(() =>
                        api("/me", {
                          method: "PATCH",
                          body: JSON.stringify({ sharing: !data.me.sharing }),
                        }),
                      )
                    }
                  >
                    <span />
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Your Circle ID</strong>
                    <p>Give this to someone you know to connect.</p>
                    <code>{data.me.id}</code>
                  </div>
                  <button className="secondary" onClick={copyCircleId}>
                    Copy
                  </button>
                </div>
                {!data.demo && (
                  <button
                    className="secondary"
                    onClick={async () => {
                      await api("/logout", { method: "POST" });
                      window.location.reload();
                    }}
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                )}
              </div>
              <div className="content-card privacy-card">
                <ShieldCheck size={30} />
                <h2>Choose how to connect.</h2>
                <p>
                  Friends connect through a verified photo request. A public
                  profile can also accept a limited chat request. Your map
                  suburb presence follows your profile visibility. Exact
                  locations stay off other users&apos; maps.
                </p>
                <ul>
                  <li>Unresolved photos are removed after 24 hours.</li>
                  <li>Accepted or rejected photos are deleted.</li>
                  <li>A “hi” disappears after two hours.</li>
                  <li>
                    Encrypted chat keys stay on this device. Keep this browser’s
                    data to retain access.
                  </li>
                </ul>
                <small>
                  Age eligibility is self-attested (18+). Face detection checks
                  visibility, not identity or age.
                </small>
              </div>
            </section>
          )}
          {view === "admin" && (
            <section className="content-card">
              <div className="section-heading">
                <h2>Verification queue</h2>
                <span className="pill">
                  {data.demo ? "Demo reviewer" : "Authorized reviewer"}
                </span>
              </div>
              {admin ? (
                <>
                  <div className="review-grid">
                    {admin.requests
                      .filter((r: any) => r.state === "review")
                      .map((r: any) => (
                        <article className="review-card" key={r.id}>
                          {r.hasPhoto && (
                            <img
                              src={`/api/admin/photo/${r.id}`}
                              alt={`Submitted verification for ${r.fromName} and ${r.toName}`}
                            />
                          )}
                          <h3>
                            {r.fromName} + {r.toName}
                          </h3>
                          <p>{r.reason}</p>
                          <small>
                            Check that exactly two faces are clearly visible.
                            Approval still requires the recipient’s acceptance.
                          </small>
                          <div className="button-row">
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                action(
                                  () =>
                                    api(`/admin/review/${r.id}`, {
                                      method: "POST",
                                      body: JSON.stringify({ approve: false }),
                                    }),
                                  "Photo rejected",
                                )
                              }
                            >
                              Reject
                            </button>
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() =>
                                action(
                                  () =>
                                    api(`/admin/review/${r.id}`, {
                                      method: "POST",
                                      body: JSON.stringify({ approve: true }),
                                    }),
                                  "Photo approved; waiting for recipient",
                                )
                              }
                            >
                              Approve photo
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                  {!admin.requests.some((r: any) => r.state === "review") && (
                    <div className="empty-inline">
                      <CheckCheck />
                      <p>You’re all caught up. No photos need review.</p>
                    </div>
                  )}
                  <h2 className="reports-title">Community reports</h2>
                  {admin.reports
                    .filter((r: any) => !r.resolved)
                    .map((r: any) => (
                      <div className="request-row" key={r.id}>
                        <Flag size={22} />
                        <div>
                          <strong>Reported account: {r.target}</strong>
                          <p>{r.reason}</p>
                          <small>From {r.from}</small>
                        </div>
                        <button
                          className="secondary"
                          onClick={() =>
                            action(
                              () =>
                                api(`/admin/reports/${r.id}/resolve`, {
                                  method: "POST",
                                }),
                              "Report marked resolved",
                            )
                          }
                        >
                          Mark resolved
                        </button>
                      </div>
                    ))}
                  {!admin.reports.some((r: any) => !r.resolved) && (
                    <p className="muted">No open reports.</p>
                  )}
                  <div className="section-heading meal-admin-heading">
                    <h2>Restaurant offers</h2>
                    <span className="pill">
                      {adminOffers.filter((o) => o.active).length} published
                    </span>
                  </div>
                  <p className="muted">
                    A restaurant name is a proposal until the venue confirms the
                    exact discount and terms. Users see only published offers.
                  </p>
                  {adminOffers.map((offer) => (
                    <div className="request-row" key={offer.id}>
                      <Utensils size={22} />
                      <div>
                        <strong>
                          {offer.restaurantName} · {offer.area}
                        </strong>
                        <p>{offer.address || "Address pending"}</p>
                        <small>
                          {offer.active
                            ? `${offer.discountPercent}% offer published`
                            : "Unpublished draft · no discount promised"}
                        </small>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => {
                          setEditingOffer(offer);
                          setModal("partner");
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                  <form
                    className="restaurant-draft-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const formElement = e.currentTarget;
                      const f = new FormData(formElement);
                      const ok = await action(
                        () =>
                          api("/admin/meal-offers", {
                            method: "POST",
                            body: JSON.stringify({
                              restaurantName: f.get("restaurantName"),
                              area: f.get("area"),
                              address: f.get("address") || undefined,
                            }),
                          }),
                        "Restaurant draft saved",
                      );
                      if (ok) formElement.reset();
                    }}
                  >
                    <h3>Add restaurant draft</h3>
                    <input
                      name="restaurantName"
                      aria-label="Restaurant name"
                      placeholder="Restaurant name"
                      required
                      maxLength={80}
                    />
                    <input
                      name="area"
                      aria-label="Restaurant area"
                      placeholder="Area"
                      required
                      maxLength={80}
                    />
                    <input
                      name="address"
                      aria-label="Restaurant address"
                      placeholder="Address (optional)"
                      maxLength={140}
                    />
                    <button className="secondary" disabled={busy}>
                      Save draft
                    </button>
                  </form>
                </>
              ) : (
                <p>Loading review queue…</p>
              )}
            </section>
          )}
          {view === "merchant" && (
            <section className="content-card merchant-card">
              <div className="section-heading">
                <h2>Restaurant redemption</h2>
                <span className="pill">Staff access</span>
              </div>
              <p>
                Ask an accepted diner for the shared code. Confirm the group is
                present, then redeem it once at the discount unlocked by the
                accepted diner count.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const result = await api<any>("/meals/redeem", {
                      method: "POST",
                      body: JSON.stringify({ code: merchantCode }),
                    });
                    setRedeemedMeal(result);
                    setMerchantCode("");
                    await refresh();
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <label>
                  Meal code
                  <input
                    value={merchantCode}
                    onChange={(e) =>
                      setMerchantCode(e.target.value.toUpperCase())
                    }
                    aria-label="Meal code"
                    placeholder="16-character code"
                    maxLength={16}
                    required
                  />
                </label>
                <button
                  className="primary"
                  disabled={merchantCode.length !== 16 || busy}
                >
                  Redeem code
                </button>
              </form>
              {redeemedMeal && (
                <div className="redeemed-result" role="status">
                  <CheckCheck size={20} />
                  <div>
                    <strong>
                      {redeemedMeal.discountPercent}% discount redeemed at{" "}
                      {redeemedMeal.restaurantName}
                    </strong>
                    <p>
                      {redeemedMeal.diners?.join(" and ")} ·{" "}
                      {redeemedMeal.terms}
                    </p>
                  </div>
                </div>
              )}
              {merchantData?.offers?.length ? (
                <p className="muted">
                  {data?.admin
                    ? "Restaurants in review"
                    : "Assigned restaurants"}
                  :{" "}
                  {merchantData.offers
                    .map(
                      (o: any) =>
                        `${o.restaurantName} (${o.remainingRedemptions ?? 0} offers left)`,
                    )
                    .join(", ")}
                </p>
              ) : (
                <p className="muted">
                  No restaurant manager assignment yet. Authorized admins can
                  test redemption.
                </p>
              )}
            </section>
          )}
        </main>
        {view === "map" && (
          <footer className="page-footer">
            <span>
              <Heart size={14} /> Less scrolling. More showing up.
            </span>
            <span>
              <ShieldCheck size={14} /> You choose who sees your location.
            </span>
          </footer>
        )}
      </div>
      {selected && (
        <Dialog
          title={
            selected.connected === false
              ? "Nearby public profile"
              : "In your circle"
          }
          close={() => setSelected(undefined)}
        >
          <div className="profile-detail">
            <Avatar person={selected} size="large" />
            <h2>
              {selected.name}
              {selected.connected !== false && <ShieldCheck size={20} />}
            </h2>
            <span className={`pill activity-${selected.activity}`}>
              {selected.statusEmoji || activities[selected.activity].emoji}{" "}
              {activities[selected.activity].label}
            </span>
            <p>{selected.status}</p>
            {selected.bio && <p className="profile-bio">{selected.bio}</p>}
            {(
              ["hobbies", "favoriteFoods", "sports", "movies", "games"] as const
            ).map((field) =>
              selected[field]?.length ? (
                <div className="profile-traits" key={field}>
                  <strong>
                    {
                      {
                        hobbies: "Hobbies",
                        favoriteFoods: "Favorite food",
                        sports: "Sports",
                        movies: "Movies",
                        games: "Games",
                      }[field]
                    }
                  </strong>
                  <span>{selected[field]?.join(" · ")}</span>
                </div>
              ) : null,
            )}
            {!!selected.commonTraits?.length && (
              <p className="common-traits">
                In common: {selected.commonTraits.join(" · ")}
              </p>
            )}
            <small>
              <MapPin size={14} />
              {selected.nearby
                ? `In ${data.suburb?.name || "your suburb"}`
                : "Location is not shared right now"}
            </small>
            <div className="profile-actions">
              {selected.connected === false ? (
                <>
                  {data.chatContacts?.some((f) => f.id === selected.id) ? (
                    <button
                      className="primary"
                      onClick={() => openChat(selected)}
                    >
                      Open chat
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        data.chatRequests?.some(
                          (r) =>
                            (r.from === selected.id && r.to === data.me.id) ||
                            (r.to === selected.id && r.from === data.me.id),
                        )
                      }
                      onClick={async () => {
                        if (
                          await action(
                            () =>
                              api(`/chat-requests/${selected.id}`, {
                                method: "POST",
                              }),
                            "Chat request sent",
                          )
                        )
                          setSelected(undefined);
                      }}
                    >
                      Request a chat · 300 characters
                    </button>
                  )}
                  <button
                    className="secondary"
                    onClick={() => {
                      setPendingTarget(selected.id);
                      setSelected(undefined);
                      setModal("add");
                    }}
                  >
                    Connect with a shared photo
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="primary"
                    disabled={busy || !selected.nearby}
                    onClick={() => hi(selected)}
                  >
                    👋 Send a hi
                  </button>
                  <button
                    className="secondary"
                    onClick={() => openChat(selected)}
                  >
                    <MessageCircle size={17} /> Message
                  </button>
                </>
              )}
            </div>
            {selected.connected !== false && (
              <div className="verified-note">
                <ShieldCheck size={18} />
                <div>
                  <strong>Connected through a shared photo</strong>
                  <p>
                    {data.demo
                      ? "Sample verified friendship."
                      : "Accepted friendship. The original photo is no longer retained."}
                  </p>
                </div>
              </div>
            )}
            <div className="profile-safety">
              {selected.connected !== false && (
                <button onClick={() => setModal("report")}>
                  <Flag size={14} /> Report
                </button>
              )}
              <button onClick={() => setModal("block")}>
                <UserRoundX size={14} /> Block
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {modal === "add" && (
        <Dialog
          title="A shared photo. A real connection."
          close={() => {
            setModal(null);
            setPhotoPreview("");
          }}
        >
          <p className="dialog-description">
            Add someone you know with a photo of the two of you together.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              form.set("adult", "true");
              form.set("consent", "true");
              const ok = await action(
                () => api("/requests", { method: "POST", body: form }),
                "Photo submitted. Follow its progress in Friend requests.",
              );
              if (ok) {
                setModal(null);
                setPhotoPreview("");
                setView("requests");
              }
            }}
          >
            <label>
              Your friend’s Circle ID
              <input
                name="to"
                defaultValue={pendingTarget}
                placeholder={
                  data.demo ? "Try ella in this demo" : "Paste their Circle ID"
                }
                required
                maxLength={100}
              />
            </label>
            <label
              className={`photo-upload ${photoPreview ? "has-photo" : ""}`}
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Selected verification photo" />
              ) : (
                <>
                  <ImagePlus size={32} />
                  <strong>A photo with both of you</strong>
                  <span>Clear faces, good light, a real moment.</span>
                  <small>JPG, PNG or WebP · up to 8 MB</small>
                </>
              )}
              <input
                aria-label="Upload photo of both people"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && f.size > 8 * 1024 * 1024) {
                    notify("Choose a photo smaller than 8 MB.");
                    e.target.value = "";
                    setPhotoPreview("");
                    return;
                  }
                  setPhotoPreview(f ? URL.createObjectURL(f) : "");
                }}
              />
            </label>
            <label className="check-label">
              <input type="checkbox" name="adult" required />
              We are both 18 or older.
            </label>
            <label className="check-label">
              <input type="checkbox" name="consent" required />I have permission
              from both people to upload this photo.
            </label>
            <div className="form-note">
              <Lock size={15} />
              <span>
                Your photo is private. Unresolved uploads are deleted after 24
                hours. Your friend must accept before you connect.
              </span>
            </div>
            <button className="primary full-width" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={17} /> Checking your
                  photo…
                </>
              ) : (
                <>
                  <ShieldCheck size={17} /> Submit for verification
                </>
              )}
            </button>
          </form>
        </Dialog>
      )}
      {modal === "partner" && editingOffer && (
        <Dialog
          title={`Restaurant draft · ${editingOffer.restaurantName}`}
          close={() => {
            setModal(null);
            setEditingOffer(undefined);
          }}
        >
          <p className="dialog-description">
            This offer stays unpublished until the restaurant approves the exact
            discount, funding, dates, and terms.
          </p>
          <form
            className="partner-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const value = (key: string) => String(f.get(key) || "").trim();
              const publish = f.get("partnerConfirmed") === "on";
              const body = {
                restaurantName: value("restaurantName"),
                area: value("area"),
                address: value("address") || undefined,
                lat: value("lat") ? Number(value("lat")) : undefined,
                lng: value("lng") ? Number(value("lng")) : undefined,
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
                    value(
                      diners === 2 ? "discountPercent" : `discount${diners}`,
                    ),
                  ),
                })),
                fundedBy: value("fundedBy") || undefined,
                terms: value("terms") || undefined,
                validUntil: value("validUntil")
                  ? new Date(`${value("validUntil")}T23:59:59`).getTime()
                  : undefined,
                ...(publish ? { active: true, partnerConfirmed: true } : {}),
              };
              const ok = await action(
                () =>
                  api(`/admin/meal-offers/${editingOffer.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(body),
                  }),
                publish ? "Meal offer published" : "Restaurant draft saved",
              );
              if (ok) {
                setModal(null);
                setEditingOffer(undefined);
              }
            }}
          >
            <label>
              Restaurant name
              <input
                name="restaurantName"
                defaultValue={editingOffer.restaurantName}
                required
                maxLength={80}
              />
            </label>
            <label>
              Area
              <input
                name="area"
                defaultValue={editingOffer.area}
                required
                maxLength={80}
              />
            </label>
            <label>
              Address
              <input
                name="address"
                defaultValue={editingOffer.address || ""}
                maxLength={140}
              />
            </label>
            <div className="partner-grid">
              <label>
                Latitude
                <input
                  name="lat"
                  type="number"
                  step="any"
                  defaultValue={editingOffer.lat}
                />
              </label>
              <label>
                Longitude
                <input
                  name="lng"
                  type="number"
                  step="any"
                  defaultValue={editingOffer.lng}
                />
              </label>
            </div>
            <label>
              Restaurant manager Circle ID
              <input
                name="managerId"
                defaultValue={editingOffer.managerId || ""}
                placeholder="Staff account ID"
                maxLength={100}
              />
            </label>
            <div className="partner-grid">
              <label>
                2 diners (%)
                <input
                  name="discountPercent"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={editingOffer.discountPercent}
                />
              </label>
              <label>
                Funded by
                <select
                  name="fundedBy"
                  defaultValue={editingOffer.fundedBy || ""}
                >
                  <option value="">Choose funding</option>
                  <option value="restaurant">Restaurant</option>
                  <option value="friendcircle">FriendCircle</option>
                  <option value="shared">Shared</option>
                </select>
              </label>
            </div>
            <div className="partner-grid">
              <label>
                3 diners (%)
                <input
                  name="discount3"
                  type="number"
                  min={1}
                  max={50}
                  required
                  defaultValue={
                    editingOffer.groupDiscountTiers?.find(
                      (tier) => tier.diners === 3,
                    )?.discountPercent ??
                    Math.min(50, (editingOffer.discountPercent || 10) + 5)
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
                    editingOffer.groupDiscountTiers?.find(
                      (tier) => tier.diners === 4,
                    )?.discountPercent ??
                    Math.min(50, (editingOffer.discountPercent || 10) + 10)
                  }
                />
              </label>
            </div>
            <label>
              Maximum offer redemptions
              <input
                name="redemptionLimit"
                type="number"
                min={1}
                max={1000000}
                required
                defaultValue={editingOffer.redemptionLimit}
              />
            </label>
            <label>
              Offer valid through
              <input
                name="validUntil"
                type="date"
                defaultValue={
                  editingOffer.validUntil
                    ? new Date(editingOffer.validUntil)
                        .toISOString()
                        .slice(0, 10)
                    : ""
                }
              />
            </label>
            <label>
              Full meal terms
              <textarea
                name="terms"
                defaultValue={editingOffer.terms || ""}
                maxLength={500}
                placeholder="Eligible meals, exclusions, and redemption conditions"
              />
            </label>
            <label className="check-label">
              <input type="checkbox" name="partnerConfirmed" /> I have written
              approval from this restaurant for these exact terms and funding;
              publish this offer.
            </label>
            <div className="button-row">
              <button className="primary" disabled={busy}>
                Save offer
              </button>
              {editingOffer.active && (
                <button
                  type="button"
                  className="secondary"
                  onClick={async () => {
                    if (
                      await action(
                        () =>
                          api(`/admin/meal-offers/${editingOffer.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ active: false }),
                          }),
                        "Offer unpublished",
                      )
                    ) {
                      setModal(null);
                      setEditingOffer(undefined);
                    }
                  }}
                >
                  Unpublish
                </button>
              )}
            </div>
          </form>
        </Dialog>
      )}
      {modal === "status" && (
        <Dialog title="What are you up to?" close={() => setModal(null)}>
          <p className="dialog-description">
            Give your circle a little window into your day.
          </p>
          <div className="activity-options">
            {Object.entries(activities).map(([id, a]) => (
              <button
                className={statusActivity === id ? "selected" : ""}
                key={id}
                onClick={() => setStatusActivity(id as Activity)}
              >
                <span className={`activity-${id}`}>{a.emoji}</span>
                {a.label}
                {statusActivity === id && <Check size={14} />}
              </button>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await action(
                () =>
                  api("/me", {
                    method: "PATCH",
                    body: JSON.stringify({
                      activity: statusActivity,
                      status: statusText,
                      statusEmoji,
                    }),
                  }),
                "Your circle is up to date",
              );
              if (ok) setModal(null);
            }}
          >
            <label>
              Custom emoji (optional)
              <input
                value={statusEmoji}
                onChange={(e) => setStatusEmoji(e.target.value)}
                maxLength={16}
                placeholder="Pick your own emoji, like 🌻"
              />
            </label>
            <label>
              A little more about your day
              <input
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                maxLength={100}
                required
                placeholder="Up for a coffee?"
              />
            </label>
            <button className="primary full-width" disabled={busy}>
              Update my status
            </button>
          </form>
        </Dialog>
      )}
      {modal === "report" && selected && (
        <Dialog
          title={`Report ${selected.name.split(" ")[0]}`}
          close={() => setModal(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const reason = new FormData(e.currentTarget).get("reason");
              const ok = await action(
                () =>
                  api(`/report/${selected.id}`, {
                    method: "POST",
                    body: JSON.stringify({ reason }),
                  }),
                "Your report has been sent to a reviewer",
              );
              if (ok) setModal(null);
            }}
          >
            <label>
              What happened?
              <textarea
                name="reason"
                required
                minLength={5}
                maxLength={1000}
                rows={4}
              />
            </label>
            <button className="primary" disabled={busy}>
              Submit report
            </button>
          </form>
        </Dialog>
      )}
      {modal === "block" && selected && (
        <Dialog
          title={`Block ${selected.name.split(" ")[0]}?`}
          close={() => setModal(null)}
        >
          <p>
            They will no longer see your location or be able to message you.
            They’ll be removed from your circle.
          </p>
          <div className="button-row">
            <button className="secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                const ok = await action(
                  () => api(`/block/${selected.id}`, { method: "POST" }),
                  "Account blocked",
                );
                if (ok) {
                  setModal(null);
                  setSelected(undefined);
                  setChat(undefined);
                }
              }}
            >
              Block account
            </button>
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span>
        friend<span>circle</span>
        <i />
      </span>
    </div>
  );
}
