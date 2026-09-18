# 🌟 FriendCircle — Meet Friends Where You Are

**The location-based social platform that turns your everyday walks into meaningful connections.** 

FriendCircle brings people together in their real neighborhoods, transforming casual encounters into lasting friendships through smart technology and genuine community building. Whether you're a foodie hunting for hidden gems, an adventurer seeking local meetups, or someone who just wants to connect with neighbors — FriendCircle makes it effortless.

---

## 🎯 Why FriendCircle?

### **Discover Local Connections**
Find people in your suburb who share your interests — from hiking buddies to book clubs. The platform intelligently matches you with nearby friends based on shared hobbies, favorite foods, sports, and activities.

### **Plan Real Meetups**
Organize "Catch up" sessions with just a few taps. FriendCircle handles the logistics: proximity checks, group coordination, and even restaurant discounts for your meetup spot.

### **Explore Local Restaurants Together**
Discover exclusive dining deals when you meet friends in person. Enjoy 20% off at Circle Kitchen (and other partnered venues) when you bring your friend group together!

### **Build Community Achievements**
Earn badges for exploring new suburbs, hosting local events, and growing your social circle. See how many friends live where you do — and discover hidden gems in your neighborhood.

---

## ✨ What Makes FriendCircle Special

### 🗺️ **Interactive Map Workspace**
- Real-time map showing your current suburb with friend density indicators
- One-click copy of your Circle ID for easy sharing
- Dedicated "Catch up" mode highlighting a 5km radius around you (soft teal boundary)
- Drag, pan, and zoom — no walking directions or person pins shown to protect privacy

### 👥 **Smart Friend Discovery**
- See how many friends live in your suburb with a simple flag click
- Expandable friend lists with instant Chat or Catch up actions
- Only public profiles visible without friendship (shared interests only)
- Private profiles require accepted friendship requests

### 💬 **Encrypted Messaging**
- End-to-end encrypted direct messages
- Two-hour ephemeral "hi" messages for casual check-ins
- Group chat encryption — each group has its own secure channel
- Real-time refresh with geolocation updates every 30 seconds

### 📸 **Photo Verification & Sharing**
- Upload JPEG/PNG/WebP photos (8MB max) with optional face detection
- Manual review process ensures authentic verification photos
- Private storage with recipient accept/reject controls
- Verification history tracking for transparency

### 🏪 **Restaurant Partnerships**
- Browse active discounts within 5km of your location
- Hover to preview storefronts, tap to see distance and group tiers
- Invite up to 7 friends — discounts scale from 10% (2 diners) to 20% (4+)
- One redeemable code per restaurant once a friend accepts
- Circle Kitchen demo offers available for testing

### 🎯 **Local Group Coordination**
- Create groups of 3–8 mutual friends within 2km of each other
- Shared group history and coordinated sending capabilities
- Automatic eligibility checks when members move outside range
- Real-time location sharing with 30-second refresh intervals

### 🏆 **Achievement System**
- Earn badges for visiting 3, 5, or 8 distinct suburbs
- Track persistent achievements across your friend network
- See community meet counts and daily trends in admin dashboard

---

## 🚀 How It Works

1. **Sign Up** — Email or phone confirmation with 18+ attestation
2. **Create Profile** — Add photos, bio, hobbies, favorite foods/sports/movies/games
3. **Share Location** — Geolocation sampling every 30 seconds (older than 2 min hidden in live mode)
4. **Discover Friends** — See who's nearby based on shared interests and suburb membership
5. **Connect** — Send chat requests or accept friendship invites
6. **Meet Up** — Plan Catch up sessions, explore local restaurants together
7. **Redeem Deals** — Use your group discount code at partnered venues

---

## 🌐 Live Preview

Explore the real FriendCircle interface at: **https://Rkhan77.github.io/FriendCircle/**

*Note: GitHub Pages shows static demo data only. Features requiring the Express API, Socket.IO, sign-in, chat, meeting rewards, and admin tools work locally.*

---

## 🔒 Privacy & Security

- **No real-person photos deployed** — Demo uses fictional accounts
- **Coordinates never shared with other users** — Only distance from your suburb shown
- **Encrypted messaging** — ECDH keys stored in IndexedDB (non-extractable)
- **Face detection only** — No identity verification, consent is self-attested
- **Admin analytics only** — Aggregated counts, no individual location/chat data exposed

---

## 📊 Tech Stack

- **Frontend:** Next.js 22+ with MapLibre interactive maps (OpenFreeMap basemap)
- **Backend:** Custom Express server + Socket.IO for real-time features
- **Database:** PostgreSQL + PostGIS for geospatial queries and suburb boundaries
- **Authentication:** Supabase with JWT, email/phone OTP, HTTP-only cookies in production
- **Face Detection:** MediaPipe Tasks BlazeFace via TensorFlow Lite (optional verification)

---

**Ready to connect with your neighborhood?** Download FriendCircle today and start building real community! 🤝✨
