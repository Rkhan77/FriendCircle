"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, Navigation, Utensils, Ticket, X } from "lucide-react";
import type { Map as LibreMap, Marker, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  mealBrowseKm,
  type Person,
  type MealOffer,
  type MealInvitation,
  type MealVoucher,
  type MealGatheringView,
} from "@/lib/model";

export type Friend = Omit<Person, "lat" | "lng"> & {
  nearby: boolean;
  connected?: boolean;
  commonTraits?: string[];
  chatRemaining?: number;
};
export function Avatar({
  person,
  size = "normal",
}: {
  person: Pick<Person, "initials" | "color"> &
    Partial<Pick<Person, "id" | "avatarFile">>;
  size?: "normal" | "large" | "small";
}) {
  return (
    <span className={`avatar ${size}`} style={{ background: person.color }}>
      {person.avatarFile && person.id ? (
        <img src={`/api/avatar/${person.id}`} alt="" />
      ) : (
        person.initials
      )}
    </span>
  );
}
function suburbData(
  suburb?: { geometry: GeoJSON.Geometry } | null,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: suburb
      ? [{ type: "Feature", properties: {}, geometry: suburb.geometry }]
      : [],
  };
}
function catchUpCirclePoints(location: { lat: number; lng: number }) {
  const lat = (location.lat * Math.PI) / 180;
  const lng = (location.lng * Math.PI) / 180;
  const radius = mealBrowseKm / 6371;
  const points: number[][] = [];
  for (let step = 0; step <= 96; step++) {
    const bearing = (step / 96) * Math.PI * 2;
    const nextLat = Math.asin(
      Math.sin(lat) * Math.cos(radius) +
        Math.cos(lat) * Math.sin(radius) * Math.cos(bearing),
    );
    const nextLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(radius) * Math.cos(lat),
        Math.cos(radius) - Math.sin(lat) * Math.sin(nextLat),
      );
    points.push([(nextLng * 180) / Math.PI, (nextLat * 180) / Math.PI]);
  }
  return points;
}
function catchUpRadiusData(location: {
  lat: number;
  lng: number;
}): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [catchUpCirclePoints(location)],
        },
      },
    ],
  };
}
function fitCatchUpRadius(
  map: LibreMap,
  location: { lat: number; lng: number },
) {
  const points = catchUpCirclePoints(location);
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 35, maxZoom: 12.5, duration: 400 },
  );
}
function suburbFlagPoint(
  suburb?: { geometry: GeoJSON.Geometry } | null,
): [number, number] | null {
  if (!suburb) return null;
  const geometry = suburb.geometry;
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
    return null;
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const ringArea = (ring: number[][]) =>
    ring.reduce((sum, [x, y], i) => {
      const [nextX, nextY] = ring[(i + 1) % ring.length];
      return sum + x * nextY - nextX * y;
    }, 0);
  const ring = polygons
    .map((polygon) => polygon[0])
    .sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
  if (!ring?.length) return null;
  let area = 0,
    x = 0,
    y = 0;
  ring.forEach(([lng, lat], i) => {
    const [nextLng, nextLat] = ring[(i + 1) % ring.length];
    const cross = lng * nextLat - nextLng * lat;
    area += cross;
    x += (lng + nextLng) * cross;
    y += (lat + nextLat) * cross;
  });
  return Math.abs(area) > 1e-12
    ? [x / (3 * area), y / (3 * area)]
    : [ring[0][0], ring[0][1]];
}
export default function MapView({
  mode,
  friends,
  me,
  suburb,
  onConnect,
  onCatchUp,
  demo,
  offers,
  invitations,
  vouchers,
  gatherings,
  onAccept,
  onCreateGathering,
  onRespondGathering,
  busy,
  focusNonce,
  selectedRestaurantId,
  previewRestaurantId,
  openRestaurantId,
  onSelectRestaurant,
}: {
  mode: "friends" | "restaurants";
  friends: Friend[];
  me: Person;
  suburb?: { code: string; name: string; geometry: GeoJSON.Geometry } | null;
  onConnect: (friend: Friend) => void;
  onCatchUp: () => void;
  demo: boolean;
  offers: (MealOffer & { distance?: number; remainingRedemptions?: number })[];
  invitations: (MealInvitation & { friendName?: string })[];
  vouchers: MealVoucher[];
  gatherings: MealGatheringView[];
  onAccept: (id: string) => void;
  onCreateGathering: (offerId: string, friends: string[]) => Promise<boolean>;
  onRespondGathering: (id: string, accept: boolean) => Promise<boolean>;
  busy: boolean;
  focusNonce: number;
  selectedRestaurantId: string | null;
  previewRestaurantId: string | null;
  openRestaurantId: string | null;
  onSelectRestaurant: (id: string | null, open: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mealCard = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const friendFlag = useRef<Marker | null>(null);
  const offerMarkers = useRef<Marker[]>([]);
  const selfMarker = useRef<Marker | null>(null);
  const lastSuburbCode = useRef(suburb?.code || null);
  const lastMode = useRef(mode);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagAnchor, setFlagAnchor] = useState<{
    x: number;
    top: number;
    maxHeight: number;
  } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [mealAnchor, setMealAnchor] = useState<{
    x: number;
    y: number;
    pinX: number;
    below: boolean;
    maxHeight: number;
  } | null>(null);
  const sameAreaFriends = friends.filter((friend) => friend.nearby);
  const visibleRestaurantId = previewRestaurantId || selectedRestaurantId;
  useEffect(() => setFlagOpen(false), [suburb?.code]);
  useEffect(() => {
    setInviteOpen(false);
    setInviteIds([]);
  }, [openRestaurantId]);
  useEffect(() => {
    if (!focusNonce) return;
    const first = invitations.find(
      (v) => !v.acceptedAt && v.expiresAt > Date.now(),
    );
    const group = gatherings.find(
      (g) => g.myStatus === "pending" && g.expiresAt > Date.now(),
    );
    if (first || group) onSelectRestaurant((first || group)!.offerId, true);
  }, [focusNonce]);
  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    let map: LibreMap | undefined;
    import("maplibre-gl")
      .then((libre) => {
        if (disposed || !container.current) return;
        libre.setWorkerUrl(
          `${process.env.NEXT_PUBLIC_PAGES_PREVIEW === "1" ? "/FriendCircle" : ""}/maplibre/maplibre-gl-worker.mjs`,
        );
        map = new libre.Map({
          container: container.current,
          style:
            process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
            "https://tiles.openfreemap.org/styles/liberty",
          center: [me.lng, me.lat],
          zoom: 12,
        });
        mapRef.current = map;
        map.on("load", () => {
          if (disposed || !map) return;
          map.addSource("current-suburb", {
            type: "geojson",
            data:
              mode === "restaurants"
                ? catchUpRadiusData(me)
                : suburbData(suburb),
          });
          map.addLayer({
            id: "current-suburb-fill",
            type: "fill",
            source: "current-suburb",
            paint: {
              "fill-color": mode === "restaurants" ? "#a7d8cf" : "#eaa6c9",
              "fill-opacity": 0.18,
            },
          });
          map.addLayer({
            id: "current-suburb-outline",
            type: "line",
            source: "current-suburb",
            paint: {
              "line-color": mode === "restaurants" ? "#67afa7" : "#d985b2",
              "line-width": 3,
              "line-opacity": 0.9,
            },
          });
          setReady(true);
        });
        map.on("error", (event) => {
          if (!disposed && !map?.isStyleLoaded())
            setError(
              `Map tiles could not load: ${String(event.error?.message || "check the map style URL")}`,
            );
        });
      })
      .catch(() => {
        if (!disposed)
          setError(
            "MapLibre could not load. Your friend list is still available.",
          );
      });
    return () => {
      disposed = true;
      mapRef.current = null;
      map?.remove();
    };
  }, []);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    (
      mapRef.current.getSource("current-suburb") as GeoJSONSource | undefined
    )?.setData(
      mode === "restaurants" ? catchUpRadiusData(me) : suburbData(suburb),
    );
  }, [ready, mode, suburb, me.lat, me.lng]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const restaurantMap = mode === "restaurants";
    mapRef.current.setPaintProperty(
      "current-suburb-fill",
      "fill-color",
      restaurantMap ? "#a7d8cf" : "#eaa6c9",
    );
    mapRef.current.setPaintProperty(
      "current-suburb-outline",
      "line-color",
      restaurantMap ? "#67afa7" : "#d985b2",
    );
  }, [ready, mode]);
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => mapRef.current?.resize());
    return () => cancelAnimationFrame(frame);
  }, [ready, mode]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (mode === "restaurants") fitCatchUpRadius(mapRef.current, me);
    else if (lastMode.current === "restaurants")
      mapRef.current.easeTo({
        center: [me.lng, me.lat],
        zoom: 12,
        duration: 400,
      });
    lastMode.current = mode;
  }, [ready, mode, me.lat, me.lng]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const code = suburb?.code || null;
    if (lastSuburbCode.current === code) return;
    lastSuburbCode.current = code;
    if (mode === "friends")
      mapRef.current.easeTo({ center: [me.lng, me.lat], duration: 600 });
  }, [ready, suburb?.code, me.lng, me.lat, mode]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let disposed = false;
    import("maplibre-gl").then(({ Marker }) => {
      if (disposed || !mapRef.current) return;
      friendFlag.current?.remove();
      const count =
        mode === "friends"
          ? friends.filter((friend) => friend.nearby).length
          : 0;
      const point = suburbFlagPoint(suburb);
      if (count && point) {
        const flag = document.createElement("button");
        flag.type = "button";
        flag.className = "suburb-friends-flag";
        flag.setAttribute("aria-controls", "suburb-friends-card");
        flag.setAttribute(
          "aria-label",
          `Show ${count} ${count === 1 ? "friend" : "friends"} in ${suburb!.name}; flag marks the suburb, not their location`,
        );
        const icon = document.createElement("span");
        icon.className = "suburb-flag-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "⚑";
        const label = document.createElement("span");
        label.textContent = `${count} ${count === 1 ? "friend" : "friends"} in this suburb`;
        flag.append(icon, label);
        flag.addEventListener("click", () =>
          setFlagOpen((open) => {
            if (!open)
              mapRef.current?.easeTo({
                center: point,
                offset: [0, 70],
                duration: 250,
              });
            return !open;
          }),
        );
        friendFlag.current = new Marker({ element: flag, anchor: "bottom" })
          .setLngLat(point)
          .addTo(mapRef.current);
      }
      selfMarker.current?.remove();
      if (mode === "friends") {
        const self = document.createElement("div");
        self.className = "you-pin maplibre-you-pin";
        self.innerHTML = "<span></span><b>You</b>";
        selfMarker.current = new Marker({ element: self, anchor: "center" })
          .setLngLat([me.lng, me.lat])
          .addTo(mapRef.current);
      }
    });
    return () => {
      disposed = true;
      friendFlag.current?.remove();
      selfMarker.current?.remove();
    };
  }, [ready, friends, me, suburb, mode]);
  useEffect(() => {
    friendFlag.current
      ?.getElement()
      .setAttribute("aria-expanded", String(flagOpen));
  }, [flagOpen, ready, friends, suburb]);
  useEffect(() => {
    if (!flagOpen || !ready || !mapRef.current) return;
    const map = mapRef.current;
    const update = () => {
      const flag = friendFlag.current?.getElement();
      const surface = container.current?.parentElement;
      if (!flag || !surface) return;
      const rect = flag.getBoundingClientRect();
      const bounds = surface.getBoundingClientRect();
      const width = Math.min(330, bounds.width - 24);
      const center = rect.left + rect.width / 2 - bounds.left;
      const x = Math.max(
        width / 2 + 12,
        Math.min(center, bounds.width - width / 2 - 12),
      );
      const top = rect.top - bounds.top - 10;
      setFlagAnchor({ x, top, maxHeight: Math.max(90, top - 18) });
    };
    update();
    map.on("move", update);
    map.on("resize", update);
    return () => {
      map.off("move", update);
      map.off("resize", update);
    };
  }, [flagOpen, ready, friends, suburb]);
  useEffect(() => {
    if (!ready || !visibleRestaurantId || !mapRef.current) return;
    const offer = offers.find((o) => o.id === visibleRestaurantId);
    if (offer?.lat !== undefined && offer.lng !== undefined) {
      const map = mapRef.current;
      map.easeTo({
        center: [offer.lng, offer.lat],
        offset: [
          0,
          openRestaurantId === offer.id
            ? Math.min(130, map.getContainer().clientHeight * 0.24)
            : 0,
        ],
        duration: 350,
      });
    }
  }, [ready, visibleRestaurantId, openRestaurantId]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let disposed = false;
    import("maplibre-gl").then(({ Marker }) => {
      if (disposed || !mapRef.current) return;
      offerMarkers.current.forEach((marker) => marker.remove());
      offerMarkers.current = offers
        .filter(
          (o) =>
            o.id === visibleRestaurantId &&
            o.lat !== undefined &&
            o.lng !== undefined,
        )
        .map((offer) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "restaurant-map-pin maplibre-restaurant-pin";
          button.setAttribute(
            "aria-label",
            `Open meal offer at ${offer.restaurantName}`,
          );
          button.innerHTML =
            '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18l-2-5H5L3 9Z"/><path d="M3 9v2a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0v-2"/><path d="M5 14v6h14v-6M10 20v-5h4v5"/></svg>';
          button.addEventListener("click", () =>
            onSelectRestaurant(offer.id, true),
          );
          return new Marker({ element: button, anchor: "center" })
            .setLngLat([offer.lng!, offer.lat!])
            .addTo(mapRef.current!);
        });
    });
    return () => {
      disposed = true;
      offerMarkers.current.forEach((marker) => marker.remove());
    };
  }, [ready, offers, visibleRestaurantId]);
  const selectedOffer = offers.find(
    (o) =>
      o.id === openRestaurantId &&
      (!previewRestaurantId || previewRestaurantId === openRestaurantId),
  );
  useLayoutEffect(() => {
    if (!ready || !selectedOffer || !mapRef.current || !container.current) {
      setMealAnchor(null);
      return;
    }
    const map = mapRef.current;
    const update = () => {
      const surface = container.current?.parentElement;
      const card = mealCard.current;
      if (
        !surface ||
        !card ||
        selectedOffer.lat === undefined ||
        selectedOffer.lng === undefined
      )
        return;
      const point = map.project([selectedOffer.lng, selectedOffer.lat]);
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) {
        setMealAnchor(null);
        return;
      }
      const cardWidth = Math.min(365, width - 24);
      const x = Math.max(
        cardWidth / 2 + 12,
        Math.min(point.x, width - cardWidth / 2 - 12),
      );
      const above = Math.max(0, point.y - 32);
      const belowSpace = Math.max(0, height - point.y - 32);
      const below = above < card.scrollHeight && belowSpace > above;
      const next = {
        x,
        y: below ? point.y + 26 : point.y - 26,
        pinX: point.x,
        below,
        maxHeight: Math.max(80, Math.floor((below ? belowSpace : above) - 6)),
      };
      setMealAnchor((current) =>
        current &&
        current.x === next.x &&
        current.y === next.y &&
        current.pinX === next.pinX &&
        current.below === next.below &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    };
    update();
    map.on("move", update);
    map.on("resize", update);
    window.addEventListener("resize", update);
    const observer =
      typeof ResizeObserver !== "undefined" && mealCard.current
        ? new ResizeObserver(update)
        : null;
    if (observer && mealCard.current) observer.observe(mealCard.current);
    return () => {
      map.off("move", update);
      map.off("resize", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [ready, selectedOffer, inviteOpen]);
  const selectedGatherings = gatherings.filter(
    (g) => g.offerId === openRestaurantId,
  );
  const selectedInvites = invitations.filter(
    (v) => v.offerId === openRestaurantId,
  );
  const pendingInvites = selectedInvites.filter(
    (v) => !v.acceptedAt && v.expiresAt > Date.now(),
  );
  const selectedVoucher = vouchers.find((v) =>
    selectedInvites.some((i) => i.voucherId === v.id),
  );
  return (
    <div
      className={`map-surface ${mode === "restaurants" ? "restaurant-map-surface" : ""}`}
      aria-label={
        mode === "restaurants"
          ? `Catch up restaurant map with ${mealBrowseKm} km radius`
          : demo
            ? "Illustrative Perth demo map"
            : "Suburb presence map"
      }
    >
      <div
        ref={container}
        className="maplibre-map"
        aria-label="Interactive map. Drag to pan and scroll to zoom."
      />
      {error && (
        <div className="map-unavailable" role="status">
          {error}
        </div>
      )}
      {mode === "friends" &&
        flagOpen &&
        flagAnchor &&
        sameAreaFriends.length > 0 && (
          <div
            id="suburb-friends-card"
            className="map-friends-card"
            role="region"
            aria-label={`Friends in ${suburb?.name || "your suburb"}`}
            style={{
              left: flagAnchor.x,
              top: flagAnchor.top,
              maxHeight: flagAnchor.maxHeight,
            }}
          >
            <div className="map-friends-card-head">
              <div>
                <strong>Friends in {suburb?.name || "your suburb"}</strong>
                <small>The flag marks the suburb, not their location.</small>
              </div>
              <button
                className="icon-button"
                aria-label="Close friends in suburb"
                onClick={() => setFlagOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="map-friends-card-list">
              {sameAreaFriends.map((friend) => (
                <div className="map-friends-card-row" key={friend.id}>
                  <Avatar person={friend} size="small" />
                  <strong>{friend.name}</strong>
                  <button
                    className="secondary"
                    onClick={() => onConnect(friend)}
                  >
                    Chat
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setFlagOpen(false);
                      onCatchUp();
                    }}
                  >
                    Catch up
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      {selectedOffer && (
        <div
          ref={mealCard}
          className={`map-meal-card anchored ${mealAnchor?.below ? "below-pin" : "above-pin"}`}
          role="region"
          aria-label={`Meal offer at ${selectedOffer.restaurantName}`}
          style={
            mealAnchor
              ? {
                  left: mealAnchor.x,
                  top: mealAnchor.y,
                  maxHeight: mealAnchor.maxHeight,
                }
              : { visibility: "hidden" }
          }
        >
          <button
            className="map-meal-close"
            aria-label="Close meal offer"
            onClick={() => onSelectRestaurant(selectedRestaurantId, false)}
          >
            <X size={15} />
          </button>
          <strong>
            <Utensils size={17} /> {selectedOffer.restaurantName}
          </strong>
          <small>
            {selectedOffer.area}
            {selectedOffer.address ? ` · ${selectedOffer.address}` : ""}
            {selectedOffer.distance !== undefined
              ? ` · ${selectedOffer.distance.toFixed(1)} km from you`
              : ""}
          </small>
          <p>Group meal discounts · {selectedOffer.terms}</p>
          {selectedOffer.remainingRedemptions !== undefined && (
            <small>
              {selectedOffer.remainingRedemptions} offers left to redeem
            </small>
          )}
          <div
            className="map-meal-tiers"
            aria-label="Group meal discount tiers"
          >
            {(selectedOffer.groupDiscountTiers?.length
              ? selectedOffer.groupDiscountTiers
              : [
                  {
                    diners: 2,
                    discountPercent: selectedOffer.discountPercent || 0,
                  },
                ]
            ).map((tier) => (
              <span key={tier.diners}>
                <strong>{tier.discountPercent}%</strong>
                <small>{tier.diners === 4 ? "4+" : tier.diners} diners</small>
              </span>
            ))}
          </div>
          {friends.length > 0 &&
            !selectedGatherings.some(
              (g) =>
                g.myStatus === "host" &&
                !g.redeemedAt &&
                g.expiresAt > Date.now(),
            ) && (
              <div className="map-meal-group-invite">
                <button
                  className="secondary"
                  onClick={() => setInviteOpen((open) => !open)}
                  aria-expanded={inviteOpen}
                >
                  Invite friends to a meal
                </button>
                {inviteOpen && (
                  <div className="map-meal-friend-picker">
                    <small>Choose up to seven connected friends.</small>
                    {friends.map((friend) => (
                      <label key={friend.id}>
                        <input
                          type="checkbox"
                          checked={inviteIds.includes(friend.id)}
                          onChange={(event) =>
                            setInviteIds((ids) =>
                              event.target.checked
                                ? [...ids, friend.id]
                                : ids.filter((id) => id !== friend.id),
                            )
                          }
                        />
                        {friend.name}
                      </label>
                    ))}
                    <button
                      className="primary"
                      disabled={
                        busy || inviteIds.length < 1 || inviteIds.length > 7
                      }
                      onClick={async () => {
                        if (
                          await onCreateGathering(selectedOffer.id, inviteIds)
                        ) {
                          setInviteOpen(false);
                          setInviteIds([]);
                        }
                      }}
                    >
                      Send meal invite
                    </button>
                    {demo && (
                      <small>
                        Demo invitations are illustrative and cannot be
                        redeemed.
                      </small>
                    )}
                  </div>
                )}
              </div>
            )}
          {selectedGatherings.map((gathering) => (
            <div className="map-meal-gathering" key={gathering.id}>
              <strong>
                {gathering.myStatus === "host"
                  ? "Your meal invitation"
                  : `${gathering.hostName} invited you`}
              </strong>
              <small>
                {1 + gathering.acceptedFriends} of {1 + gathering.invitedCount}{" "}
                diners accepted ·{" "}
                {gathering.discountPercent
                  ? `${gathering.discountPercent}% unlocked`
                  : "Waiting for the first friend"}
              </small>
              <small>
                {gathering.redeemedAt
                  ? "Offer used"
                  : gathering.expiresAt <= Date.now()
                    ? "Invitation expired"
                    : `Accept by ${new Date(gathering.expiresAt).toLocaleString()}`}
              </small>
              {gathering.myStatus === "pending" &&
                !gathering.redeemedAt &&
                gathering.expiresAt > Date.now() && (
                  <div className="map-meal-response">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => onRespondGathering(gathering.id, true)}
                    >
                      Accept
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => onRespondGathering(gathering.id, false)}
                    >
                      Decline
                    </button>
                  </div>
                )}
              {gathering.code &&
                !gathering.redeemedAt &&
                gathering.expiresAt > Date.now() && (
                  <div className="map-meal-code">
                    <Ticket size={17} />
                    <span>
                      Shared code: {gathering.code}. Show it to restaurant staff
                      once.
                      {demo ? " Demo only; no real discount is available." : ""}
                    </span>
                  </div>
                )}
            </div>
          ))}
          {pendingInvites.length ? (
            pendingInvites.map((invite) => (
              <div className="map-meal-invite" key={invite.id}>
                <span>
                  {invite.friendName || "Your friend"} is close by. Accept by{" "}
                  {new Date(invite.expiresAt).toLocaleString()}.
                </span>
                <button
                  className="primary"
                  disabled={busy || demo}
                  onClick={() => onAccept(invite.id)}
                >
                  {demo ? "Demo offer unavailable" : "Accept shared offer"}
                </button>
              </div>
            ))
          ) : selectedVoucher ? (
            <div className="map-meal-code">
              <Ticket size={17} />
              <span>
                {selectedVoucher.redeemedAt
                  ? "Offer used"
                  : selectedVoucher.expiresAt <= Date.now()
                    ? "Offer expired"
                    : `One shared code: ${selectedVoucher.code}. Show it to staff once before ${new Date(selectedVoucher.expiresAt).toLocaleString()}.`}
              </span>
            </div>
          ) : (
            <small>
              Meet a connected friend nearby for an automatic two-person offer.
            </small>
          )}
        </div>
      )}
      {selectedOffer && mealAnchor && (
        <span
          className={`map-meal-pointer ${mealAnchor.below ? "below-pin" : "above-pin"}`}
          aria-hidden="true"
          style={{ left: mealAnchor.pinX, top: mealAnchor.y - 7 }}
        />
      )}
      {mode === "restaurants" && (
        <div className="map-top-note">
          <span className="live-dot" />
          Deals within {mealBrowseKm} km
        </div>
      )}
      <div className="map-controls">
        <button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
          <Plus size={19} />
        </button>
        <button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
          <Minus size={19} />
        </button>
        <button
          aria-label={
            mode === "restaurants"
              ? `Show ${mealBrowseKm} km area`
              : "Center on me"
          }
          onClick={() => {
            if (!mapRef.current) return;
            if (mode === "restaurants") fitCatchUpRadius(mapRef.current, me);
            else mapRef.current.easeTo({ center: [me.lng, me.lat] });
          }}
        >
          <Navigation size={18} />
        </button>
      </div>
      <div className="map-bottom-note">
        Drag to explore · scroll to zoom ·{" "}
        {mode === "restaurants"
          ? `${mealBrowseKm} km radius highlighted · select a restaurant to see its offer`
          : suburb
            ? `${suburb.name} highlighted · flag shows suburb presence only`
            : "Suburb unavailable in this demo area"}
      </div>
    </div>
  );
}
