# Develop Location-Based Social Platform with Photo Verification & Animated Status Map

## Project Overview
Build a social platform where users can only add friends after uploading a photo of two people together (photo verification). The main interface is a Google Maps-based view showing all verified friends within range. Users can chat or send "hi" to nearby friends, and each person displays animated status indicators showing what they're doing in real-time.

## Core Requirements

### 1. Photo Verification System
- User uploads photo of two people (self + potential friend)
- AI/ML verification to confirm both faces are present and clearly visible
- Manual review option for borderline cases
- Photo stored securely, deleted after 24 hours if not verified as friendship request

### 2. Google Maps Integration
- Display all verified friends within configurable radius (default: 5km)
- Pin markers with user avatar + status indicator color
- Click pin to see profile, send message/hi, view photo verification history
- Real-time location updates via GPS/WiFi positioning

### 3. Animated Status Indicators
- Each friend shows animated icon indicating current activity:
  - 🏃 Running (animated legs)
  - 💻 Working (typing cursor animation)
  - ☕ Hanging out (coffee cup floating)
  - 🎮 Gaming (controller spinning)
  - 😴 Sleeping (moon/eye closed animation)
- Status updates every 30 seconds via WebSocket
- Custom status selection with emoji + text description

### 4. Location-Based Chat
- "Hi" button sends ephemeral message visible only to recipient for 2 hours
- Full chat interface when user clicks friend's pin
- End-to-end encrypted messages
- Group chats limited to friends within same location cluster

### 5. Technical Stack Requirements
- Frontend: React/Next.js with Google Maps API (Places, Directions)
- Backend: Node.js/Express or Python/FastAPI
- Database: PostgreSQL + PostGIS for geospatial queries
- Real-time: WebSocket (Socket.io or Pusher)
- Photo verification: TensorFlow/PyTorch model for face detection
- Authentication: Firebase Auth or Supabase Auth

### 6. User Flow
```
User opens app → Sees map with nearby friends → 
Clicks friend's pin → Sees photo upload prompt → 
Uploads 2-person photo → AI verifies faces → 
Friend receives notification → Accept/reject request → 
Friendship established → Both users see each other on map
```

### 7. Privacy & Safety
- Users can hide location from non-friends (show only "nearby" without exact coordinates)
- Photo verification required before any chat access
- Report friend/block functionality
- Age restriction: 18+ for photo verification feature

### 8. Monetization Options
- Premium: Extended visibility radius, custom status animations, no ads
- Verified badge display (paid verification service)
- Featured in local "active users" list

### 9. Success Metrics
- Photo verification accuracy rate (>95%)
- Average time to establish friendship (<3 minutes)
- Daily active users within 5km radius
- Message completion rate (>80% of "hi"s convert to chats)

### 10. Deliverables
- MVP with core photo verification + map view
- Full feature set including chat and status animations
- Admin dashboard for managing verifications and disputes
- API documentation for third-party integrations
