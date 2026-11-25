"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Download,
  Copy,
  Bell,
  Dumbbell,
  User,
  Scale,
  Shield,
  LogOut,
  ChevronRight,
  Plus,
  EyeOff,
  Eye,
  Trash2,
  Smartphone,
  Sun,
  Moon,
  Monitor,
  MessageCircle,
  MapPin,
} from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import { GymLocationConfig } from "@/lib/gym-location";
import {
  dispatchServerPush,
  ensureWebPushSubscribed,
  requestAppNotificationPermission,
  showLocalNotification,
  unsubscribeWebPush,
} from "@/lib/notifications";
import {
  buildInviteShareText,
  buildProgressShareText,
  openWhatsAppShare,
} from "@/lib/share";
import {
  applyThemePreference,
  getStoredThemePreference,
} from "../ThemeSync";
import {
  apiBuildExport,
  apiLibraryAction,
  apiLogWeight,
  apiUpdateNotifications,
  apiUpdateProfile,
} from "@/lib/client-engine";
import { ActiveStatus, HeightUnit, ThemePreference, WeightUnit } from "@/lib/types";
import { formatHeight, formatWeight } from "@/lib/effort";
import {
  isHapticsEnabled,
  setHapticsEnabled,
  triggerHaptic,
} from "@/lib/haptics";
import { computeUserMilestones } from "@/lib/milestones";
import { YearHeatmap } from "../YearHeatmap";
import { MilestoneBadgesCard } from "../ui/MilestoneBadgesCard";
import { BottomSheet } from "../ui/BottomSheet";

interface ProfileTabProps {
  state: AppStatePayload;
  gymLocation?: GymLocationConfig | null;
  geoStatus?: "idle" | "watching" | "denied" | "unavailable" | "error";
  onOpenGymLocation?: () => void;
  onRefresh: () => void;
  onToast: (text: string, tone?: "success" | "error") => void;
  onSignOut: () => void;
}

