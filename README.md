# FriendCircle

A working Next.js + Express social platform based on `FriendCircle/prompt.md`.

## Run locally

Requires Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Open http://127.0.0.1:3000. The default demo runs only on loopback and uses **fictional people and locations**. Changes persist in `.data/demo.json`. Demo friends do not simulate replies or successful AI checks. Uploading a photo for Circle ID `ella` creates a manual-review request; the shield icon opens the demo review dashboard. Reviewer approval does not auto-accept a friendship. Mia and Ava are mutual friends, so you can create a demo local group with them.

```bash
npm run typecheck
npm test
npm run build
npm start
```

The custom Express server is required: `next dev` / `next start` alone do not serve the API or Socket.IO. Tests start an isolated API server on port 3117 with temporary data, not your demo data.

## GitHub Pages preview

The Pages workflow in `.github/workflows/pages.yml` builds a static, sample-data preview at `https://Rkhan77.github.io/FriendCircle/`. It shows the real FriendCircle interface, MapLibre map, fictional people, and the fictional Circle Kitchen offer. Tabs, map navigation, profile cards, and offer details can be explored. GitHub Pages cannot run the Express API, Socket.IO, sign-in, chat, meeting rewards, admin tools, or restaurant redemption. Actions that require the server show a preview notice. Run the project locally for those flows.

The preview fixture is generated only from `seed()` by `scripts/refresh-pages-fixture.ts`; it never copies `.data/demo.json`, user photos, or private keys. Run `npm run build:pages` to check the static export in `out/`. Pushing `main` republishes it after GitHub Pages is configured to use **GitHub Actions** as its source.

## Implemented

