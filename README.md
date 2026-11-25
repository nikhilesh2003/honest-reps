# Honest Reps — Gym Tracker

Full-stack Next.js (App Router + TypeScript + Tailwind CSS) PWA built from **Gym Tracker Requirements Specification (v0.3)** and **UI/UX Requirements (v0.4)**.

## Highlights

- **Pure OLED Black & Apple-Minimal UI**: `#000000` surfaces, crisp SF Pro typography, tabular numerals, uniform single-color green effort palette, zero emojis.
- **Honest Effort Engine (FR-28–FR-34, FR-62–FR-64, FR-70–FR-77)**:
  - 0–100 relative comparison against the user's own history (`50 = usual`).
  - First 2 logs of every exercise/activity remain `Calibrating` permanently; scoring starts from the 3rd log onward.
  - Strength volume = sum of `weight × reps` (optional strength minutes stored without affecting effort).
  - Cardio intensity uses average heart rate when logged (compared only against prior HR sessions) or MET/pace (compared only against prior non-HR sessions). Typed calories never inflate effort.
  - Day effort compares against past active days of the same muscle groups; calibrating items adjust the denominator so new exercises neither lift nor drag the day.
  - Backfilling up to 2 days back, tagged `"Added later"`, automatically recalculating subsequent scores.
- **Home Hub**: Current effort + trend delta, 7-day rolling sliding bars (Today always rightmost, older days rolling left), Quick Actions for Strength (quick entry + Add set) and Cardio (free text + screenshot upload + AI Confirmation Card + MET `"Estimated"` calories), and Daily Check-in popup with skippable weekly weight prompt.
- **Profile, Year Activity Grid & Settings**: Single-screen 365-day heatmap with all 8 distinct states, touch tap detail modal, full profile & body metric editor, live unit conversion (`kg`/`lb`, `cm`/`ft-in`), `"Share workout details"` privacy switch, personal exercise/muscle group library manager, notifications settings, and **Export / Copy This Month's Log** (CSV, JSON, and clipboard text).
- **Friends & Leaderboard**: Today & This Month leaderboards ranked by average effort per active day (rest days never penalized; calibrating friends unranked), friend requests by username or `/invite/[username]` link, and privacy-respecting Friend Detail view.
- **Admin Console (`/admin`)**: Server-enforced via `admin_emails` across all 10 admin areas (Dashboard, Users without private weight/chat, Default Exercise Library, AI Settings & Usage without exposed keys, FR-54 Effort & Grid Thresholds for future logs only, Friend Moderation, Announcements & Templates, Admin Emails, Audit Log, Export & Supabase Health).

## Running Locally

```bash
npm install
npm run test:effort
npm run dev
```

Open `http://localhost:3000`.

## Supabase Setup (Production Cloud Sync & Google OAuth)

1. Your project credentials are configured in `.env.local` (excluded from git; `SUPABASE_SECRET_KEY` is strictly server-side).
2. Run [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql) in your Supabase SQL Editor to create all 17 tables and Row-Level Security policies.
3. In Supabase Dashboard → **Authentication → Providers → Google**, enable Google OAuth and add `http://localhost:3000/auth/callback` (and your production domain `/auth/callback`) to Allowed Redirect URLs.
4. Optionally add `GEMINI_API_KEY` (or `OPENROUTER_API_KEY`) to `.env.local` to enable live Gemini 2.5 Flash vision OCR for treadmill/watch screenshots.