export function ProfileTab({
  state,
  gymLocation,
  geoStatus = "idle",
  onOpenGymLocation,
  onRefresh,
  onToast,
  onSignOut,
}: ProfileTabProps) {
  const { monthStats, latestWeight } = state;
  const [profile, setOptProfile] = useState(state.profile);
  const [notificationSettings, setOptNotif] = useState(state.notificationSettings);

  useEffect(() => {
    setOptProfile(state.profile);
  }, [state.profile]);

  useEffect(() => {
    setOptNotif(state.notificationSettings);
  }, [state.notificationSettings]);

  // Modals
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [weightSheetOpen, setWeightSheetOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Edit profile form state
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [heightCm, setHeightCm] = useState(String(profile.heightCm));
  const [activeStatus, setActiveStatus] = useState<ActiveStatus>(profile.activeStatus);
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");
  const [sex, setSex] = useState(profile.sex || "");
  const [goal, setGoal] = useState(profile.goal || "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Log new weight form
  const [newWeight, setNewWeight] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);

  // Personal library form (FR-67)
  const [newExName, setNewExName] = useState("");
  const [newExGroup, setNewExGroup] = useState("Chest");
  const [newGroupName, setNewGroupName] = useState("");

  // Export & Copy loading
  const [copyingLog, setCopyingLog] = useState(false);
  const [themePref, setThemePref] = useState<ThemePreference>(() =>
    getStoredThemePreference()
  );
  const [hapticsOn, setHapticsOn] = useState<boolean>(() => isHapticsEnabled());

  const handleToggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
    if (next) {
      triggerHaptic("medium");
      onToast("Haptic feedback enabled");
    } else {
      onToast("Haptic feedback disabled");
    }
  };

  const handleThemeChange = (next: ThemePreference) => {
    setThemePref(next);
    applyThemePreference(next);
    onToast(
      next === "system"
        ? "Appearance set to System"
        : next === "light"
        ? "Light theme enabled"
        : "Dark theme enabled"
    );
  };

  const openEditProfile = () => {
    setName(profile.name);
    setUsername(profile.username);
    setHeightCm(String(profile.heightCm));
    setActiveStatus(profile.activeStatus);
    setAge(profile.age ? String(profile.age) : "");
    setSex(profile.sex || "");
    setGoal(profile.goal || "");
    setEditProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const data = await apiUpdateProfile({
        name,
        username,
        heightCm: Number(heightCm),
        activeStatus,
        age: age ? Number(age) : null,
        sex,
        goal,
      });
      if (!data.ok) {
        onToast(data.error || "Could not update profile", "error");
        return;
      }
      onToast("Profile updated");
      setEditProfileOpen(false);
      onRefresh();
    } finally {
      setSavingProfile(false);
    }
  };

  const handleQuickPatch = (patch: Record<string, unknown>, msg: string) => {
    setOptProfile((prev) => ({ ...prev, ...patch }));
    onToast(msg);
    void apiUpdateProfile(patch).then((res) => {
      if (res.ok) onRefresh();
    });
  };

  const handleLogWeight = async () => {
    if (!newWeight) return;
    setSavingWeight(true);
    try {
      const res = await apiLogWeight(Number(newWeight));
      if (res.ok) {
        onToast("Weight logged");
        setNewWeight("");
        setWeightSheetOpen(false);
        onRefresh();
      } else {
        onToast(res.error || "Invalid weight", "error");
      }
    } finally {
      setSavingWeight(false);
    }
  };

  // Explicit User Request: Export This Month's Log (CSV / JSON)
  const handleExportMonthLog = (format: "csv" | "json") => {
    const exp = apiBuildExport(format, monthStats.monthPrefix);
    const blob = new Blob([exp.content], { type: exp.mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exp.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onToast(`Exported ${monthStats.monthPrefix} (${format.toUpperCase()})`);
  };

  // Explicit User Request: Copy This Month's Log
  const handleCopyMonthLog = async () => {
    setCopyingLog(true);
    try {
      const exp = apiBuildExport("text", monthStats.monthPrefix);
      await navigator.clipboard.writeText(exp.content);
      onToast("Copied this month's log");
    } catch {
      onToast("Could not copy log", "error");
    } finally {
      setCopyingLog(false);
    }
  };

  const handleLibraryAction = async (payload: Record<string, unknown>, msg: string) => {
    const res = await apiLibraryAction(payload);
    if (res.ok) {
      onToast(msg);
      onRefresh();
    } else {
      onToast(res.error || "Action failed", "error");
    }
  };

  const handleNotifPatch = (patch: Record<string, unknown>) => {
    setOptNotif((prev) => ({ ...prev, ...patch }));
    void apiUpdateNotifications(patch).then((res) => {
      if (res.ok) onRefresh();
    });
  };

  const personalExercises = state.allAccessibleExercises.filter(
    (e) => e.ownerId === profile.userId
  );
  const defaultExercises = state.allAccessibleExercises.filter((e) => e.ownerId === null);
  const hiddenSet = new Set(state.hiddenExerciseIds);

  const milestonesSummary = useMemo(() => {
    return (
      state.milestones ??
      computeUserMilestones({
        exerciseLogs: state.recentExerciseLogs,
        cardioLogs: state.recentCardioLogs,
        summaries365: state.summaries365,
        currentStreak: state.monthStats.currentStreak,
        weightUnit: profile.weightUnit,
        todayIso: state.realTodayIso,
      })
    );
  }, [
    state.milestones,
    state.recentExerciseLogs,
    state.recentCardioLogs,
    state.summaries365,
    state.monthStats.currentStreak,
    profile.weightUnit,
    state.realTodayIso,
  ]);

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white leading-tight">
            {profile.name}
          </h1>
          <div className="text-[13px] font-medium text-[#10e760] mt-0.5">
            @{profile.username}
          </div>
        </div>
        <button
          type="button"
          onClick={openEditProfile}
          className="px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[12px] font-medium text-white cursor-pointer"
        >
          Edit
        </button>
      </div>

      {/* FR-60 Summary Figures */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="apple-card p-3.5 text-center">
          <div className="text-[22px] font-bold text-[#10e760] tabular-nums">
            {monthStats.activeDaysYear}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b] mt-0.5">
            Year Active
          </div>
        </div>
        <div className="apple-card p-3.5 text-center">
          <div className="text-[22px] font-bold text-[#10e760] tabular-nums">
            {monthStats.currentStreak}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b] mt-0.5">
            Streak
          </div>
        </div>
        <div className="apple-card p-3.5 text-center">
          <div className="text-[22px] font-bold text-white tabular-nums">
            {monthStats.longestStreak}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#86868b] mt-0.5">
            Longest
          </div>
        </div>
      </div>

      {/* FR-57–FR-60: 365-Day Year Activity Grid (Single Screen Fit + Tap Detail) */}
      <YearHeatmap
        summaries365={state.summaries365}
        thresholds={state.appSettings.gridThresholds}
      />

      {/* Cardio & Strength Milestones & Badges Showcase */}
      <MilestoneBadgesCard summary={milestonesSummary} />

      {/* PROFILE SETTINGS SECTION */}
      <div className="space-y-3 pt-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b] px-1">
          Settings
        </div>

        {/* Monthly Log Export & Copy (Explicitly Requested by User) */}
        <div className="apple-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-white">This Month&apos;s Log</span>
            <span className="text-[11px] text-[#86868b] tabular-nums">
              {monthStats.monthPrefix}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleExportMonthLog("csv")}
              className="h-11 px-3 rounded-2xl bg-[#10e760] hover:bg-[#25d658] text-black text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              Export Log
            </button>
            <button
              type="button"
              disabled={copyingLog}
              onClick={handleCopyMonthLog}
              className="h-11 px-3 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Copy className="w-4 h-4 shrink-0" />
              {copyingLog ? "Copying..." : "Copy Log"}
            </button>
          </div>
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => handleExportMonthLog("json")}
              className="py-1.5 text-[11px] text-[#86868b] hover:text-white transition-colors cursor-pointer"
            >
              Download JSON
            </button>
            <button
              type="button"
              onClick={() =>
                openWhatsAppShare(
                  buildProgressShareText({
                    name: profile.name,
                    username: profile.username,
                    monthPrefix: monthStats.monthPrefix,
                    monthEffort: monthStats.monthEffort,
                    activeDays: monthStats.activeDaysThisMonth,
                    streak: monthStats.currentStreak,
                  })
                )
              }
              className="py-1.5 text-[12px] font-medium text-[#10e760] hover:underline flex items-center gap-1.5 cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Share via WhatsApp
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              openWhatsAppShare(buildInviteShareText(profile.name, profile.username))
            }
            className="w-full h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[12px] font-medium text-[#d1d1d6] flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle className="w-3.5 h-3.5 text-[#10e760]" />
            Invite Friend on WhatsApp
          </button>
        </div>

        {/* Profile & Body Metrics (FR-2 to FR-5, FR-65) */}
        <div className="apple-card divide-y divide-white/[0.06]">
          <button
            type="button"
            onClick={openEditProfile}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3 text-[14px] font-medium text-white">
              <User className="w-4 h-4 text-[#86868b]" />
              Profile & Metrics
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-[#86868b] tabular-nums">
              {formatHeight(profile.heightCm, profile.heightUnit)} · {profile.activeStatus}
              <ChevronRight className="w-4 h-4 text-[#525257]" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWeightSheetOpen(true)}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3 text-[14px] font-medium text-white">
              <Scale className="w-4 h-4 text-[#86868b]" />
              Weight
            </span>
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#10e760] tabular-nums">
              {latestWeight ? formatWeight(latestWeight.weightKg, profile.weightUnit) : "Add"}
              <ChevronRight className="w-4 h-4 text-[#525257]" />
            </span>
          </button>

          {/* Units Selection (FR-4) */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <span className="text-[14px] font-medium text-white">Units</span>
            <div className="flex items-center gap-2">
              <div className="flex bg-black border border-white/10 rounded-lg p-0.5">
                {(["kg", "lb"] as WeightUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => handleQuickPatch({ weightUnit: u }, `Weight unit set to ${u}`)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                      profile.weightUnit === u
                        ? "bg-white text-black"
                        : "text-[#86868b] hover:text-white"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <div className="flex bg-black border border-white/10 rounded-lg p-0.5">
                {(["cm", "ft-in"] as HeightUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => handleQuickPatch({ heightUnit: u }, `Height unit set to ${u}`)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                      profile.heightUnit === u
                        ? "bg-white text-black"
                        : "text-[#86868b] hover:text-white"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Appearance: System / Light / Dark Theme */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <span className="text-[14px] font-medium text-white">Appearance</span>
            <div className="flex bg-black border border-white/10 rounded-xl p-0.5 gap-0.5">
              {(
                [
                  { id: "system", label: "Auto", icon: Monitor },
                  { id: "light", label: "Light", icon: Sun },
                  { id: "dark", label: "Dark", icon: Moon },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleThemeChange(id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                    themePref === id
                      ? "bg-white text-black"
                      : "text-[#86868b] hover:text-white"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Haptic Feedback Toggle */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div>
              <span className="text-[14px] font-medium text-white">
                Haptic Feedback
              </span>
              <p className="text-[11px] text-[#86868b] mt-0.5">
                Tactile tap on supported phones
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hapticsOn}
              data-checked={hapticsOn}
              onClick={handleToggleHaptics}
              className="ios-switch"
            >
              <span className="ios-switch-thumb" />
            </button>
          </div>
        </div>

        {/* Privacy: FR-69 Share Workout Details Switch */}
        <div className="apple-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-white">
                Share workout details
              </div>
              <p className="text-[12px] text-[#86868b] mt-0.5 leading-snug">
                When on, friends can also see your logged exercises, weights, reps, and cardio on your profile grid. Weight, height, and activity level always stay private.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile.shareWorkoutDetails}
              data-checked={profile.shareWorkoutDetails}
              onClick={() =>
                handleQuickPatch(
                  { shareWorkoutDetails: !profile.shareWorkoutDetails },
                  !profile.shareWorkoutDetails
                    ? "Workout details shared with friends"
                    : "Workout details set to private"
                )
              }
              className="ios-switch"
            >
              <span className="ios-switch-thumb" />
            </button>
          </div>
        </div>

        {/* Exercises, Notifications, Admin & Sign Out */}
        <div className="apple-card divide-y divide-white/[0.06]">
          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3 text-[14px] font-medium text-white">
              <Dumbbell className="w-4 h-4 text-[#86868b]" />
              Exercises & Muscle Groups
            </span>
            <ChevronRight className="w-4 h-4 text-[#525257]" />
          </button>

          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3 text-[14px] font-medium text-white">
              <Bell className="w-4 h-4 text-[#86868b]" />
              Notifications
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-[#86868b]">
              {notificationSettings.dailyPromptEnabled ? notificationSettings.dailyPromptTime : "Off"}
              <ChevronRight className="w-4 h-4 text-[#525257]" />
            </span>
          </button>

          {onOpenGymLocation && (
            <button
              type="button"
              onClick={onOpenGymLocation}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-3 text-[14px] font-medium text-white">
                <MapPin className="w-4 h-4 text-[#86868b]" />
                Gym Location
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-[#86868b] max-w-[180px] truncate">
                {!gymLocation
                  ? "Not set"
                  : !gymLocation.enabled
                  ? `${gymLocation.name} · Paused`
                  : geoStatus === "denied" || geoStatus === "error"
                  ? `${gymLocation.name} · Location off`
                  : `${gymLocation.name} · ${gymLocation.radiusMeters}m`}
                <ChevronRight className="w-4 h-4 text-[#525257] shrink-0" />
              </span>
            </button>
          )}

          {/* FR-46: Admin area visible ONLY to users with admin role */}
          {state.isAdmin && (
            <Link
              href="/admin"
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <span className="flex items-center gap-3 text-[14px] font-medium text-[#10e760]">
                <Shield className="w-4 h-4" />
                Admin Console
              </span>
              <ChevronRight className="w-4 h-4 text-[#525257]" />
            </Link>
          )}

          <button
            type="button"
            onClick={onSignOut}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3 text-[14px] font-medium text-[#86868b]">
              <LogOut className="w-4 h-4" />
              Sign Out
            </span>
            <span className="text-[11px] text-[#525257] truncate max-w-[160px]">
              {profile.email}
            </span>
          </button>
        </div>

        <div className="pt-2 text-center text-[11px] text-[#525257]">
          Developed by Ifleon
        </div>
      </div>

      {/* Edit Profile Sheet (FR-2 to FR-4, FR-65) */}
      <BottomSheet
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        title="Profile & Metrics"
      >
        <div className="space-y-3.5">
          <div>
            <label className="block text-[11px] text-[#86868b] mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#86868b] mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Height (cm)</label>
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Age (optional)</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-black border border-white/12 text-white text-[14px] tabular-nums focus:outline-none focus:border-[#10e760]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#86868b] mb-1">Activity Status</label>
            <select
              value={activeStatus}
              onChange={(e) => setActiveStatus(e.target.value as ActiveStatus)}
              className="w-full h-11 px-3 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
            >
              <option value="Sedentary">Sedentary</option>
              <option value="Lightly active">Lightly active</option>
              <option value="Moderately active">Moderately active</option>
              <option value="Very active">Very active</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Sex (optional)</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
              >
                <option value="">Prefer not to say</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#86868b] mb-1">Goal (optional)</label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-black border border-white/12 text-white text-[14px] focus:outline-none focus:border-[#10e760]"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={savingProfile}
            onClick={handleSaveProfile}
            className="w-full h-12 rounded-2xl bg-[#10e760] hover:bg-[#25d658] text-black font-semibold text-[15px] cursor-pointer mt-2"
          >
            {savingProfile ? "Saving..." : "Save"}
          </button>
        </div>
      </BottomSheet>

      {/* Log Weight Sheet (FR-5) */}
      <BottomSheet
        open={weightSheetOpen}
        onClose={() => setWeightSheetOpen(false)}
        title="Log Weight"
        subtitle="Stored as a dated entry in your private weight history."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              placeholder={
                latestWeight
                  ? String(
                      profile.weightUnit === "lb"
                        ? Number((latestWeight.weightKg * 2.20462).toFixed(1))
                        : latestWeight.weightKg
                    )
                  : "74.5"
              }
              className="flex-1 h-12 px-4 rounded-xl bg-black border border-white/12 text-white text-[18px] font-semibold tabular-nums focus:outline-none focus:border-[#10e760]"
            />
            <span className="text-[14px] text-[#86868b] font-medium w-8">
              {profile.weightUnit}
            </span>
          </div>
          <button
            type="button"
            disabled={savingWeight || !newWeight}
            onClick={handleLogWeight}
            className="w-full h-12 rounded-2xl bg-[#10e760] hover:bg-[#25d658] disabled:opacity-40 text-black font-semibold text-[15px] cursor-pointer"
          >
            {savingWeight ? "Saving..." : "Save Weight"}
          </button>

          {state.weightLogs.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                Recent Entries
              </div>
              {[...state.weightLogs]
                .reverse()
                .slice(0, 6)
                .map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between text-[13px] py-1"
                  >
                    <span className="text-[#86868b] tabular-nums">{w.date}</span>
                    <span className="text-white font-medium tabular-nums">
                      {formatWeight(w.weightKg, profile.weightUnit)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Personal Exercises & Muscle Groups Manager Sheet (FR-67) */}
      <BottomSheet
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        title="My Library"
        subtitle="Add your own exercises or hide defaults."
      >
        <div className="space-y-5">
          {/* Add personal exercise */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Add Exercise
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                placeholder="Exercise name"
                className="flex-1 h-10 px-3 rounded-xl bg-black border border-white/12 text-white text-[13px] focus:outline-none focus:border-[#10e760]"
              />
              <select
                value={newExGroup}
                onChange={(e) => setNewExGroup(e.target.value)}
                className="h-10 px-2.5 rounded-xl bg-black border border-white/12 text-white text-[12px]"
              >
                {state.visibleMuscleGroups.map((mg) => (
                  <option key={mg.id} value={mg.name}>
                    {mg.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!newExName.trim()) return;
                  handleLibraryAction(
                    { action: "add-exercise", name: newExName, muscleGroup: newExGroup },
                    `Added ${newExName}`
                  );
                  setNewExName("");
                }}
                className="w-10 h-10 rounded-xl bg-[#10e760] text-black flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Add personal muscle group */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Add Muscle Group
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Forearms, Mobility"
                className="flex-1 h-10 px-3 rounded-xl bg-black border border-white/12 text-white text-[13px] focus:outline-none focus:border-[#10e760]"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newGroupName.trim()) return;
                  handleLibraryAction(
                    { action: "add-muscle-group", name: newGroupName },
                    `Added group ${newGroupName}`
                  );
                  setNewGroupName("");
                }}
                className="w-10 h-10 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] text-white flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Personal Exercises */}
          {personalExercises.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                Personal Exercises
              </div>
              {personalExercises.map((ex) => (
                <div
                  key={ex.id}
                  className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-[13px]"
                >
                  <div>
                    <span className="text-white font-medium">{ex.name}</span>
                    <span className="text-[#86868b] text-[11px] ml-2">{ex.muscleGroup}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleLibraryAction(
                        { action: "delete-exercise", id: ex.id },
                        `Deleted ${ex.name}`
                      )
                    }
                    className="text-[#86868b] hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Default Exercises (hide/unhide per FR-67) */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
              Default Library
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto no-scrollbar">
              {defaultExercises.map((ex) => {
                const isHidden = hiddenSet.has(ex.id);
                return (
                  <div
                    key={ex.id}
                    className="px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-[13px]"
                  >
                    <div className={isHidden ? "opacity-40 line-through" : ""}>
                      <span className="text-white">{ex.name}</span>
                      <span className="text-[#86868b] text-[11px] ml-2">
                        {ex.muscleGroup}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleLibraryAction(
                          { action: "toggle-hide-default", exerciseId: ex.id },
                          isHidden ? `Shown ${ex.name}` : `Hidden ${ex.name}`
                        )
                      }
                      className="text-[#86868b] hover:text-white cursor-pointer"
                      title={isHidden ? "Show in pills" : "Hide from pills"}
                    >
                      {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Notifications Settings Sheet (FR-40 to FR-45, NFR-8) */}
      <BottomSheet
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title="Notifications"
        subtitle="Training reminders pause automatically on Rest days."
      >
        <div className="space-y-4">
          <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-start gap-2.5 text-[12px] text-[#86868b]">
            <Smartphone className="w-4 h-4 text-[#10e760] shrink-0 mt-0.5" />
            <span>
              On iPhone, add Honest Reps to your Home Screen in Safari to enable web push notifications.
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium text-white">Daily Training Prompt</div>
                <div className="text-[11px] text-[#86868b]">Suppressed on Rest days</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={notificationSettings.dailyPromptTime}
                  onChange={(e) => handleNotifPatch({ dailyPromptTime: e.target.value })}
                  className="bg-black border border-white/12 rounded-lg px-2 py-1 text-[12px] text-white tabular-nums"
                />
                <button
                  type="button"
                  data-checked={notificationSettings.dailyPromptEnabled}
                  onClick={() =>
                    handleNotifPatch({
                      dailyPromptEnabled: !notificationSettings.dailyPromptEnabled,
                    })
                  }
                  className="ios-switch"
                >
                  <span className="ios-switch-thumb" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium text-white">Weekly Weight Check</div>
                <div className="text-[11px] text-[#86868b]">Once per week</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={notificationSettings.weeklyWeightTime}
                  onChange={(e) => handleNotifPatch({ weeklyWeightTime: e.target.value })}
                  className="bg-black border border-white/12 rounded-lg px-2 py-1 text-[12px] text-white tabular-nums"
                />
                <button
                  type="button"
                  data-checked={notificationSettings.weeklyWeightEnabled}
                  onClick={() =>
                    handleNotifPatch({
                      weeklyWeightEnabled: !notificationSettings.weeklyWeightEnabled,
                    })
                  }
                  className="ios-switch"
                >
                  <span className="ios-switch-thumb" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium text-white">Friend Requests</div>
                <div className="text-[11px] text-[#86868b]">Falls back to Google email</div>
              </div>
              <button
                type="button"
                data-checked={notificationSettings.friendRequestsEnabled}
                onClick={() =>
                  handleNotifPatch({
                    friendRequestsEnabled: !notificationSettings.friendRequestsEnabled,
                  })
                }
                className="ios-switch"
              >
                <span className="ios-switch-thumb" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium text-white">Streak & Month Summaries</div>
              </div>
              <button
                type="button"
                data-checked={notificationSettings.summariesEnabled}
                onClick={() =>
                  handleNotifPatch({
                    summariesEnabled: !notificationSettings.summariesEnabled,
                  })
                }
                className="ios-switch"
              >
                <span className="ios-switch-thumb" />
              </button>
            </div>

            {/* Quiet Hours (FR-43) */}
            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-[13px] font-medium text-white">Quiet Hours</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={notificationSettings.quietHoursStart}
                  onChange={(e) => handleNotifPatch({ quietHoursStart: e.target.value })}
                  className="bg-black border border-white/12 rounded-lg px-2 py-1 text-[12px] text-white tabular-nums"
                />
                <span className="text-[11px] text-[#86868b]">to</span>
                <input
                  type="time"
                  value={notificationSettings.quietHoursEnd}
                  onChange={(e) => handleNotifPatch({ quietHoursEnd: e.target.value })}
                  className="bg-black border border-white/12 rounded-lg px-2 py-1 text-[12px] text-white tabular-nums"
                />
              </div>
            </div>

            {/* Web Push Toggle & Instant Test */}
            <div className="pt-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-medium text-white">Web Push</div>
                <div className="text-[11px] text-[#86868b]">
                  {typeof window !== "undefined" && "Notification" in window
                    ? `Permission: ${Notification.permission}`
                    : "Browser notifications"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {notificationSettings.pushSubscribed && (
                  <button
                    type="button"
                    onClick={async () => {
                      const perm = await requestAppNotificationPermission();
                      if (perm !== "granted") {
                        onToast("Allow notifications in browser settings", "error");
                        return;
                      }
                      await ensureWebPushSubscribed();
                      const pushed = await dispatchServerPush({ action: "test" });
                      const sent = pushed
                        ? true
                        : await showLocalNotification(
                            "Honest Reps",
                            "Reminders and workout alerts are working.",
                            "test-notification"
                          );
                      onToast(sent ? "Test notification sent" : "Blocked by browser settings", sent ? "success" : "error");
                    }}
                    className="px-2.5 py-1 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-[11px] font-medium text-[#10e760] cursor-pointer"
                  >
                    Test
                  </button>
                )}
                <button
                  type="button"
                  data-checked={notificationSettings.pushSubscribed}
                  onClick={async () => {
                    if (!notificationSettings.pushSubscribed) {
                      const perm = await requestAppNotificationPermission();
                      if (perm === "unsupported") {
                        onToast("Browser notifications not supported on this device", "error");
                        return;
                      }
                      if (perm !== "granted") {
                        onToast("Notification permission denied by browser", "error");
                        return;
                      }
                      await ensureWebPushSubscribed();
                      await handleNotifPatch({ pushSubscribed: true });
                      await showLocalNotification(
                        "Honest Reps",
                        "Notifications enabled cleanly.",
                        "enable-notification"
                      );
                      onToast("Notifications enabled");
                    } else {
                      await unsubscribeWebPush();
                      await handleNotifPatch({ pushSubscribed: false });
                      onToast("Notifications paused");
                    }
                  }}
                  className="ios-switch"
                >
                  <span className="ios-switch-thumb" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
