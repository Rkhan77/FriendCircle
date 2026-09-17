# Acceptance checks

Automated checks (`npm test`) cover:

- Haversine proximity checks and same-suburb coordinate filtering.
- Symmetric friend access and block revocation.
- Two-hour message and 24-hour request deadlines.
- Mutual friendship, location sharing, proximity, and freshness for groups.
- Encryption round trip for sender/recipient; wrong-key and tamper rejection.
- Nonfriend chat denial before request acceptance and invalid coordinate rejection.
- Upload/manual-review state, no fake AI approval, and recipient-only acceptance.
- File deletion after accepted request.
- All other users' coordinates and distances omitted from API payloads, including same-suburb friends and public profiles.
- Group pause and blocked account API authorization.
- Public/private profile discovery by common trait and suburb, profile editing, and authenticated avatar access.
- Distinct connected-friend suburbs unlock persistent 3/5/8-suburb achievements without disclosing friend coordinates; paused location sharing stops contributing to the current count.
- Continuous 10-minute shared-location rewards and separation reset.
- Encrypted chat allowance debit, overspend denial, social-credit rewards, and 300 units per person for accepted public chat requests.
- Unpublished restaurant drafts hidden from users, explicit partner approval gate, fresh nearby proximity triggering one shared invitation for both friends, 24-hour acceptance, either-friend acceptance exactly once, demo issuance disabled, and single-use staff redemption.
- Approved restaurant locations visible in Catch up within a fixed 5 km radius of the viewer's fresh shared location, including across suburb borders; a quiet storefront marker; 1–7 friend group invitations, 10%/15%/20% accepted-diner tiers capped at 4+ diners, and one shared group code redeemed at the unlocked rate. Restaurant redemption limits are configured by admins and shared by pair and group codes; sold-out venues leave Catch up.
- Aggregate tracking of verified meet sessions and sampled shared duration, current activity categories, offer invitations/acceptances and rates, and the admin-only analytics endpoint.

Browser acceptance: dedicated admin login and dashboard, restaurant registration and discount edit forms, activity and offer reports, MapLibre with suburb highlight and one same-suburb friend-count flag whose friend list slides above the flag with Chat and Catch up buttons, user status followed by suburb achievements above the full-width Nearby map, and current-suburb public profiles below the map only. Catch up highlights a distinct soft teal 5 km circle around the user and lists all approved deals inside it, including across suburb borders, with Redeem buttons, a storefront marker previewed on hover, and an offer card anchored to the selected pin with distance and tiers; no friend markers or counts appear there. The bell alerts for newly visible public profiles, newly available local offers, pending invitations, and friends entering the suburb. The reviewer restaurant draft, staff redemption screen, bio/interests, picture, and visibility controls under the header profile icon, location controls under Settings, meeting status strip, balances beside the notification bell in the top-right header, an initially empty Conversations list populated by direct-message history, chat invitations in Messages, photo-verification requests with a cable icon and labeled demo history in Friend requests, friend search/filter, profile dialog without friend distance or directions, hi sending, status editing, request form, reviewer view, local group form, and desktop/mobile layout remain available.

Requires configured external services for full integration acceptance:

- Supabase account creation/invites, JWKS verification and production HTTPS cookie flow.
- MapLibre style and tile provider load, provider key restrictions, drag/scroll interaction, and directions handoff.
- PostgreSQL/PostGIS transactions and operating permissions.
- MediaPipe container model loading and face-detection evaluation on consented photos.
- Multiple real users, devices, and network interruption handling.
- Stripe billing portal and cancellation for any existing subscriber. New map-range checkout is retired.
- ImageMagick processing of real consented avatar files and GPS spoofing resistance.
- Written restaurant partnership terms and staff accounts, real venue GPS proximity, code presentation and redemption at the register, and discount settlement.

The brief's numerical accuracy and conversion targets are not measured by these tests. Demo locations never mint rewards and demo billing is disabled. Public hosting and live payments require operator setup.
