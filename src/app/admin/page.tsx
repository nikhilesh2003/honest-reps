"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  LayoutDashboard,
  Users,
  Dumbbell,
  Cpu,
  Sliders,
  Flag,
  Megaphone,
  ShieldCheck,
  FileText,
  Activity,
  Plus,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { computeEffortScoreFromRatio } from "@/lib/effort";
import { apiAdminAction, apiBuildExport, apiGetAdmin } from "@/lib/client-engine";
import {
  requestAppNotificationPermission,
  showLocalNotification,
} from "@/lib/notifications";
import { Toast, ToastMessage } from "@/components/ui/Toast";

type AdminSection =
  | "dashboard"
  | "users"
  | "library"
  | "ai"
  | "scoring"
  | "moderation"
  | "announcements"
  | "admins"
  | "audit"
  | "health";

interface AdminPayload {
  dashboard: {
    totalUsers: number;
    dau: number;
    mau: number;
    newSignupsThisMonth: number;
    logsToday: number;
    aiCallsTotal: number;
    aiFailuresCount: number;
    aiCostTodayUsd: number;
  };
  users: Array<{
    userId: string;
    name: string;
    username: string;
    email: string;
    suspended: boolean;
    onboardingComplete: boolean;
    isAdmin: boolean;
    logCount: number;
    createdAt: string;
  }>;
  defaultMuscleGroups: Array<{ id: string; name: string; enabled: boolean }>;
  defaultExercises: Array<{ id: string; name: string; muscleGroup: string; enabled: boolean }>;
  aiConfig: {
    provider: "gemini" | "openrouter";
    model: string;
    rateLimitPerDay: number;
    maxImageSizeMb: number;
    geminiKeyConfigured: boolean;
    openRouterKeyConfigured: boolean;
  };
  recentAiLogs: Array<{
    id: string;
    provider: string;
    model: string;
    inputType: string;
    success: boolean;
    errorMessage?: string;
    estimatedCostUsd: number;
    timestamp: string;
  }>;
  scoringSettings: {
    version: number;
    aboveUsualSlope: number;
    belowUsualRoot: number;
    backfillWindowDays: number;
    gridThresholds: {
      veryLowMax: number;
      lowMax: number;
      steadyMax: number;
      highMax: number;
    };
    updatedAt: string;
  };
  friendReports: Array<{
    id: string;
    reporterUsername: string;
    reportedUserId: string;
    reportedUsername: string;
    reason: string;
    status: "open" | "resolved";
    createdAt: string;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    target?: string;
    sentBy: string;
    sentAt: string;
  }>;
  notificationTemplates: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    enabled?: boolean;
  }>;
  adminEmails: Array<{ email: string; addedBy: string; addedAt: string }>;
  auditLog: Array<{
    id: string;
    adminEmail: string;
    action: string;
    target: string;
    timestamp: string;
  }>;
  systemHealth: {
    supabase: {
      configured: boolean;
      reachable: boolean;
      schemaReady: boolean;
      projectUrl: string | null;
      jwksVerified: boolean;
      note: string;
    };
    pushDeliveryRate: string;
    emailFallbackStatus: string;
    apiLatencyMs: number;
    storageEngine: string;
  };
}

