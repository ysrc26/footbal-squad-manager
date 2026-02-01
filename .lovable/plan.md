

# Football Squad Manager - Updated Implementation Plan

## Overview
A Hebrew (RTL) PWA for managing weekly football games in Nehalim, Israel. Features automatic Shabbat-aware scheduling, GPS-based check-in with in-app QR scanning, and real-time queue management with a "Zero Admin" game-day philosophy.

---

## Phase 1: Foundation & Authentication

### Database Setup
- **Profiles table**: `id`, `full_name`, `phone_number`, `avatar_url`, `is_resident` (boolean)
- **User_roles table**: Separate table with `user_id` and `role` (enum: admin, user) for security
- **App_Settings table** (single row):
  - `field_latitude`, `field_longitude` (GPS coordinates)
  - `rules_content` (Text/HTML for rules page)
  - `qr_secret_key` (60+ char secure random string for check-in validation)
- **Games table**: `id`, `date`, `shabbat_end`, `candle_lighting`, `deadline_time`, `kickoff_time`, `status`
- **Registrations table**: `user_id`, `game_id`, `status`, `check_in_status`, `eta_minutes`, `created_at`
- Row-Level Security policies using `has_role()` security definer function

### Authentication Flow
- Phone-based OTP login via Supabase Auth
- Profile creation on first login with Hebrew onboarding
- First admin seeded via SQL migration
- RTL layout throughout the app

---

## Phase 2: Game Management & Registration

### Automatic Game Creation with Hebcal Integration
- Fetch Shabbat times for Nehalim from Hebcal API:
  - `candle_lighting` (Friday evening - Shabbat start)
  - `havdalah` (Saturday night - Shabbat end)
- **Time Calculations:**
  - **Wave 2 Opens**: `candle_lighting` - 60 minutes (Friday afternoon)
  - **Base Time**: `havdalah` + 60 minutes
  - **Deadline Time**: Round UP base time to nearest :00 or :30
  - **Kickoff Time**: `deadline_time` - 15 minutes

### Registration Waves
- **Wave 1** (Friday 12:00 PM): `status = 'open_for_residents'` - Only `is_resident = true` users
- **Wave 2** (candle_lighting - 60 min): `status = 'open_for_all'` - Everyone can register
- Queue management: Positions 1-15 = Active, 16+ = Standby
- Auto-promote standby when active players cancel

### Dashboard UI (Dark Mode + Neon Green)
- Countdown timer to deadline/kickoff
- Split view: Active players list vs. Standby queue
- Visual badges: 🏠 Resident, ✅ Checked-In, ⏱️ ETA
- Quick actions: Register, Cancel, Update ETA
- Supabase Realtime for instant list updates

---

## Phase 3: GPS Check-In System

### QR Code Setup
- **Secure Key**: 60+ character random string stored in `App_Settings.qr_secret_key`
- **Printable QR**: Admin downloads QR code image containing the secret key
- Posted at field entrance for players to scan

### In-App QR Scanner (react-qr-reader)
- **Visibility Rule**: "Check In" button shows ONLY for users with registration `status = 'active'` OR `status = 'standby'`
- Built-in camera scanner using `react-qr-reader` library
- No reliance on native phone camera app

### Check-In Validation Flow
1. Player taps "Check In" button (only visible if registered)
2. In-app QR scanner opens
3. Player scans QR code at field
4. App validates scanned value matches `qr_secret_key` from App_Settings
5. App requests GPS location (`enableHighAccuracy: true`)
6. Fetch field coordinates from App_Settings
7. Calculate distance using Haversine formula
8. **Within 10m**: Mark `check_in_status = 'checked_in'` ✅
9. **Outside 10m**: Show error message "אנא התקרב למגרש" (Please move closer to the field)

### Zero-Admin Auto-Swap (Edge Function)
- Scheduled to run at `deadline_time`
- Mark non-checked-in active players as `no_show`
- Promote checked-in standby players by registration order
- Fully automatic, no manual intervention

---

## Phase 4: Admin Panel

### Protected Admin Route
- Access controlled via `has_role(auth.uid(), 'admin')` check
- Clean Hebrew admin interface

### Admin Features
1. **Set Field Location**: One-click to capture current GPS and save to App_Settings
2. **Regenerate QR Secret**: Generate new 60-char random key + download new QR image
3. **Download QR Code**: Get printable QR image for the field
4. **Edit Rules**: Text editor for Rules tab content (saved to App_Settings)
5. **Manage Users**: 
   - View all registered users
   - Toggle `is_resident` boolean per user
   - Toggle admin role (adds/removes from user_roles table)

---

## Phase 5: UI/UX & PWA

### Design System
- **Theme**: Dark mode background with neon green (#39FF14) accents
- **Style**: Professional, sporty aesthetic
- **Layout**: Full RTL support (Hebrew)
- **Responsive**: Mobile-first design

### App Pages
1. **Login** - Phone OTP with Hebrew instructions
2. **Dashboard** - Game countdown, player lists, action buttons
3. **Profile** - Edit name, avatar, view personal stats
4. **Rules** - Dynamic content from App_Settings.rules_content
5. **Admin** - Location setup, QR management, user management

### PWA Configuration
- Web app manifest for "Add to Home Screen"
- Custom app icon and splash screen
- Installable on mobile devices
- Requires internet connection (no offline mode per your selection)

---

## Technical Summary

### New Dependencies
- `react-qr-reader` - In-app QR code scanning
- `qrcode.react` - QR code generation for admin download

### Edge Functions
1. **fetch-shabbat-times**: Calls Hebcal API, calculates game times
2. **auto-swap-deadline**: Runs at deadline, handles no-shows and promotions

### Security Measures
- Separate `user_roles` table with `has_role()` security definer function
- 60+ char random QR secret key
- GPS validation within 10 meters
- RLS policies on all tables

