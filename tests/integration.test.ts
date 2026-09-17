import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  access,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mealBrowseKm, seed } from "../lib/model";

test("API protects friendship, location, photo review, messages and blocked accounts", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "friendcircle-test-"));
  const photos = path.join(dir, "photos");
  const avatars = path.join(dir, "avatars");
  await mkdir(photos);
  await mkdir(avatars);
  const statePath = path.join(dir, "demo.json");
  await writeFile(statePath, JSON.stringify(seed()));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        APP_MODE: "demo",
        PORT: "3117",
        DATA_DIR: dir,
        PHOTO_DIR: photos,
        AVATAR_DIR: avatars,
        FACE_VERIFIER_URL: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  t.after(async () => {
    child.kill("SIGTERM");
    await new Promise<void>((r) => child.once("exit", () => r()));
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error(`Server did not start: ${logs}`)),
      15000,
    );
    child.stdout.on("data", (d) => {
      if (String(d).includes("FriendCircle")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error(`Server exited ${code}: ${logs}`));
    });
  });
  let demoCookie = "";
  const call = async (url: string, method = "GET", body?: unknown) => {
    const r = await fetch(`http://127.0.0.1:3117/api${url}`, {
      method,
      headers: {
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(demoCookie ? { Cookie: demoCookie } : {}),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    if (url === "/admin/login" && r.headers.get("set-cookie"))
      demoCookie = r.headers.get("set-cookie")!.split(";")[0];
    return { status: r.status, data: await r.json() };
  };
  const edit = async (fn: (s: any) => void) => {
    const s = JSON.parse(await readFile(statePath, "utf8"));
    fn(s);
    await writeFile(statePath, JSON.stringify(s));
  };
  await t.test(
    "Admin demo login opens aggregate activity and offer reports",
    async () => {
      assert.equal((await call("/admin/session")).status, 403);
      const signIn = await call("/admin/login", "POST");
      assert.equal(signIn.status, 200);
      assert.equal(signIn.data.demo, true);
      assert.equal((await call("/admin/session")).data.admin, true);
      assert.deepEqual((await call("/state")).data.conversationIds, []);
      const report = await call("/admin/analytics");
      assert.equal(report.status, 200);
      assert.equal(report.data.meetings.total, 0);
      assert.equal(report.data.people, seed().people.length);
      assert.equal(report.data.offers.invitations, 0);
      assert.equal(report.data.offers.acceptanceRate, 0);
    },
  );
  await t.test(
    "Admin registers and edits an unpublished restaurant discount",
    async () => {
      const created = await call("/admin/meal-offers", "POST", {
        restaurantName: "Fictional Test Café",
        area: "Test suburb",
        address: "Test address",
        contactName: "Test Manager",
        contactEmail: "manager@example.test",
        contactPhone: "+61 400 000 000",
        redemptionLimit: 25,
      });
      assert.equal(created.status, 200);
      assert.equal(created.data.active, false);
      assert.equal(created.data.contactEmail, "manager@example.test");
      assert.equal(
        (
          await call(`/admin/meal-offers/${created.data.id}`, "PATCH", {
            discountPercent: 10,
            terms: "Illustrative test meal terms only.",
            contactPhone: "+61 400 000 001",
          })
        ).status,
        200,
      );
      const offers = await call("/admin/meal-offers");
      assert.equal(
        offers.data.find((o: any) => o.id === created.data.id)?.discountPercent,
        10,
      );
      assert.equal(
        offers.data.find((o: any) => o.id === created.data.id)?.contactPhone,
        "+61 400 000 001",
      );
      assert.ok(
        !(await call("/state")).data.mealOffers.some(
          (offer: any) => offer.id === created.data.id,
        ),
      );
      assert.equal(
        (await call(`/admin/meal-offers/${created.data.id}`, "DELETE")).status,
        200,
      );
      assert.equal(
        (await call("/admin/meal-offers")).data.some(
          (o: any) => o.id === created.data.id,
        ),
        false,
      );
      assert.equal(
        (await call("/admin/analytics")).data.offers.byRestaurant.some(
          (o: any) => o.id === created.data.id,
        ),
        false,
      );
    },
  );
  await t.test(
    "Restaurant draft stays hidden, demo cannot mint a deal, and redemption works once",
    async () => {
      const state = await call("/state");
      assert.ok(
        state.data.mealOffers.some(
          (offer: any) => offer.id === "demo-circle-kitchen",
        ),
      );
      assert.ok(
        !state.data.mealOffers.some(
          (offer: any) => offer.id === "draft-hj-carlisle",
        ),
      );
      assert.equal(state.data.mealInvitations.length, 0);
      const drafts = await call("/admin/meal-offers");
      assert.equal(drafts.status, 200);
      assert.ok(
        drafts.data.some((o: any) => o.id === "draft-hj-carlisle" && !o.active),
      );
      assert.equal(
        (
          await call("/admin/meal-offers/draft-hj-carlisle", "PATCH", {
            active: true,
          })
        ).status,
        400,
      );
      assert.equal(
        (await call("/meal-invitations/draft-hj-carlisle/accept", "POST"))
          .status,
        400,
      );
      await edit((s) => {
        s.mealOffers.push({
          id: "test-staff-offer",
          restaurantName: "Test restaurant",
          area: "Test area",
          active: true,
          managerId: "you",
          discountPercent: 10,
          redemptionLimit: 1,
          terms: "Test meal terms for two diners",
          fundedBy: "restaurant",
          partnerConfirmedAt: Date.now(),
          validUntil: Date.now() + 86400000,
          lat: s.people[0].lat,
          lng: s.people[0].lng,
          createdAt: Date.now(),
        });
        s.mealVouchers = [
          {
            id: "test-voucher",
            code: "A1B2C3D4E5F60708",
            offerId: "test-staff-offer",
            a: "you",
            b: "mia",
            discountPercent: 10,
            terms: "Test meal terms for two diners",
            createdAt: Date.now(),
            expiresAt: Date.now() + 7200000,
          },
          {
            id: "test-voucher-second",
            code: "B1B2C3D4E5F60708",
            offerId: "test-staff-offer",
            a: "you",
            b: "james",
            discountPercent: 10,
            terms: "Test meal terms for two diners",
            createdAt: Date.now(),
            expiresAt: Date.now() + 7200000,
          },
        ];
      });
      const redeemed = await call("/meals/redeem", "POST", {
        code: "A1B2C3D4E5F60708",
      });
      assert.equal(redeemed.status, 200);
      assert.equal(redeemed.data.discountPercent, 10);
      assert.equal(
        (await call("/admin/analytics")).data.offers.byRestaurant.find(
          (o: any) => o.id === "test-staff-offer",
        )?.redeemed,
        1,
      );
      assert.ok(
        !(await call("/state")).data.mealOffers.some(
          (offer: any) => offer.id === "test-staff-offer",
        ),
      );
      assert.equal(
        (await call("/meals/redeem", "POST", { code: "B1B2C3D4E5F60708" }))
          .status,
        400,
      );
      assert.equal(
        (await call("/meals/redeem", "POST", { code: "A1B2C3D4E5F60708" }))
          .status,
        400,
      );
    },
  );
  await t.test(
    "Catch up lists all approved deals within 5 km across suburbs and group invites require friendship",
    async () => {
      await edit((s) => {
        const offer = s.mealOffers.find(
          (o: any) => o.id === "demo-circle-kitchen",
        );
        s.mealOffers.push(
          {
            ...offer,
            id: "test-cross-border-deal",
            restaurantName: "Across Border Café (test)",
            area: "Northbridge (WA)",
            lat: -31.9471,
            lng: 115.8594,
          },
          {
            ...offer,
            id: "test-far-deal",
            restaurantName: "Far Café (test)",
            area: "Distant test area",
            lat: -32.04,
            lng: 115.8594,
          },
        );
      });
      assert.equal(
        (await call("/me", "PATCH", { sharing: false })).status,
        200,
      );
      const withoutLocation = (await call("/state")).data;
      assert.deepEqual(withoutLocation.mealOffers, []);
      assert.equal((await call("/me", "PATCH", { sharing: true })).status, 200);
      const local = (await call("/state")).data;
      assert.equal(local.suburb.name, "Perth (WA)");
      assert.ok(
        local.mealOffers.some(
          (offer: any) =>
            offer.id === "demo-circle-kitchen" &&
            typeof offer.distance === "number",
        ),
      );
      assert.ok(
        local.mealOffers.some(
          (offer: any) => offer.id === "test-cross-border-deal",
        ),
      );
      assert.ok(
        !local.mealOffers.some((offer: any) => offer.id === "test-far-deal"),
      );
      assert.ok(
        local.mealOffers.every((offer: any) => offer.distance <= mealBrowseKm),
      );
      assert.equal(
        (await call("/me", "PATCH", { lat: -31.9471, lng: 115.8594 })).status,
        200,
      );
      const acrossBorder = (await call("/state")).data;
      assert.notEqual(acrossBorder.suburb.code, local.suburb.code);
      assert.ok(
        acrossBorder.mealOffers.some(
          (offer: any) => offer.id === "demo-circle-kitchen",
        ),
      );
      assert.ok(
        acrossBorder.mealOffers.some(
          (offer: any) => offer.id === "test-cross-border-deal",
        ),
      );
      assert.equal(
        (await call("/me", "PATCH", { lat: -32.04, lng: 115.8594 })).status,
        200,
      );
      const fartherAway = (await call("/state")).data;
      assert.ok(
        !fartherAway.mealOffers.some(
          (offer: any) => offer.id === "demo-circle-kitchen",
        ),
      );
      assert.ok(
        fartherAway.mealOffers.some(
          (offer: any) => offer.id === "test-far-deal",
        ),
      );
      assert.equal(
        (
          await call("/meals/gatherings", "POST", {
            offerId: "demo-circle-kitchen",
            friends: ["mia"],
          })
        ).status,
        400,
      );
      assert.equal(
        (await call("/me", "PATCH", { lat: -31.9523, lng: 115.8613 })).status,
        200,
      );
      assert.equal(
        (
          await call("/meals/gatherings", "POST", {
            offerId: "demo-circle-kitchen",
            friends: ["ruby"],
          })
        ).status,
        400,
      );
      const created = await call("/meals/gatherings", "POST", {
        offerId: "demo-circle-kitchen",
        friends: ["mia", "james"],
      });
      assert.equal(created.status, 200);
      const gathering = (await call("/state")).data.mealGatherings.find(
        (g: any) => g.id === created.data.id,
      );
      assert.equal(gathering.myStatus, "host");
      assert.equal(gathering.invitedCount, 2);
      assert.equal(gathering.discountPercent, 0);
      assert.equal(gathering.code, undefined);
      assert.equal(
        (
          await call(`/meals/gatherings/${created.data.id}/respond`, "POST", {
            accept: true,
          })
        ).status,
        400,
      );
      await edit((s) => {
        s.mealOffers = s.mealOffers.filter(
          (offer: any) =>
            !["test-cross-border-deal", "test-far-deal"].includes(offer.id),
        );
      });
    },
  );
  await t.test(
    "Suburb matching reports shared area without exposing any person's coordinates",
    async () => {
      const r = await call("/state");
      assert.equal(r.status, 200);
      assert.equal(r.data.suburb.name, "Perth (WA)");
      assert.equal(r.data.friends.length, 6);
      assert.ok(r.data.friends.find((p: any) => p.id === "james")?.nearby);
      assert.ok(r.data.friendPresence.some((p: any) => p.id === "james"));
      assert.ok(r.data.friendPresence.every((p: any) => p.close === undefined));
      assert.ok(
        [...r.data.friends, ...r.data.discoverable].every(
          (p: any) =>
            p.lat === undefined &&
            p.lng === undefined &&
            p.distance === undefined,
        ),
      );
      assert.equal(
        r.data.friends.find((p: any) => p.id === "mia")?.lat,
        undefined,
      );
      assert.equal(
        r.data.friends.find((p: any) => p.id === "mia")?.distance,
        undefined,
      );
      assert.ok(
        r.data.discoverable.some(
          (p: any) => p.id === "ruby" && p.commonTraits.includes("coffee"),
        ),
      );
      assert.ok(
        r.data.publicProfiles.every(
          (p: any) => p.visibility === "public" && p.nearby,
        ),
      );
      assert.equal(r.data.suburbAchievements.connectedSuburbs, 5);
      assert.deepEqual(r.data.suburbAchievements.unlocked, [3, 5]);
      assert.ok(
        r.data.friends.every(
          (p: any) =>
            p.socialCredits === undefined && p.stripeCustomerId === undefined,
        ),
      );
      await edit((s) =>
        s.people.push({
          id: "zoe",
          name: "Zoe Public",
          initials: "ZP",
          color: "#aacccc",
          activity: "coffee",
          status: "Nearby",
          lat: -31.9523,
          lng: 115.8613,
          sharing: true,
          updatedAt: Date.now(),
          adult: true,
          visibility: "public",
          hobbies: ["fishing"],
        }),
      );
      assert.ok(
        !(await call("/state")).data.discoverable.some(
          (p: any) => p.id === "zoe",
        ),
      );
      await edit((s) => {
        s.people.find((p: any) => p.id === "zoe").hobbies = ["coffee"];
      });
      assert.ok(
        (await call("/state")).data.discoverable.some(
          (p: any) => p.id === "zoe",
        ),
      );
      await edit((s) => {
        s.people.find((p: any) => p.id === "zoe").visibility = "private";
      });
      assert.ok(
        !(await call("/state")).data.discoverable.some(
          (p: any) => p.id === "zoe",
        ),
      );
      assert.equal(
        (await call("/me", "PATCH", { lat: -31.9471, lng: 115.8594 })).status,
        200,
      );
      const moved = (await call("/state")).data;
      assert.equal(moved.suburb.name, "Northbridge (WA)");
      assert.ok(!moved.publicProfiles.some((p: any) => p.id === "ruby"));
      assert.ok(moved.friends.find((p: any) => p.id === "mia")?.nearby);
      assert.equal(
        moved.friends.find((p: any) => p.id === "mia")?.lat,
        undefined,
      );
      assert.equal(
        moved.friends.find((p: any) => p.id === "james")?.lat,
        undefined,
      );
      assert.equal(
        (await call("/me", "PATCH", { lat: -31.9523, lng: 115.8613 })).status,
        200,
      );
    },
  );
  await t.test(
    "Nonfriends cannot chat and malformed coordinates fail",
    async () => {
      assert.equal((await call("/messages/ella")).status, 400);
      assert.equal(
        (await call("/messages/ella", "POST", { kind: "hi" })).status,
        400,
      );
      assert.equal(
        (await call("/me", "PATCH", { lat: 999, lng: 115 })).status,
        400,
      );
      assert.equal((await call("/me", "PATCH", { lat: -31 })).status, 400);
    },
  );
  await t.test(
    "Profile interests and accepted public chat requests grant 300 encrypted units",
    async () => {
      assert.equal(
        (
          await call("/me", "PATCH", {
            bio: "Coffee lover",
            hobbies: ["coffee", "walking"],
            favoriteFoods: ["pizza"],
            sports: ["running"],
            movies: ["comedy"],
            games: ["board games"],
          })
        ).status,
        200,
      );
      assert.equal((await call("/state")).data.me.bio, "Coffee lover");
      assert.equal((await call("/chat-requests/ruby", "POST")).status, 200);
      assert.equal((await call("/chat-requests/ruby", "POST")).status, 400);
      const request = (await call("/state")).data.chatRequests.find(
        (r: any) => r.to === "ruby",
      );
      assert.equal(request.state, "pending");
      await edit((s) => {
        const r = s.chatRequests.find((x: any) => x.id === request.id);
        r.from = "ruby";
        r.to = "you";
      });
      assert.equal(
        (
          await call(`/chat-requests/${request.id}/respond`, "POST", {
            accept: true,
          })
        ).status,
        200,
      );
      assert.deepEqual((await call("/state")).data.conversationIds, []);
      const a = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey"],
      );
      const b = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey"],
      );
      const senderKey = await crypto.subtle.exportKey("jwk", a.publicKey);
      const recipientKey = await crypto.subtle.exportKey("jwk", b.publicKey);
      await edit((s) => {
        s.people.find((p: any) => p.id === "you").publicKey = senderKey;
        s.people.find((p: any) => p.id === "ruby").publicKey = recipientKey;
      });
      assert.equal(
        (
          await call("/messages/ruby", "POST", {
            kind: "encrypted",
            ciphertext: Buffer.alloc(21).toString("base64"),
            iv: Buffer.alloc(12).toString("base64"),
            senderKey,
            recipientKey,
          })
        ).status,
        200,
      );
      assert.equal(
        (await call("/state")).data.chatContacts.find(
          (p: any) => p.id === "ruby",
        )?.chatRemaining,
        295,
      );
      assert.deepEqual((await call("/state")).data.conversationIds, ["ruby"]);
      assert.equal((await call("/state")).data.me.textCharacters, 100);
    },
  );
  await t.test(
    "Encrypted text spends the sender's allowance and cannot exceed it",
    async () => {
      const a = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey"],
      );
      const b = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveKey"],
      );
      const senderKey = await crypto.subtle.exportKey("jwk", a.publicKey),
        recipientKey = await crypto.subtle.exportKey("jwk", b.publicKey);
      await edit((s) => {
        s.people.find((p: any) => p.id === "you").publicKey = senderKey;
        s.people.find((p: any) => p.id === "mia").publicKey = recipientKey;
      });
      const payload = {
        kind: "encrypted",
        ciphertext: Buffer.alloc(21).toString("base64"),
        iv: Buffer.alloc(12).toString("base64"),
        senderKey,
        recipientKey,
      };
      assert.equal((await call("/messages/mia", "POST", payload)).status, 200);
      assert.deepEqual((await call("/state")).data.conversationIds, [
        "mia",
        "ruby",
      ]);
      assert.equal((await call("/state")).data.me.textCharacters, 95);
      const expensive = {
        ...payload,
        ciphertext: Buffer.alloc(112).toString("base64"),
      };
      assert.equal(
        (await call("/messages/mia", "POST", expensive)).status,
        400,
      );
      assert.equal((await call("/state")).data.me.textCharacters, 95);
    },
  );
  await t.test("Radius purchases are retired", async () => {
    assert.equal((await call("/radius/fist", "POST")).status, 410);
    assert.equal((await call("/billing/checkout", "POST")).status, 410);
  });
  await t.test(
    "Public avatar requires same-suburb matching or an existing connection",
    async () => {
      const file = "test.webp";
      await writeFile(path.join(avatars, file), Buffer.from("RIFFxxxxWEBP"));
      await edit((s) => {
        const p = s.people.find((p: any) => p.id === "zoe");
        p.avatarFile = file;
        p.visibility = "private";
      });
      let r = await fetch("http://127.0.0.1:3117/api/avatar/zoe");
      assert.equal(r.status, 404);
      await edit((s) => {
        s.people.find((p: any) => p.id === "zoe").visibility = "public";
      });
      r = await fetch("http://127.0.0.1:3117/api/avatar/zoe");
      assert.equal(r.status, 200);
      await edit((s) => {
        s.people.find((p: any) => p.id === "zoe").hobbies = ["fishing"];
      });
      r = await fetch("http://127.0.0.1:3117/api/avatar/zoe");
      assert.equal(r.status, 404);
    },
  );
  await t.test(
    "Avatar upload re-encodes a supported image as WebP",
    async () => {
      const png = execFileSync(
        "magick",
        ["-size", "4x4", "xc:tomato", "png:-"],
        { maxBuffer: 200000 },
      );
      const form = new FormData();
      form.set("photo", new Blob([png], { type: "image/png" }), "avatar.png");
      assert.equal((await call("/avatar", "POST", form)).status, 200);
      const r = await fetch("http://127.0.0.1:3117/api/avatar/you");
      assert.equal(r.status, 200);
      const bytes = Buffer.from(await r.arrayBuffer());
      assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
      assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
    },
  );
  await t.test(
    "A hi has a two-hour deadline and no plaintext chat route exists",
    async () => {
      assert.equal(
        (await call("/messages/mia", "POST", { kind: "hi" })).status,
        200,
      );
      const r = await call("/messages/mia");
      const hi = r.data.find((m: any) => m.kind === "hi");
      assert.equal(hi.expiresAt - hi.createdAt, 7200000);
      assert.equal(
        (
          await call("/messages/mia", "POST", {
            kind: "text",
            text: "plaintext",
          })
        ).status,
        400,
      );
    },
  );
  let requestId = "";
  await t.test(
    "Photo submission queues real manual review, never fakes AI success",
    async () => {
      const form = new FormData();
      form.set("to", "ella");
      form.set("adult", "true");
      form.set("consent", "true");
      form.set(
        "photo",
        new Blob(
          [
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO9kAAAAASUVORK5CYII=",
              "base64",
            ),
          ],
          { type: "image/png" },
        ),
        "test.png",
      );
      const r = await call("/requests", "POST", form);
      assert.equal(r.status, 200);
      assert.equal(r.data.state, "review");
      assert.equal(r.data.photo, undefined);
      requestId = r.data.id;
      assert.equal(
        (await call(`/requests/${requestId}/respond`, "POST", { accept: true }))
          .status,
        400,
      );
    },
  );
  await t.test(
    "Review does not establish friendship; only recipient acceptance does",
    async () => {
      assert.equal(
        (await call(`/admin/review/${requestId}`, "POST", { approve: true }))
          .status,
        200,
      );
      assert.equal((await call("/messages/ella")).status, 400);
      assert.equal(
        (await call(`/requests/${requestId}/respond`, "POST", { accept: true }))
          .status,
        400,
      );
      await edit((s) => {
        const r = s.requests.find((r: any) => r.id === requestId);
        r.from = "ella";
        r.to = "you";
      });
      const before = JSON.parse(await readFile(statePath, "utf8"));
      const file = before.requests.find((r: any) => r.id === requestId).photo;
      assert.equal(
        (await call(`/requests/${requestId}/respond`, "POST", { accept: true }))
          .status,
        200,
      );
      assert.equal((await call("/messages/ella")).status, 200);
      await assert.rejects(access(path.join(photos, file)));
    },
  );
  await t.test(
    "Hidden friend coordinates and distance never leak",
    async () => {
      const r = await call("/state");
      const ella = r.data.friends.find((p: any) => p.id === "ella");
      assert.equal(ella.lat, undefined);
      assert.equal(ella.lng, undefined);
      assert.equal(ella.distance, undefined);
    },
  );
  await t.test(
    "Group creation rejects non-mutual clusters, then pauses if location is hidden",
    async () => {
      const payload = { name: "Coffee", members: ["mia", "sophie"] };
      assert.equal((await call("/groups", "POST", payload)).status, 400);
      await edit((s) =>
        s.friendships.push({
          a: "mia",
          b: "sophie",
          since: Date.now(),
          requestId: "test",
        }),
      );
      const r = await call("/groups", "POST", payload);
      assert.equal(r.status, 200);
      await call("/me", "PATCH", { sharing: false });
      const groups = await call("/groups");
      assert.equal(groups.data[0].active, false);
      assert.equal((await call(`/groups/${r.data.id}/messages`)).status, 400);
    },
  );
  await t.test(
    "Blocking removes the friend and revokes both read and send access",
    async () => {
      assert.equal((await call("/block/mia", "POST")).status, 200);
      assert.ok(
        !(await call("/state")).data.friends.some((p: any) => p.id === "mia"),
      );
      assert.equal((await call("/messages/mia")).status, 400);
      assert.equal(
        (await call("/messages/mia", "POST", { kind: "hi" })).status,
        400,
      );
    },
  );
});