export default function AdminPage() {
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [data, setData] = useState<AdminPayload | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [userSearch, setUserSearch] = useState("");

  // Library form
  const [newExName, setNewExName] = useState("");
  const [newExGroup, setNewExGroup] = useState("Chest");
  const [newMgName, setNewMgName] = useState("");

  // AI form
  const [aiProvider, setAiProvider] = useState<"gemini" | "openrouter">("gemini");
  const [aiModel, setAiModel] = useState("gemini-2.5-flash");
  const [aiRateLimit, setAiRateLimit] = useState("30");
  const [aiMaxMb, setAiMaxMb] = useState("5");

  // Scoring form (FR-54)
  const [slope, setSlope] = useState("12.5");
  const [root, setRoot] = useState("4");
  const [backfillDays, setBackfillDays] = useState("2");
  const [tVeryLow, setTVeryLow] = useState("24");
  const [tLow, setTLow] = useState("44");
  const [tSteady, setTSteady] = useState("55");
  const [tHigh, setTHigh] = useState("75");
  const [simRatio, setSimRatio] = useState("1.25");

  // Announcements / Notifications & Admins
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annTarget, setAnnTarget] = useState("all");
  const [annCustomUser, setAnnCustomUser] = useState("");
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [tplTitle, setTplTitle] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");

  const showToast = useCallback((text: string, tone: "success" | "error" = "success") => {
    const id = Date.now();
    setToast({ id, text, tone });
    setTimeout(() => setToast((c) => (c?.id === id ? null : c)), 2800);
  }, []);

  const loadAdmin = useCallback(async () => {
    const res = await apiGetAdmin();
    if (res.forbidden || !res.payload) {
      setForbidden(true);
      return;
    }
    const payload = res.payload as AdminPayload;
    setData(payload);
    setAiProvider(payload.aiConfig.provider);
    setAiModel(payload.aiConfig.model);
    setAiRateLimit(String(payload.aiConfig.rateLimitPerDay));
    setAiMaxMb(String(payload.aiConfig.maxImageSizeMb));
    setSlope(String(payload.scoringSettings.aboveUsualSlope));
    setRoot(String(payload.scoringSettings.belowUsualRoot));
    setBackfillDays(String(payload.scoringSettings.backfillWindowDays));
    setTVeryLow(String(payload.scoringSettings.gridThresholds.veryLowMax));
    setTLow(String(payload.scoringSettings.gridThresholds.lowMax));
    setTSteady(String(payload.scoringSettings.gridThresholds.steadyMax));
    setTHigh(String(payload.scoringSettings.gridThresholds.highMax));
  }, []);

  useEffect(() => {
    loadAdmin();
  }, [loadAdmin]);

  const runAction = async (payload: Record<string, unknown>, okMsg: string) => {
    const out = await apiAdminAction(payload);
    if (!out.ok) {
      showToast(out.error || "Action failed", "error");
      return;
    }
    showToast(okMsg);
    loadAdmin();
  };

  const triggerAdminExport = (format: "csv" | "json") => {
    const exp = apiBuildExport(format);
    const blob = new Blob([exp.content], { type: exp.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exp.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${format.toUpperCase()}`);
  };

  if (forbidden) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="apple-card p-6 max-w-sm w-full text-center space-y-4">
          <h1 className="text-[20px] font-semibold text-white">Admin Access Required</h1>
          <p className="text-[13px] text-[#86868b]">
            Your Google email is not on the admin email list.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center w-full h-11 rounded-full bg-white text-black font-semibold text-[14px]"
          >
            Back to App
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <span className="text-[13px] text-[#86868b]">Loading Admin...</span>
      </div>
    );
  }

  const navItems: Array<{ id: AdminSection; label: string; icon: typeof LayoutDashboard }> = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users },
    { id: "library", label: "Library", icon: Dumbbell },
    { id: "ai", label: "AI & Usage", icon: Cpu },
    { id: "scoring", label: "Scoring", icon: Sliders },
    { id: "moderation", label: "Moderation", icon: Flag },
    { id: "announcements", label: "Notifications", icon: Megaphone },
    { id: "admins", label: "Admins", icon: ShieldCheck },
    { id: "audit", label: "Audit Log", icon: FileText },
    { id: "health", label: "Health & Export", icon: Activity },
  ];

  const simScore = computeEffortScoreFromRatio(Number(simRatio) || 1, 1, {
    aboveUsualSlope: Number(slope) || 12.5,
    belowUsualRoot: Number(root) || 4,
  });

  const filteredUsers = data.users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-black text-[#f5f5f7]">
      <Toast toast={toast} />

      {/* Top Admin Bar */}
      <header className="sticky top-0 z-30 bg-black/80 backdrop-blur-2xl border-b border-white/[0.05] pt-safe">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="brand-icon-box w-8 h-8 rounded-[9px] p-1 flex items-center justify-center shrink-0">
              <img
                src="/icons/logo-icon.png"
                alt="Honest Reps"
                className="w-full h-full object-contain"
              />
            </span>
            <span className="text-[16px] font-semibold tracking-[-0.02em] text-white">
              Admin
            </span>
          </div>

          <Link
            href="/"
            className="px-3.5 py-1.5 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-[12px] font-medium text-white flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Member App
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        {/* macOS Settings-style Sidebar / Mobile Pill Rail */}
        <aside className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar pb-1 lg:pb-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all cursor-pointer ${
                  active
                    ? "bg-[#1c1c1e] text-white font-semibold ring-1 ring-[#30d158]/35 shadow-[0_0_18px_rgba(48,209,88,0.18)]"
                    : "text-[#86868b] hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? "text-[#30d158]" : "text-[#86868b]"
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Active Panel */}
        <section className="space-y-5 min-w-0">
          {/* 1. DASHBOARD */}
          {section === "dashboard" && (
            <div className="space-y-4">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
                Overview
              </h1>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Total Users", data.dashboard.totalUsers],
                  ["DAU", data.dashboard.dau],
                  ["MAU", data.dashboard.mau],
                  ["Logs Today", data.dashboard.logsToday],
                  ["New Signups", data.dashboard.newSignupsThisMonth],
                  ["AI Calls", data.dashboard.aiCallsTotal],
                  ["AI Failures", data.dashboard.aiFailuresCount],
                  ["AI Cost Today", `$${data.dashboard.aiCostTodayUsd.toFixed(4)}`],
                ].map(([label, val]) => (
                  <div key={String(label)} className="apple-card p-4">
                    <div className="text-[12px] text-[#86868b] font-medium">
                      {label}
                    </div>
                    <div className="text-[26px] font-semibold text-white tabular-nums mt-1">
                      {val}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. USERS */}
          {section === "users" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
                  Users
                </h1>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="apple-input h-10 px-3.5 text-[13px] w-full sm:w-64"
                />
              </div>
              <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
                {filteredUsers.map((u) => (
                  <div
                    key={u.userId}
                    className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-white">
                          {u.name}
                        </span>
                        <span className="text-[12px] text-[#86868b]">@{u.username}</span>
                        {u.isAdmin && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#30d158]/15 text-[#30d158] font-medium">
                            Admin
                          </span>
                        )}
                        {u.suspended && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
                            Suspended
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#86868b] mt-0.5 tabular-nums">
                        {u.email} · {u.logCount} logs
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            { action: "toggle-suspend-user", userId: u.userId },
                            u.suspended
                              ? `Reactivated @${u.username}`
                              : `Suspended @${u.username}`
                          )
                        }
                        className="px-3 h-8 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-[12px] font-medium text-white cursor-pointer"
                      >
                        {u.suspended ? "Reactivate" : "Suspend"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            { action: "delete-user", userId: u.userId },
                            `Deleted @${u.username}`
                          )
                        }
                        className="w-8 h-8 rounded-full bg-[#1c1c1e] hover:bg-red-500/20 text-[#86868b] hover:text-red-400 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. DEFAULT EXERCISE LIBRARY */}
          {section === "library" && (
            <div className="space-y-4">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
                Default Library
              </h1>

              <div className="apple-card p-4 space-y-3">
                <div className="apple-section-label">Add Exercise</div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={newExName}
                    onChange={(e) => setNewExName(e.target.value)}
                    placeholder="Exercise name"
                    className="apple-input flex-1 min-w-[160px] h-10 px-3.5 text-[13px]"
                  />
                  <select
                    value={newExGroup}
                    onChange={(e) => setNewExGroup(e.target.value)}
                    className="apple-input h-10 px-3 text-[13px]"
                  >
                    {data.defaultMuscleGroups.map((mg) => (
                      <option key={mg.id} value={mg.name}>
                        {mg.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newExName.trim()) return;
                      runAction(
                        {
                          action: "add-default-exercise",
                          name: newExName,
                          muscleGroup: newExGroup,
                        },
                        `Added ${newExName}`
                      );
                      setNewExName("");
                    }}
                    className="px-4 h-10 rounded-full bg-[#30d158] text-black text-[13px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>

                <div className="flex gap-2 pt-3 border-t border-white/[0.06]">
                  <input
                    type="text"
                    value={newMgName}
                    onChange={(e) => setNewMgName(e.target.value)}
                    placeholder="Add shared muscle group"
                    className="apple-input flex-1 h-10 px-3.5 text-[13px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newMgName.trim()) return;
                      runAction(
                        { action: "add-default-muscle-group", name: newMgName },
                        `Added group ${newMgName}`
                      );
                      setNewMgName("");
                    }}
                    className="px-4 h-10 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-white text-[13px] font-medium cursor-pointer"
                  >
                    Add Group
                  </button>
                </div>
              </div>

              <div className="apple-card divide-y divide-white/[0.06] max-h-[420px] overflow-y-auto no-scrollbar">
                {data.defaultExercises.map((ex) => (
                  <div key={ex.id} className="px-4 py-3 flex items-center justify-between">
                    <div className={ex.enabled ? "" : "opacity-40 line-through"}>
                      <span className="text-[14px] font-medium text-white">{ex.name}</span>
                      <span className="text-[12px] text-[#86868b] ml-2">
                        {ex.muscleGroup}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          { action: "toggle-default-exercise", id: ex.id },
                          ex.enabled ? `Disabled ${ex.name}` : `Enabled ${ex.name}`
                        )
                      }
                      className="px-3 h-8 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-[12px] font-medium text-white cursor-pointer"
                    >
                      {ex.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. AI SETTINGS & USAGE */}
          {section === "ai" && (
            <div className="space-y-4">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
                AI Settings
              </h1>
              <div className="apple-card p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">Provider</label>
                    <select
                      value={aiProvider}
                      onChange={(e) =>
                        setAiProvider(e.target.value as "gemini" | "openrouter")
                      }
                      className="apple-input w-full h-10 px-3 text-[13px]"
                    >
                      <option value="gemini">Gemini (Primary)</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">Model</label>
                    <input
                      type="text"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      className="apple-input w-full h-10 px-3.5 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">
                      Daily Limit / User
                    </label>
                    <input
                      type="number"
                      value={aiRateLimit}
                      onChange={(e) => setAiRateLimit(e.target.value)}
                      className="apple-input w-full h-10 px-3.5 text-[13px] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">
                      Max Image (MB)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={aiMaxMb}
                      onChange={(e) => setAiMaxMb(e.target.value)}
                      className="apple-input w-full h-10 px-3.5 text-[13px] tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[12px] text-[#86868b] pt-3 border-t border-white/[0.06]">
                  <span>
                    Keys: Gemini ({data.aiConfig.geminiKeyConfigured ? "Set" : "Unset"}) ·
                    OpenRouter ({data.aiConfig.openRouterKeyConfigured ? "Set" : "Unset"})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      runAction(
                        {
                          action: "update-ai-settings",
                          provider: aiProvider,
                          model: aiModel,
                          rateLimitPerDay: Number(aiRateLimit),
                          maxImageSizeMb: Number(aiMaxMb),
                        },
                        "AI settings saved"
                      )
                    }
                    className="px-4 h-9 rounded-full bg-[#30d158] text-black font-semibold text-[13px] cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="apple-card p-4 space-y-2.5">
                <div className="apple-section-label">Recent AI Calls</div>
                <div className="divide-y divide-white/[0.06]">
                  {data.recentAiLogs.map((log) => (
                    <div
                      key={log.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-[12px]"
                    >
                      <div>
                        <span
                          className={
                            log.success
                              ? "text-white font-medium"
                              : "text-amber-400 font-medium"
                          }
                        >
                          {log.provider}/{log.model} ({log.inputType})
                        </span>
                        {log.errorMessage && (
                          <div className="text-[#86868b] mt-0.5">{log.errorMessage}</div>
                        )}
                      </div>
                      <span className="text-[#86868b] tabular-nums shrink-0">
                        ${log.estimatedCostUsd.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 5. EFFORT SCORING */}
          {section === "scoring" && (
            <div className="space-y-4">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
                Effort Scoring
              </h1>

              <div className="p-3.5 rounded-2xl bg-amber-500/10 flex items-start gap-2.5 text-[12px] text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Changes apply to future logs only. Past effort history is never rewritten
                  (v{data.scoringSettings.version}).
                </span>
              </div>

              <div className="apple-card p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">
                      Above-Usual Slope (12.5)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={slope}
                      onChange={(e) => setSlope(e.target.value)}
                      className="apple-input w-full h-10 px-3.5 tabular-nums text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">
                      Below-Usual Root (4)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={root}
                      onChange={(e) => setRoot(e.target.value)}
                      className="apple-input w-full h-10 px-3.5 tabular-nums text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">
                      Backfill Window (days)
                    </label>
                    <input
                      type="number"
                      value={backfillDays}
                      onChange={(e) => setBackfillDays(e.target.value)}
                      className="apple-input w-full h-10 px-3.5 tabular-nums text-[13px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/[0.06]">
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">
                      Very Low Max
                    </label>
                    <input
                      type="number"
                      value={tVeryLow}
                      onChange={(e) => setTVeryLow(e.target.value)}
                      className="apple-input w-full h-10 px-3.5 tabular-nums text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">Low Max</label>
                    <input
                      type="number"
                      value={tLow}
                      onChange={(e) => setTLow(e.target.value)}
                      className="apple-input w-full h-10 px-3.5 tabular-nums text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">
                      Steady Max
                    </label>
                    <input
                      type="number"
                      value={tSteady}
                      onChange={(e) => setTSteady(e.target.value)}
                      className="apple-input w-full h-10 px-3.5 tabular-nums text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">High Max</label>
                    <input
                      type="number"
                      value={tHigh}
                      onChange={(e) => setTHigh(e.target.value)}
                      className="apple-input w-full h-10 px-3.5 tabular-nums text-[13px]"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#1c1c1e] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] text-[#86868b]">Ratio (today / usual)</span>
                    <input
                      type="number"
                      step="0.25"
                      value={simRatio}
                      onChange={(e) => setSimRatio(e.target.value)}
                      className="w-20 h-9 px-2.5 rounded-lg bg-black/40 text-white tabular-nums text-[13px] focus:outline-none"
                    />
                  </div>
                  <div className="text-[14px] text-white tabular-nums">
                    Score: <strong className="text-[#30d158] text-[18px]">{simScore}</strong>{" "}
                    / 100
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    runAction(
                      {
                        action: "update-scoring-settings",
                        aboveUsualSlope: Number(slope),
                        belowUsualRoot: Number(root),
                        backfillWindowDays: Number(backfillDays),
                        gridThresholds: {
                          veryLowMax: Number(tVeryLow),
                          lowMax: Number(tLow),
                          steadyMax: Number(tSteady),
                          highMax: Number(tHigh),
                        },
                      },
                      "Saved scoring settings for future logs"
                    )
                  }
                  className="px-5 h-10 rounded-full bg-[#30d158] text-black font-semibold text-[13px] cursor-pointer"
                >
                  Save for Future Logs
                </button>
              </div>
            </div>
          )}

          {/* 6. FRIEND MODERATION */}
          {section === "moderation" && (
            <div className="space-y-4">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
                Moderation
              </h1>
              <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
                {data.friendReports.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-[14px] font-medium text-white">
                        @{rep.reportedUsername} reported by @{rep.reporterUsername}
                      </div>
                      <div className="text-[12px] text-[#86868b] mt-0.5">{rep.reason}</div>
                    </div>
                    {rep.status === "resolved" ? (
                      <span className="text-[12px] text-[#30d158] font-medium">
                        Resolved
                      </span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            runAction(
                              {
                                action: "resolve-report",
                                reportId: rep.id,
                                removeFriendLinks: true,
                              },
                              `Removed friend links for @${rep.reportedUsername}`
                            )
                          }
                          className="px-3.5 h-8 rounded-full bg-red-500/20 text-red-300 text-[12px] font-medium cursor-pointer"
                        >
                          Remove Links
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            runAction(
                              {
                                action: "resolve-report",
                                reportId: rep.id,
                                removeFriendLinks: false,
                              },
                              "Report dismissed"
                            )
                          }
                          className="px-3.5 h-8 rounded-full bg-[#1c1c1e] text-white text-[12px] cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7. NOTIFICATIONS & BROADCASTS */}
          {section === "announcements" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
                  Notifications
                </h1>
                <p className="text-[13px] text-[#86868b] mt-0.5">
                  Send targeted broadcasts and configure automated alert templates.
                </p>
              </div>

              <div className="apple-card p-4 space-y-3.5">
                <div className="apple-section-label">Send Broadcast</div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    {
                      label: "Calibration Nudge",
                      target: "calibrating",
                      title: "Unlock your personal 50 = usual baseline",
                      body: "Your Day-1 Estimated Effort is live. Log 2 more sessions to calibrate against your own history.",
                    },
                    {
                      label: "3-Day Streak Grace",
                      target: "inactive_2d",
                      title: "Your streak is still protected for 3 days",
                      body: "Log a quick session or mark Rest today to keep your active streak going without breaking.",
                    },
                    {
                      label: "Leaderboard Update",
                      target: "active_streak",
                      title: "This month's Effort Leaderboard is live",
                      body: "Open Friends to check your current Effort rank and active days against your crew.",
                    },
                    {
                      label: "Friend Activity",
                      target: "all",
                      title: "Compare honest effort with friends",
                      body: "Invite a gym partner by @username to compare daily effort scores and streaks fairly.",
                    },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setAnnTarget(p.target);
                        setAnnTitle(p.title);
                        setAnnBody(p.body);
                      }}
                      className="px-3 py-1 rounded-full bg-[#1c1c1e] hover:bg-white/[0.1] text-[12px] font-medium text-[#d1d1d6] cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[12px] text-[#86868b] mb-1">
                      Audience
                    </label>
                    <select
                      value={annTarget}
                      onChange={(e) => setAnnTarget(e.target.value)}
                      className="apple-input w-full h-10 px-3 text-[13px]"
                    >
                      <option value="all">All Members ({data.users.length})</option>
                      <option value="calibrating">Calibrating Members</option>
                      <option value="inactive_2d">Unlogged Today / Grace Window</option>
                      <option value="active_streak">Active Streak Members</option>
                      <option value="specific">Specific Member (@username)</option>
                    </select>
                  </div>

                  {annTarget === "specific" && (
                    <div>
                      <label className="block text-[12px] text-[#86868b] mb-1">
                        Member @username
                      </label>
                      <input
                        type="text"
                        value={annCustomUser}
                        onChange={(e) => setAnnCustomUser(e.target.value)}
                        placeholder="@hari"
                        className="apple-input w-full h-10 px-3.5 text-[13px]"
                      />
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="Notification title"
                  className="apple-input w-full h-10 px-3.5 text-[13px]"
                />
                <textarea
                  rows={2}
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  placeholder="Notification message"
                  className="apple-input w-full p-3.5 text-[13px] resize-none"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!annTitle.trim() || !annBody.trim()) return;
                    const resolvedTarget =
                      annTarget === "specific"
                        ? `@${annCustomUser.trim().replace(/^@/, "") || "all"}`
                        : annTarget;
                    const t = annTitle.trim();
                    const b = annBody.trim();
                    const perm = await requestAppNotificationPermission();
                    const out = await apiAdminAction({
                      action: "send-announcement",
                      title: t,
                      body: b,
                      target: resolvedTarget,
                    });
                    if (!out.ok) {
                      showToast(out.error || "Action failed", "error");
                      return;
                    }
                    showToast(`Notification sent to ${resolvedTarget}`);
                    setAnnTitle("");
                    setAnnBody("");
                    loadAdmin();
                    if (perm === "granted") {
                      const annId =
                        (out as { announcement?: { id?: string } }).announcement?.id ||
                        String(Date.now());
                      await showLocalNotification(
                        `Honest Reps · ${t}`,
                        b,
                        `admin-ann-${annId}`
                      );
                    }
                  }}
                  className="px-5 h-10 rounded-full bg-[#30d158] text-black font-semibold text-[13px] cursor-pointer"
                >
                  Send Notification
                </button>
              </div>

              {data.announcements.length > 0 && (
                <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
                  <div className="px-4 py-3 apple-section-label">
                    Sent ({data.announcements.length})
                  </div>
                  {data.announcements.map((a) => (
                    <div
                      key={a.id}
                      className="p-4 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-semibold text-white">
                            {a.title}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#30d158]/15 text-[#30d158]">
                            {a.target || "all"}
                          </span>
                        </div>
                        <div className="text-[12px] text-[#86868b] mt-1">{a.body}</div>
                        <div className="text-[11px] text-[#636366] mt-1 tabular-nums">
                          {a.sentBy} · {a.sentAt.slice(0, 16).replace("T", " ")}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            { action: "delete-announcement", id: a.id },
                            "Notification removed"
                          )
                        }
                        className="text-[#86868b] hover:text-red-400 p-1 cursor-pointer"
                        title="Delete notification"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
                <div className="px-4 py-3 apple-section-label">Automated Templates</div>
                {data.notificationTemplates.map((tpl) => {
                  const isEditing = editingTplId === tpl.id;
                  const isEnabled = tpl.enabled !== false;
                  return (
                    <div key={tpl.id} className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] text-[#30d158] font-medium capitalize">
                          {tpl.type.replace(/_/g, " ")}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditing) {
                                setEditingTplId(null);
                              } else {
                                setEditingTplId(tpl.id);
                                setTplTitle(tpl.title);
                                setTplBody(tpl.body);
                              }
                            }}
                            className="px-3 py-1 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-[11px] font-medium text-white cursor-pointer"
                          >
                            {isEditing ? "Cancel" : "Edit"}
                          </button>
                          <button
                            type="button"
                            data-checked={isEnabled}
                            onClick={() =>
                              runAction(
                                {
                                  action: "update-notification-template",
                                  id: tpl.id,
                                  enabled: !isEnabled,
                                },
                                `${tpl.type.replace(/_/g, " ")} ${
                                  !isEnabled ? "enabled" : "paused"
                                }`
                              )
                            }
                            className="ios-switch"
                          >
                            <span className="ios-switch-thumb" />
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2 pt-1">
                          <input
                            type="text"
                            value={tplTitle}
                            onChange={(e) => setTplTitle(e.target.value)}
                            className="apple-input w-full h-9 px-3 text-[13px]"
                          />
                          <textarea
                            rows={2}
                            value={tplBody}
                            onChange={(e) => setTplBody(e.target.value)}
                            className="apple-input w-full p-2.5 text-[12px] resize-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              runAction(
                                {
                                  action: "update-notification-template",
                                  id: tpl.id,
                                  title: tplTitle,
                                  body: tplBody,
                                },
                                "Template updated"
                              );
                              setEditingTplId(null);
                            }}
                            className="px-4 h-8 rounded-full bg-[#30d158] text-black font-semibold text-[12px] cursor-pointer"
                          >
                            Save Template
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="text-[14px] font-medium text-white">
                            {tpl.title}
                          </div>
                          <div className="text-[12px] text-[#86868b] mt-0.5">
                            {tpl.body}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 8. ADMIN EMAILS */}
          {section === "admins" && (
            <div className="space-y-4">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
                Admin Emails
              </h1>
              <div className="apple-card p-4 flex gap-2">
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  className="apple-input flex-1 h-10 px-3.5 text-[13px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newAdminEmail.trim()) return;
                    runAction(
                      { action: "add-admin-email", email: newAdminEmail },
                      `Added ${newAdminEmail}`
                    );
                    setNewAdminEmail("");
                  }}
                  className="px-4 h-10 rounded-full bg-[#30d158] text-black font-semibold text-[13px] cursor-pointer"
                >
                  Add
                </button>
              </div>

              <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
                {data.adminEmails.map((a) => (
                  <div key={a.email} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-[14px] font-medium text-white">{a.email}</div>
                      <div className="text-[11px] text-[#86868b]">Added by {a.addedBy}</div>
                    </div>
                    <button
                      type="button"
                      disabled={data.adminEmails.length <= 1}
                      onClick={() =>
                        runAction(
                          { action: "remove-admin-email", email: a.email },
                          `Removed ${a.email}`
                        )
                      }
                      className="px-3.5 h-8 rounded-full bg-[#1c1c1e] disabled:opacity-30 text-[12px] text-white cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 9. AUDIT LOG */}
          {section === "audit" && (
            <div className="space-y-4">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
                Audit Log
              </h1>
              <div className="apple-card divide-y divide-white/[0.06] overflow-hidden">
                {data.auditLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-2 text-[13px]"
                  >
                    <div>
                      <span className="text-white font-medium">{entry.action}</span>
                      <span className="text-[#86868b] ml-2">({entry.target})</span>
                      <div className="text-[11px] text-[#636366] mt-0.5">
                        {entry.adminEmail}
                      </div>
                    </div>
                    <span className="text-[11px] text-[#86868b] tabular-nums">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 10. EXPORT & SYSTEM HEALTH */}
          {section === "health" && (
            <div className="space-y-4">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-white">
                System Health &amp; Export
              </h1>

              <div className="apple-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-white">
                    Supabase Connection
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                      data.systemHealth.supabase.reachable
                        ? "text-[#30d158]"
                        : "text-amber-400"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {data.systemHealth.supabase.schemaReady
                      ? "Postgres Active"
                      : data.systemHealth.supabase.reachable
                      ? "Connected (Schema Pending)"
                      : "Local Mode"}
                  </span>
                </div>
                <div className="text-[12px] text-[#86868b] space-y-1">
                  <div>
                    Project: {data.systemHealth.supabase.projectUrl || "Not configured"}
                  </div>
                  <div>
                    JWKS: {data.systemHealth.supabase.jwksVerified ? "Verified" : "Unverified"}
                  </div>
                  <div>{data.systemHealth.supabase.note}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="apple-card p-4">
                  <div className="text-[12px] text-[#86868b] font-medium">
                    Push Delivery
                  </div>
                  <div className="text-[22px] font-semibold text-[#30d158] tabular-nums mt-1">
                    {data.systemHealth.pushDeliveryRate}
                  </div>
                </div>
                <div className="apple-card p-4">
                  <div className="text-[12px] text-[#86868b] font-medium">
                    Email Fallback
                  </div>
                  <div className="text-[22px] font-semibold text-white mt-1">
                    {data.systemHealth.emailFallbackStatus}
                  </div>
                </div>
                <div className="apple-card p-4">
                  <div className="text-[12px] text-[#86868b] font-medium">API Latency</div>
                  <div className="text-[22px] font-semibold text-white tabular-nums mt-1">
                    {data.systemHealth.apiLatencyMs} ms
                  </div>
                </div>
              </div>

              <div className="apple-card p-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => triggerAdminExport("csv")}
                  className="px-4 h-10 rounded-full bg-[#30d158] text-black text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => triggerAdminExport("json")}
                  className="px-4 h-10 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-white text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Export JSON
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