- Responsive map workspace with the user's Circle ID beside Local circle and a one-click copy action, status followed by Friends across suburbs achievements above the Nearby map, and shared-interest public profiles from the current suburb below it. The dedicated Catch up map highlights a fixed soft teal 5 km radius around the user without friend markers or friend counts. Messages, My circle, and Friend requests use compact layouts without the large page header; the searchable My circle view keeps its Add a friend action. Profiles support photos, a bio, hobbies, favorite foods, sports, movies, and games.
- MapLibre interactive map with drag panning and scroll zoom. The user's current suburb has a pastel boundary and one flag showing how many friends are in that suburb. Clicking the flag slides a friend list up above it, with Chat and Catch up actions. Other users' precise coordinates and distances are never returned to the client; no person pins or walking directions appear. The default basemap uses OpenFreeMap with attribution.
- Supabase password sign-in using secure HTTP-only cookies in production, JWT verification through JWKS, adult onboarding, explicit photo consent, and public or private profile visibility. Only public profiles in the viewer's current suburb are discoverable when they share at least one profile interest; private profiles require accepted friendship. Newly visible local public profiles, newly available local restaurant offers, and friends entering the same suburb or coming within 200 m trigger in-app notifications. Connected friends sharing their suburb contribute to persistent achievements at 3, 5, and 8 distinct suburbs; extra perks are planned but not active.
- Public profiles can send chat requests. On acceptance, each person receives a separate 300-unit encrypted-chat allowance without becoming friends. In-person meeting time for accepted friends within 50 m with fresh location samples from both devices grants both people 100 chat units and 5 social credits per continuous 10 minutes. Encrypted messages spend authenticated UTF-8 payload bytes (ASCII is one unit; emoji use more). Group text uses the same meeting allowance. Fictional demo locations never earn rewards.
- Signed-in users with current location sharing can browse all active, approved restaurant discounts within 5 km of their location in Catch up, including restaurants across suburb borders. Hovering over a restaurant previews its storefront pin. Selecting it opens a card anchored to that pin with distance from the user and group discount tiers; its Redeem button opens the same card to invite friends or display an unlocked meal code for staff redemption. A user can invite up to seven connected friends to a listed restaurant. Friends have 24 hours to accept; the shared discount rises with the number of accepted diners. The default editable tiers are 10% for two diners, 15% for three, and **20% for four or more**, with no higher tier. One code appears when the first friend accepts; assigned restaurant staff can redeem it once at the unlocked rate. Each restaurant sets a maximum number of redemptions, shared by group and two-person offers; the venue leaves Catch up when that number is reached. The two-person automatic proximity offer remains available: when accepted friends share fresh locations within 50 m of each other and 2 km of a restaurant in the same suburb, the server creates one shared invitation. Only offers with written partner approval, funding, terms, validity, coordinates, an offer limit, and an assigned staff account are published. The reviewer dashboard contains an **unpublished proposal** for [Hungry Jack's Carlisle](https://www.hungryjacks.com.au/find-us/carlisle) near Kewdale; no discount or partnership is claimed. The Catch up list includes **Circle Kitchen (demo)**, a fictional restaurant for testing invitations; demo group codes cannot be redeemed for a real discount.
- Dedicated platform admin sign-in at `/admin/login`, leading to `/admin`. In live mode, the Supabase password session is issued only after the account UUID matches `ADMIN_USER_IDS`. The dashboard has a restaurant list showing discount rate, invitations, acceptances, and redemptions against each venue's limit; Manage opens a pop-out editor for rates, offer limit, and partner terms. Register restaurant opens `/admin/restaurants/new` to create an unpublished draft. The Manage pop-out can also remove a venue, hiding it from active views and expiring unused offers while preserving aggregate reporting history. The dashboard resolves community reports and shows aggregate current activities, verified meet counts/duration, daily meet trend, and offer acceptance/redemption totals. The local demo uses a labeled preview entry with fictional accounts; it has no real admin credentials.
- Radius passes and new Pro purchases are retired because friend discovery follows the user's suburb. Catch up uses the same fixed 5 km restaurant radius for everyone. Existing subscriptions can still open the billing portal; no paid entitlement changes discovery. Existing Fist balances migrate to social credits.
- JPEG/PNG/WebP uploads (8 MB), private storage, optional TensorFlow Lite face detection via MediaPipe, manual review, recipient accept/reject, and verification history metadata.
- Real-time refresh over authenticated Socket.IO; geolocation sampling every 30 seconds. Locations older than two minutes are hidden in live mode.
- The Conversations list starts empty and includes only people with an actual direct-message history. A Chat invitations button in Messages opens pending public-profile chat requests and shows their count; Friend requests uses a connected-wire icon and shows incoming and sent photo-verification requests, plus clearly labeled sample past entries in demo mode. The chat-character and social-credit balances sit beside the notification bell in the top-right header. Two-hour ephemeral “hi” messages, browser ECDH/AES-GCM encrypted direct messages, and local group messages encrypted separately for each member.
- Local groups of 3–8 mutual friends, all within 2 km of each other and sharing fresh locations. Group history and sending pause when a member becomes ineligible.
- Reports, blocking, restricted reviewer dashboard, 24-hour photo cleanup, and deletion after final acceptance/rejection. Cleanup runs at startup and every minute.
- PostgreSQL + PostGIS storage setup and geospatial index. Suburb membership uses bundled official ABS Suburbs and Localities polygons, while short-range meeting and meal-offer checks use Haversine distance. See database notes below.

## Connect real services

Copy `.env.example` to `.env.local`. Never commit actual credentials.

1. Set `APP_MODE=live`. Missing database or authentication configuration prevents startup. An unset mode is demo; demo refuses non-loopback binding.
2. Create a Supabase project with an asymmetric JWT signing key (JWKS), enable email/password authentication, and create/invite user accounts. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Users sign in then attest 18+ and create a profile. Self-service registration and password recovery are not implemented.
3. Use a PostgreSQL database with PostGIS. Set `DATABASE_URL`. For the included local service, set `POSTGRES_PASSWORD` and run `docker compose up -d postgres`. Migrations run during application startup. In deployment, pre-apply `database/schema.sql` with a migration role, then use a restricted application role with only the required table privileges.
4. Optionally set `NEXT_PUBLIC_MAP_STYLE_URL` to your own MapLibre style URL before building. The default OpenFreeMap style needs no key; check its service terms and capacity for your traffic. Restrict any other provider key to your application origins.
5. Set `ADMIN_USER_IDS` to the comma-separated Supabase UUIDs allowed to inspect submitted photos and moderate reports. Real mode never grants reviewer access by default.
   Those UUIDs also control `/admin/login` and every platform dashboard API. Only place trusted operator accounts in this list.
6. Set a random `FACE_VERIFIER_TOKEN` (at least 24 characters), run `docker compose up -d --build verification`, and set `FACE_VERIFIER_URL=http://127.0.0.1:8001/verify`. Keep this service private. The application falls back to manual review when it is unavailable.
7. Put `PHOTO_DIR` and `AVATAR_DIR` on a private encrypted volume. Avatar upload uses ImageMagick (`magick`) to orient, strip metadata, crop, and encode a 256 px WebP. Restrict OS access to the app user. Verification photos are never served from `public/`. Ensure cleanup remains running; after downtime, expired verification files are removed at startup.
8. If migrating existing Pro subscribers, configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for their billing portal and subscription updates. New Pro checkout is disabled because map radius is no longer a product feature.
9. Serve through HTTPS with a same-origin reverse proxy forwarding WebSocket connections, an 8 MB upload cap, request throttling, and correct `Host` headers. Configure `PUBLIC_ORIGIN` to the external HTTPS origin so same-origin checks work behind the proxy. Secure cookies and browser geolocation require HTTPS outside loopback.
10. For meal offers, obtain written approval from each restaurant for the exact **2/3/4+ diner discount tiers**, total redemption limit, who funds them, exclusions, dates, and redemption process. In the admin restaurant editor, complete the draft with venue coordinates and a signed-in staff account Circle ID, then confirm approval to publish. A code can be redeemed only by that assigned staff account or an admin. Staff should verify the accepted diners are present before redeeming. Validate GPS integrity and restaurant staff procedures before enabling valuable real-world discounts.

## Encryption and privacy boundaries

Private ECDH keys are non-extractable and saved in IndexedDB. Only public keys and encrypted envelopes reach the server. AES-GCM uses a fresh random 96-bit IV per message. Key changes fail closed. Clearing browser storage or moving to a new device currently loses access to old messages; recovery/multi-device key management is not implemented. There is no forward secrecy, independent identity-key verification, or audited cryptographic protocol: obtain a professional review before claiming production-grade secure messaging. Sender/recipient IDs and timestamps are visible to the server; ephemeral “hi” notifications are not encrypted text.

Face detection checks that two faces are visible. It **does not establish identity, consent, liveness, or age**. Both consent and 18+ eligibility are self-attested. Confidence is a detector score, not a measured accuracy guarantee. The >95% accuracy and engagement figures in the brief are unvalidated targets. Automatic checks require exactly two detections with minimum confidence 0.95; small/clipped faces and unavailable detection go to human review. Reviewers must not equate detection with identity verification.

No real-person photo, account, or location has been supplied or deployed as part of the demo. Public profiles can disclose same-suburb presence to signed-in users with a common trait; private profiles require accepted friendship. Neither friend's nor matched public user's exact coordinates or distance is sent to another user. Nonfriends can exchange encrypted text only after a chat request is accepted. Blocking revokes access in both directions. GPS can be spoofed, so meeting rewards are suitable for a pilot and require anti-spoofing work before high-value redemption.

Admin analytics are server-side aggregates: they include counts and sampled verified shared seconds, current activity categories, and partner-offer conversion counts. They do not include exact locations, chat text, or individual meeting histories. Meet totals start when aggregate tracking is enabled; older transient meeting records cannot be reconstructed reliably. The dashboard shows the tracking start date. Proximity samples every 30 seconds and caps each credited interval at 35 seconds, so duration is an estimate of verified shared time, not a precise stopwatch for all time spent together.

## Storage and scale

`app_state` is a server-only JSONB document protected by a row lock for atomic MVP changes. A separate PostGIS geography table and GiST index maintain geospatial data. This deliberately simple adapter is suitable for a small pilot, not a large social network: split records into normalized tables, add database constraints, paginate messages, and introduce Redis-backed rate limiting and Socket.IO distribution before scaling. The demo file store is single-process only.

## Scope still requiring production work

- Provision and validate real Supabase, a production map style/tiles provider, PostgreSQL, and face model services in your deployment.
- Independent security/privacy review, consent/age assurance policy, abuse controls, account lifecycle, device recovery, and encrypted-message protocol audit.
- Load tests, face model evaluation across a representative consented test set, observability, backup/retention operations, and deployment configuration.
- Bundled suburb boundaries currently cover the Perth metropolitan demo area. Outside that area, the app shows no suburb matches until more polygons are added.
- New Pro checkout is retired. Existing subscriptions need a configured Stripe billing portal for account management; no purchase or paid verification is simulated.
- Restaurant coordinates identify venues on the map; users' coordinates are used server-side for meeting and deal eligibility, not shown to other users.

See `docs/API.md` for request/response examples and `docs/ACCEPTANCE.md` for validation coverage.

## Face model reference

The private verifier uses the MediaPipe Tasks FaceDetector API with the BlazeFace short-range TensorFlow Lite model. Official documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/python. Model URL is pinned to Google's version `float16/1` in the service Dockerfile; the model must be downloaded when building the service.
