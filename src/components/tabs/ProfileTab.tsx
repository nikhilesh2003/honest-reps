"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
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
  Pencil,
  Check,
  X,
  Image as ImageIcon,
  Download,
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
  apiDeleteWeightLog,
  apiLibraryAction,
  apiLogWeight,
  apiUpdateNotifications,
  apiUpdateProfile,
  apiUpdateWeightLog,
} from "@/lib/client-engine";
import { ActiveStatus, HeightUnit, ThemePreference, WeightUnit } from "@/lib/types";
import {
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
  formatWeight,
  validateUsernameInput,
} from "@/lib/effort";
import {
  isHapticsEnabled,
  setHapticsEnabled,
  triggerHaptic,
} from "@/lib/haptics";
import { computeUserMilestones } from "@/lib/milestones";
import { YearHeatmap } from "../YearHeatmap";
import { MilestoneBadgesCard } from "../ui/MilestoneBadgesCard";
import { BottomSheet } from "../ui/BottomSheet";
import { ShareCardSheet } from "../modals/ShareCardSheet";

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
  const [shareCardOpen, setShareCardOpen] = useState(false);

  // Edit profile form state
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [heightCm, setHeightCm] = useState(String(profile.heightCm));
  const [heightFeet, setHeightFeet] = useState("5");
  const [heightInches, setHeightInches] = useState("10");
  const [activeStatus, setActiveStatus] = useState<ActiveStatus>(profile.activeStatus);
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");
  const [sex, setSex] = useState(profile.sex || "");
  const [goal, setGoal] = useState(profile.goal || "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Log / Edit weight form
  const [newWeight, setNewWeight] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null);
  const [editingWeightVal, setEditingWeightVal] = useState("");

  // Personal library form
  const [newExName, setNewExName] = useState("");
  const [newExGroup, setNewExGroup] = useState("Chest");
  const [newGroupName, setNewGroupName] = useState("");

  const [copyingLog, setCopyingLog] = useState(false);
  const [themePref, setThemePref] = useState<ThemePreference>(() =>
    getStoredThemePreference()
  );
  const [hapticsOn, setHapticsOn] = useState<boolean>(() => isHapticsEnabled());

  const usernameCheck = useMemo(() => validateUsernameInput(username), [username]);

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
        ? "Appearance set to Auto"
        : next === "light"
        ? "Light appearance enabled"
        : "Dark appearance enabled"
    );
  };

  const openEditProfile = () => {
    setName(profile.name);
    setUsername(profile.username);
    setHeightCm(String(profile.heightCm));
    const ftIn = cmToFeetInches(profile.heightCm);
    setHeightFeet(String(ftIn.feet));
    setHeightInches(String(ftIn.inches));
    setActiveStatus(profile.activeStatus);
    setAge(profile.age ? String(profile.age) : "");
    setSex(profile.sex || "");
    setGoal(profile.goal || "");
    setEditProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!usernameCheck.valid) {
      onToast("Username must be 3–24 letters, numbers, or _", "error");
      return;
    }
    setSavingProfile(true);
    try {
      const resolvedHeightCm =
        profile.heightUnit === "ft-in"
          ? feetInchesToCm(Number(heightFeet) || 5, Number(heightInches) || 9)
          : Number(heightCm);

      const data = await apiUpdateProfile({
        name,
        username: usernameCheck.cleaned,
        heightCm: resolvedHeightCm,
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

  const handleSaveEditedWeight = async (id: string) => {
    const num = Number(editingWeightVal);
    if (!num) return;
    const res = await apiUpdateWeightLog(id, num);
    if (res.ok) {
      onToast("Weight entry updated");
      setEditingWeightId(null);
      onRefresh();
    } else {
      onToast(res.error || "Invalid weight", "error");
    }
  };

  const handleDeleteWeight = async (id: string) => {
    const res = await apiDeleteWeightLog(id);
    if (res.ok) {
      onToast("Weight entry removed");
      onRefresh();
    }
  };

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
    <div className="space-y-5 pb-8">
      {/* Calm Profile Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-white leading-tight">
            {profile.name}
          </h1>
          <div className="text-[13px] font-medium text-[#86868b] mt-0.5">
            @{profile.username}
          </div>
        </div>
        <button
          type="button"
          onClick={openEditProfile}
          className="px-4 py-2 rounded-full bg-[#111113] border border-white/[0.06] hover:border-white/15 text-[13px] font-medium text-white cursor-pointer"
        >
          Edit
        </button>
      </div>

      {/* Unified 3-Figure Summary Card */}
      <div className="apple-card grid grid-cols-3 divide-x divide-white/[0.06] py-3.5">
        <div className="text-center px-1">
          <div className="text-[22px] font-semibold text-[#30d158] tabular-nums">
            {monthStats.activeDaysYear}
          </div>
          <div className="text-[11px] font-medium text-[#86868b] mt-0.5">Year Active</div>
        </div>
        <div className="text-center px-1">
          <div className="text-[22px] font-semibold text-[#30d158] tabular-nums">
            {monthStats.currentStreak}
          </div>
          <div className="text-[11px] font-medium text-[#86868b] mt-0.5">Streak</div>
        </div>
        <div className="text-center px-1">
          <div className="text-[22px] font-semibold text-white tabular-nums">
            {monthStats.longestStreak}
          </div>
          <div className="text-[11px] font-medium text-[#86868b] mt-0.5">Longest</div>
        </div>
      </div>

      {/* 365-Day Year Activity Grid */}
      <YearHeatmap
        summaries365={state.summaries365}
        thresholds={state.appSettings.gridThresholds}
      />

      {/* Milestones & Badges */}
      <MilestoneBadgesCard summary={milestonesSummary} />

      {/* Share & Export (Native iOS Inset-Grouped List — all 6 actions preserved!) */}
      <div className="space-y-2">
        <div className="apple-section-label px-1">Share &amp; Export</div>
        <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
          <button
            type="button"
            onClick={() => setShareCardOpen(true)}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3 text-[14px] font-medium text-white">
              <ImageIcon className="w-4 h-4 text-[#30d158]" />
              Summary Card
            </span>
            <span className="flex items-center gap-1 text-[13px] font-medium text-[#30d158]">
              Share
              <ChevronRight className="w-4 h-4 text-[#636366]" />
            </span>
          </button>

          <div className="px-4 py-3 flex items-center justify-between gap-2">
            <span className="flex items-center gap-3 text-[14px] font-medium text-white">
              <MessageCircle className="w-4 h-4 text-[#86868b]" />
              WhatsApp
            </span>
            <div className="flex items-center gap-1.5">
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
                className="px-3 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-white/[0.1] text-[12px] font-medium text-[#30d158] cursor-pointer"
              >
                Progress
              </button>
              <button
                type="button"
                onClick={() =>
                  openWhatsAppShare(buildInviteShareText(profile.name, profile.username))
                }
                className="px-3 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-white/[0.1] text-[12px] font-medium text-white cursor-pointer"
              >
                Invite
              </button>
            </div>
          </div>

          <div className="px-4 py-3 flex items-center justify-between gap-2">
            <span className="flex items-center gap-3 text-[14px] font-medium text-white">
              <Download className="w-4 h-4 text-[#86868b]" />
              <span>
                Export{" "}
                <span className="text-[12px] font-normal text-[#86868b] tabular-nums">
                  ({monthStats.monthPrefix})
                </span>
              </span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={copyingLog}
                onClick={handleCopyMonthLog}
                className="px-2.5 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-white/[0.1] text-[12px] font-medium text-white cursor-pointer"
              >
                {copyingLog ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={() => handleExportMonthLog("csv")}
                className="px-2.5 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-white/[0.1] text-[12px] font-medium text-white cursor-pointer"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => handleExportMonthLog("json")}
                className="px-2.5 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-white/[0.1] text-[12px] font-medium text-[#86868b] hover:text-white cursor-pointer"
              >
                JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences & Body Metrics */}
      <div className="space-y-2">
        <div className="apple-section-label px-1">Preferences</div>
        <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
          <button
            type="button"
            onClick={openEditProfile}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3 text-[14px] font-medium text-white">
              <User className="w-4 h-4 text-[#86868b]" />
              Profile &amp; Metrics
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-[#86868b] tabular-nums">
              {formatHeight(profile.heightCm, profile.heightUnit)} · {profile.activeStatus}
              <ChevronRight className="w-4 h-4 text-[#636366]" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingWeightId(null);
              setWeightSheetOpen(true);
            }}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3 text-[14px] font-medium text-white">
              <Scale className="w-4 h-4 text-[#86868b]" />
              Weight
            </span>
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#30d158] tabular-nums">
              {latestWeight ? formatWeight(latestWeight.weightKg, profile.weightUnit) : "Add"}
              <ChevronRight className="w-4 h-4 text-[#636366]" />
            </span>
          </button>

          {/* Units Selection */}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[14px] font-medium text-white">Units</span>
            <div className="flex items-center gap-2">
              <div className="apple-segmented w-[92px]">
                {(["kg", "lb"] as WeightUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    data-active={profile.weightUnit === u}
                    onClick={() =>
                      handleQuickPatch({ weightUnit: u }, `Weight unit set to ${u}`)
                    }
                    className="apple-segmented-btn h-7"
                  >
                    {u}
                  </button>
                ))}
              </div>
              <div className="apple-segmented w-[112px]">
                {(["cm", "ft-in"] as HeightUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    data-active={profile.heightUnit === u}
                    onClick={() =>
                      handleQuickPatch({ heightUnit: u }, `Height unit set to ${u}`)
                    }
                    className="apple-segmented-btn h-7"
                  >
                    {u === "ft-in" ? "ft/in" : "cm"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[14px] font-medium text-white">Appearance</span>
            <div className="apple-segmented w-[198px]">
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
                  data-active={themePref === id}
                  onClick={() => handleThemeChange(id)}
                  className="apple-segmented-btn h-7"
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Haptic Feedback */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div>
              <div className="text-[14px] font-medium text-white">Haptic Feedback</div>
              <p className="text-[12px] text-[#86868b] mt-0.5">
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

          {/* Privacy Switch */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-white">
                Share Workout Details
              </div>
              <p className="text-[12px] text-[#86868b] mt-0.5 leading-snug">
                Let friends view exercises, sets, and reps on your grid. Bodyweight always stays private.
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
      </div>

      {/* App & Account */}
      <div className="space-y-2">
        <div className="apple-section-label px-1">Account</div>
        <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-3 text-[14px] font-medium text-white">
              <Dumbbell className="w-4 h-4 text-[#86868b]" />
              Exercise Library
            </span>
            <ChevronRight className="w-4 h-4 text-[#636366]" />
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
              {notificationSettings.dailyPromptEnabled
                ? notificationSettings.dailyPromptTime
                : "Off"}
              <ChevronRight className="w-4 h-4 text-[#636366]" />
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
                  ? `${gymLocation.name} · Off`
                  : `${gymLocation.name} · ${gymLocation.radiusMeters}m`}
                <ChevronRight className="w-4 h-4 text-[#636366] shrink-0" />
              </span>
            </button>
          )}

          {state.isAdmin && (
            <Link
              href="/admin"
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <span className="flex items-center gap-3 text-[14px] font-medium text-[#30d158]">
                <Shield className="w-4 h-4" />
                Admin Console
              </span>
              <ChevronRight className="w-4 h-4 text-[#636366]" />
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
            <span className="text-[12px] text-[#636366] truncate max-w-[160px]">
              {profile.email}
            </span>
          </button>
        </div>
      </div>

      <div className="pt-1 text-center text-[11px] text-[#636366]">Ifleon</div>

      <ShareCardSheet
        open={shareCardOpen}
        onClose={() => setShareCardOpen(false)}
        state={state}
        onToast={onToast}
      />

      {/* Edit Profile Sheet (Native iOS Inset-Grouped Rows) */}
      <BottomSheet
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        title="Profile & Metrics"
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06] overflow-hidden">
            <div className="px-4 h-11 flex items-center justify-between gap-3">
              <label className="text-[14px] text-[#86868b] shrink-0">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 bg-transparent text-right text-[14px] font-medium text-white focus:outline-none"
              />
            </div>

            <div className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[14px] text-[#86868b] shrink-0">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 bg-transparent text-right text-[14px] font-medium text-white focus:outline-none"
                />
              </div>
              <div
                className={`text-right text-[11px] mt-0.5 tabular-nums ${
                  usernameCheck.valid ? "text-[#30d158]" : "text-amber-400"
                }`}
              >
                {usernameCheck.hint}
              </div>
            </div>

            <div className="px-4 h-11 flex items-center justify-between gap-3">
              <label className="text-[14px] text-[#86868b] shrink-0">
                Height ({profile.heightUnit === "ft-in" ? "ft / in" : "cm"})
              </label>
              {profile.heightUnit === "cm" ? (
                <input
                  type="number"
                  inputMode="numeric"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="w-24 bg-transparent text-right text-[14px] font-medium text-white tabular-nums focus:outline-none"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={3}
                      max={8}
                      value={heightFeet}
                      onChange={(e) => setHeightFeet(e.target.value)}
                      className="w-10 bg-black/40 rounded-lg h-8 text-center text-[14px] text-white tabular-nums focus:outline-none"
                    />
                    <span className="text-[11px] text-[#86868b]">ft</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={11}
                      value={heightInches}
                      onChange={(e) => setHeightInches(e.target.value)}
                      className="w-10 bg-black/40 rounded-lg h-8 text-center text-[14px] text-white tabular-nums focus:outline-none"
                    />
                    <span className="text-[11px] text-[#86868b]">in</span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 h-11 flex items-center justify-between gap-3">
              <label className="text-[14px] text-[#86868b] shrink-0">Activity</label>
              <select
                value={activeStatus}
                onChange={(e) => setActiveStatus(e.target.value as ActiveStatus)}
                className="bg-transparent text-right text-[14px] text-white focus:outline-none cursor-pointer"
              >
                <option value="Sedentary" className="bg-[#1c1c1e] text-white">
                  Sedentary
                </option>
                <option value="Lightly active" className="bg-[#1c1c1e] text-white">
                  Lightly active
                </option>
                <option value="Moderately active" className="bg-[#1c1c1e] text-white">
                  Moderately active
                </option>
                <option value="Very active" className="bg-[#1c1c1e] text-white">
                  Very active
                </option>
              </select>
            </div>

            <div className="px-4 h-11 flex items-center justify-between gap-3">
              <label className="text-[14px] text-[#86868b] shrink-0">Age</label>
              <input
                type="number"
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Optional"
                className="w-24 bg-transparent text-right text-[14px] text-white placeholder:text-[#636366] tabular-nums focus:outline-none"
              />
            </div>

            <div className="px-4 h-11 flex items-center justify-between gap-3">
              <label className="text-[14px] text-[#86868b] shrink-0">Sex</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="bg-transparent text-right text-[14px] text-white focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-[#1c1c1e] text-white">
                  Prefer not to say
                </option>
                <option value="Male" className="bg-[#1c1c1e] text-white">
                  Male
                </option>
                <option value="Female" className="bg-[#1c1c1e] text-white">
                  Female
                </option>
                <option value="Other" className="bg-[#1c1c1e] text-white">
                  Other
                </option>
              </select>
            </div>

            <div className="px-4 h-11 flex items-center justify-between gap-3">
              <label className="text-[14px] text-[#86868b] shrink-0">Goal</label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Optional"
                className="flex-1 bg-transparent text-right text-[14px] text-white placeholder:text-[#636366] focus:outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={savingProfile}
            onClick={handleSaveProfile}
            className="w-full h-12 rounded-full bg-[#30d158] hover:opacity-90 text-black font-semibold text-[15px] cursor-pointer"
          >
            {savingProfile ? "Saving..." : "Save"}
          </button>
        </div>
      </BottomSheet>

      {/* Log & Manage Weight Sheet */}
      <BottomSheet
        open={weightSheetOpen}
        onClose={() => setWeightSheetOpen(false)}
        title="Body Weight"
        subtitle="Stored privately. Edit or remove entries anytime."
      >
        <div className="space-y-4">
          <div className="px-4 h-12 rounded-2xl bg-[#1c1c1e] flex items-center justify-between gap-2">
            <span className="text-[14px] text-[#86868b]">Today</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
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
                className="w-28 bg-transparent text-right text-white text-[18px] font-semibold placeholder:text-[#636366] tabular-nums focus:outline-none"
              />
              <span className="text-[14px] text-[#86868b] font-medium">
                {profile.weightUnit}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={savingWeight || !newWeight}
            onClick={handleLogWeight}
            className="w-full h-12 rounded-full bg-[#30d158] hover:opacity-90 disabled:opacity-40 text-black font-semibold text-[15px] cursor-pointer"
          >
            {savingWeight ? "Saving..." : "Log Weight"}
          </button>

          {state.weightLogs.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="text-[12px] font-medium text-[#86868b] px-0.5">
                History
              </div>
              <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06] max-h-56 overflow-y-auto no-scrollbar">
                {[...state.weightLogs]
                  .reverse()
                  .slice(0, 12)
                  .map((w) => {
                    const isEditing = editingWeightId === w.id;
                    const displayVal =
                      profile.weightUnit === "lb"
                        ? Number((w.weightKg * 2.20462).toFixed(1))
                        : Number(w.weightKg.toFixed(1));
                    return (
                      <div
                        key={w.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-2 text-[13px]"
                      >
                        <span className="text-[#86868b] tabular-nums">{w.date}</span>
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.1"
                              value={editingWeightVal}
                              onChange={(e) => setEditingWeightVal(e.target.value)}
                              className="w-20 h-8 px-2 rounded-lg bg-black/50 text-white text-[13px] tabular-nums focus:outline-none"
                            />
                            <button
                              type="button"
                              aria-label="Save weight edit"
                              onClick={() => handleSaveEditedWeight(w.id)}
                              className="w-7 h-7 rounded-full bg-[#30d158] text-black flex items-center justify-center cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel weight edit"
                              onClick={() => setEditingWeightId(null)}
                              className="w-7 h-7 rounded-full bg-white/[0.08] text-white flex items-center justify-center cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-white font-medium tabular-nums mr-1.5">
                              {formatWeight(w.weightKg, profile.weightUnit)}
                            </span>
                            <button
                              type="button"
                              aria-label={`Edit weight on ${w.date}`}
                              onClick={() => {
                                setEditingWeightId(w.id);
                                setEditingWeightVal(String(displayVal));
                              }}
                              className="w-7 h-7 rounded-full text-[#636366] hover:text-white flex items-center justify-center cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete weight on ${w.date}`}
                              onClick={() => handleDeleteWeight(w.id)}
                              className="w-7 h-7 rounded-full text-[#636366] hover:text-red-400 flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Personal Exercises & Muscle Groups Manager Sheet */}
      <BottomSheet
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        title="Exercise Library"
        subtitle="Add custom exercises or hide defaults."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-[12px] font-medium text-[#86868b] px-0.5">
              Custom Exercise
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                placeholder="Exercise name"
                className="apple-input flex-1 h-10 px-3.5 text-[13px]"
              />
              <select
                value={newExGroup}
                onChange={(e) => setNewExGroup(e.target.value)}
                className="apple-input h-10 px-2.5 text-[12px]"
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
                className="w-10 h-10 rounded-full bg-[#30d158] text-black flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[12px] font-medium text-[#86868b] px-0.5">
              Custom Muscle Group
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Forearms, Mobility"
                className="apple-input flex-1 h-10 px-3.5 text-[13px]"
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
                className="w-10 h-10 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-white flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {personalExercises.length > 0 && (
            <div className="space-y-2">
              <div className="text-[12px] font-medium text-[#86868b] px-0.5">
                Your Exercises
              </div>
              <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06] overflow-hidden">
                {personalExercises.map((ex) => (
                  <div
                    key={ex.id}
                    className="px-4 py-2.5 flex items-center justify-between text-[13px]"
                  >
                    <div>
                      <span className="text-white font-medium">{ex.name}</span>
                      <span className="text-[#86868b] text-[11px] ml-2">
                        {ex.muscleGroup}
                      </span>
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
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[12px] font-medium text-[#86868b] px-0.5">
              Defaults
            </div>
            <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06] max-h-56 overflow-y-auto no-scrollbar">
              {defaultExercises.map((ex) => {
                const isHidden = hiddenSet.has(ex.id);
                return (
                  <div
                    key={ex.id}
                    className="px-4 py-2.5 flex items-center justify-between text-[13px]"
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

      {/* Notifications Settings Sheet */}
      <BottomSheet
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title="Notifications"
        subtitle="Reminders pause automatically on Rest days."
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-[#1c1c1e] flex items-start gap-2.5 text-[12px] text-[#86868b]">
            <Smartphone className="w-4 h-4 text-[#30d158] shrink-0 mt-0.5" />
            <span>
              On iPhone, add Honest Reps to your Home Screen in Safari to enable push notifications.
            </span>
          </div>

          <div className="rounded-2xl bg-[#1c1c1e] divide-y divide-white/[0.06] overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium text-white">Daily Prompt</div>
                <div className="text-[11px] text-[#86868b]">Paused on Rest days</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={notificationSettings.dailyPromptTime}
                  onChange={(e) => handleNotifPatch({ dailyPromptTime: e.target.value })}
                  className="bg-black/40 rounded-lg px-2 py-1 text-[12px] text-white tabular-nums focus:outline-none"
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

            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium text-white">Weekly Weight</div>
                <div className="text-[11px] text-[#86868b]">Once per week</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={notificationSettings.weeklyWeightTime}
                  onChange={(e) => handleNotifPatch({ weeklyWeightTime: e.target.value })}
                  className="bg-black/40 rounded-lg px-2 py-1 text-[12px] text-white tabular-nums focus:outline-none"
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

            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium text-white">Friend Requests</div>
                <div className="text-[11px] text-[#86868b]">Email fallback</div>
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

            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="text-[14px] font-medium text-white">
                Streak &amp; Month Summaries
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

            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[14px] font-medium text-white">Quiet Hours</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={notificationSettings.quietHoursStart}
                  onChange={(e) => handleNotifPatch({ quietHoursStart: e.target.value })}
                  className="bg-black/40 rounded-lg px-2 py-1 text-[12px] text-white tabular-nums focus:outline-none"
                />
                <span className="text-[11px] text-[#86868b]">to</span>
                <input
                  type="time"
                  value={notificationSettings.quietHoursEnd}
                  onChange={(e) => handleNotifPatch({ quietHoursEnd: e.target.value })}
                  className="bg-black/40 rounded-lg px-2 py-1 text-[12px] text-white tabular-nums focus:outline-none"
                />
              </div>
            </div>

            <div className="px-4 py-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-[14px] font-medium text-white">Web Push</div>
                <div className="text-[11px] text-[#86868b]">
                  {typeof window !== "undefined" && "Notification" in window
                    ? `Permission: ${Notification.permission}`
                    : "Browser alerts"}
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
                      onToast(
                        sent ? "Test notification sent" : "Blocked by browser settings",
                        sent ? "success" : "error"
                      );
                    }}
                    className="px-2.5 py-1 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[11px] font-medium text-[#30d158] cursor-pointer"
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
                        "Notifications enabled.",
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
