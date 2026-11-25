# Rest Timer, 1RM Estimation, and PR Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an in-session countdown Rest Timer with audio/haptic chime, live estimated 1RM (One Rep Max) calculation, and all-time Personal Record (PR) badges across the workout logging and analytics flows.

**Architecture:** 
- Core math for 1RM estimation ($W \times (1 + R/30)$) and PR detection (Weight, 1RM, Volume) added as pure TypeScript functions in `src/lib/effort.ts`.
- Persistent minimalist floating Rest Timer component (`src/components/ui/RestTimerPill.tsx`) mounted in `GymAppShell.tsx` using Web Audio API for zero-dependency chimes and `navigator.vibrate` for haptics.
- Interactive set completion check-off (`✓`) in `LogStrengthSheet.tsx` that triggers the timer, with live 1RM feedback and PR celebration badges.
- Logs and Analytics tabs updated to surface PR badges and 1RM progression curves.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Lucide icons, Web Audio API, Web Vibration API.

## Global Constraints
- Pure OLED Black `#000000` surfaces with Apple-minimalist hairline borders (`border-white/10`).
- Zero emoji policy in UI copy; clean SF Pro typography and tabular numbers.
- Non-blocking Web Audio synthesized chime (no external audio assets).
- Tests must pass cleanly with `npx tsx` and `npx tsc --noEmit`.

---

### Task 1: 1RM Estimation & PR Detection Engine in `effort.ts`

**Files:**
- Modify: `src/lib/effort.ts`
- Modify: `src/lib/types.ts`
- Test: `src/lib/__tests__/effort.test.ts`

**Interfaces:**
- Produces:
  - `estimateOneRepMax(weightKg: number, reps: number): number`
  - `detectPersonalRecords(exerciseName: string, sets: Array<{ weightKg: number; reps: number }>, history: ExerciseLog[]): { isWeightPr: boolean; isOneRepMaxPr: boolean; isVolumePr: boolean; bestWeight: number; bestOneRepMax: number; bestVolume: number }`

- [ ] **Step 1: Add types in `src/lib/types.ts` and write the unit tests**
- [ ] **Step 2: Run `npx tsx src/lib/__tests__/effort.test.ts` to verify test fails**
- [ ] **Step 3: Implement `estimateOneRepMax` and `detectPersonalRecords` in `src/lib/effort.ts`**
- [ ] **Step 4: Run `npx tsx src/lib/__tests__/effort.test.ts` to verify test passes**

---

### Task 2: Rest Timer Floating Component (`RestTimerPill.tsx`)

**Files:**
- Create: `src/components/ui/RestTimerPill.tsx`

**Interfaces:**
- Produces:
  - `<RestTimerPill />` component with active countdown, `+30s`, `Skip`, preset durations (`60s`, `90s`, `120s`, `180s`), Web Audio dual-tone chime on zero, and device haptic vibration.

- [ ] **Step 1: Implement `src/components/ui/RestTimerPill.tsx`**
- [ ] **Step 2: Verify component builds with `npx tsc --noEmit`**

---

### Task 3: Set Check-off, Live 1RM, and PR Badges in `LogStrengthSheet.tsx`

**Files:**
- Modify: `src/components/modals/LogStrengthSheet.tsx`

**Interfaces:**
- Consumes:
  - `estimateOneRepMax` from `src/lib/effort.ts`
  - `detectPersonalRecords` from `src/lib/effort.ts`
- Produces:
  - Set checkmark button `✓` on each set row triggering the timer.
  - Live `Est. 1RM` calculation displayed below or beside active inputs.
  - Glowing `★ PR` badge on sets that break all-time personal records.

- [ ] **Step 1: Update `LogStrengthSheet.tsx` with live 1RM preview, set checkoff triggers, and PR detection**
- [ ] **Step 2: Verify type check passes with `npx tsc --noEmit`**

---

### Task 4: Global Timer Integration & Badges in Logs and Analytics Tabs

**Files:**
- Modify: `src/components/GymAppShell.tsx`
- Modify: `src/components/tabs/LogsTab.tsx`
- Modify: `src/components/tabs/AnalyticsTab.tsx`

**Interfaces:**
- Mounts `<RestTimerPill />` persistently at the top of the app shell across all tabs.
- Renders `★ PR` badge in `LogsTab` for sets that achieved records.
- Displays `Estimated 1RM` alongside `Max Weight` on the `AnalyticsTab` strength progression card.

- [ ] **Step 1: Mount floating timer in `GymAppShell.tsx` and wire rest duration state**
- [ ] **Step 2: Update `LogsTab.tsx` and `AnalyticsTab.tsx`**
- [ ] **Step 3: Run `npx tsc --noEmit` and `npm run test`**
- [ ] **Step 4: Run production build `npm run build`**
