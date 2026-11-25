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
  auditLog: Array<{ id: string; adminEmail: string; action: string; target: string; timestamp: string }>;
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
            className="inline-flex items-center justify-center w-full h-11 rounded-2xl bg-white text-black font-semibold text-[14px]"
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
        <div className="bg-black px-5 py-3 rounded-2xl">
          <img
            src="/icons/logo-wordmark.png"
            alt="honestreps.com"
            className="h-11 w-auto object-contain animate-pulse"
          />
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: AdminSection; label: string; icon: typeof LayoutDashboard }> = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users },
    { id: "library", label: "Exercise Library", icon: Dumbbell },
    { id: "ai", label: "AI & Usage", icon: Cpu },
    { id: "scoring", label: "Effort & Grid", icon: Sliders },
    { id: "moderation", label: "Moderation", icon: Flag },
    { id: "announcements", label: "Notifications", icon: Megaphone },
    { id: "admins", label: "Admin Emails", icon: ShieldCheck },
    { id: "audit", label: "Audit Log", icon: FileText },
    { id: "health", label: "Export & Health", icon: Activity },
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
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="brand-icon-box w-8 h-8 rounded-[10px] p-1 flex items-center justify-center shrink-0">
              <img src="/icons/logo-icon.png" alt="Honest Reps" className="w-full h-full object-contain" />
            </span>
            <div>
              <div className="text-[15px] font-semibold text-white leading-none">
                Admin Console
              </div>
              <div className="text-[11px] text-[#86868b] mt-0.5">Honest Reps</div>
            </div>
          </div>

          <Link
            href="/"
            className="px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[12px] font-medium text-white flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Member App
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Responsive Nav (horizontal scroll on mobile, sidebar on desktop) */}
        <aside className="flex lg:flex-col gap-1.5 overflow-x-auto no-scrollbar pb-1 lg:pb-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-[#10e760]/15 text-[#10e760] border border-[#10e760]/30"
                    : "text-[#86868b] hover:text-white hover:bg-white/[0.04] border border-transparent"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Active Panel */}
        <section className="space-y-4 min-w-0">
          {/* 1. DASHBOARD (FR-47) */}
          {section === "dashboard" && (
            <div className="space-y-4">
              <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white">Overview</h1>
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
                    <div className="text-[11px] uppercase tracking-[0.06em] text-[#86868b] font-semibold">
                      {label}
                    </div>
                    <div className="text-[26px] font-bold text-white tabular-nums mt-1">
                      {val}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. USERS (FR-48: NO private chat or raw weight shown) */}
          {section === "users" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white">Users</h1>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="h-10 px-3.5 rounded-xl bg-[#0a0a0c] border border-white/12 text-[13px] text-white focus:outline-none focus:border-[#10e760]"
                />
              </div>
              <div className="apple-card divide-y divide-white/[0.06]">
                {filteredUsers.map((u) => (
                  <div
                    key={u.userId}
                    className="p-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-white">{u.name}</span>
                        <span className="text-[12px] text-[#86868b]">@{u.username}</span>
                        {u.isAdmin && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#10e760]/15 text-[#10e760]">
                            Admin
                          </span>
                        )}
                        {u.suspended && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
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
                            u.suspended ? `Reactivated @${u.username}` : `Suspended @${u.username}`
                          )
                        }
                        className="px-3 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[12px] text-white cursor-pointer"
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
                        className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-red-500/20 text-[#86868b] hover:text-red-400 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. DEFAULT EXERCISE LIBRARY & SHARED MUSCLE GROUPS (FR-49) */}
          {section === "library" && (
            <div className="space-y-4">
              <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white">
                Site-Wide Defaults
              </h1>

              <div className="apple-card p-4 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                  Add Default Exercise
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={newExName}
                    onChange={(e) => setNewExName(e.target.value)}
                    placeholder="Exercise name"
                    className="flex-1 min-w-[160px] h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white"
                  />
                  <select
                    value={newExGroup}
                    onChange={(e) => setNewExGroup(e.target.value)}
                    className="h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white"
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
                        { action: "add-default-exercise", name: newExName, muscleGroup: newExGroup },
                        `Added ${newExName}`
                      );
                      setNewExName("");
                    }}
                    className="px-4 h-10 rounded-xl bg-[#10e760] text-black text-[13px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>

                <div className="flex gap-2 pt-2 border-t border-white/[0.06]">
                  <input
                    type="text"
                    value={newMgName}
                    onChange={(e) => setNewMgName(e.target.value)}
                    placeholder="Add shared muscle group"
                    className="flex-1 h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white"
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
                    className="px-4 h-10 rounded-xl bg-white/10 text-white text-[13px] font-medium cursor-pointer"
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
                      <span className="text-[12px] text-[#86868b] ml-2">{ex.muscleGroup}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          { action: "toggle-default-exercise", id: ex.id },
                          ex.enabled ? `Disabled ${ex.name}` : `Enabled ${ex.name}`
                        )
                      }
                      className="px-3 h-8 rounded-lg bg-white/[0.06] text-[12px] text-white cursor-pointer"
                    >
                      {ex.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. AI SETTINGS & USAGE (FR-50, FR-51: API keys NEVER shown) */}
          {section === "ai" && (
            <div className="space-y-4">
              <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white">AI Settings</h1>
              <div className="apple-card p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">Provider</label>
                    <select
                      value={aiProvider}
                      onChange={(e) => setAiProvider(e.target.value as "gemini" | "openrouter")}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white"
                    >
                      <option value="gemini">Gemini (Primary)</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">Model Name</label>
                    <input
                      type="text"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">
                      Daily Rate Limit / User
                    </label>
                    <input
                      type="number"
                      value={aiRateLimit}
                      onChange={(e) => setAiRateLimit(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">
                      Max Image Size (MB)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={aiMaxMb}
                      onChange={(e) => setAiMaxMb(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[12px] text-[#86868b] pt-2 border-t border-white/[0.06]">
                  <span>
                    Server Keys: Gemini ({data.aiConfig.geminiKeyConfigured ? "Set" : "Env unset"}) · OpenRouter (
                    {data.aiConfig.openRouterKeyConfigured ? "Set" : "Env unset"})
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
                    className="px-4 h-9 rounded-xl bg-[#10e760] text-black font-semibold text-[13px] cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="apple-card p-4 space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                  Recent AI Calls & Parsing Failures
                </div>
                <div className="divide-y divide-white/[0.05]">
                  {data.recentAiLogs.map((log) => (
                    <div key={log.id} className="py-2.5 flex items-center justify-between gap-3 text-[12px]">
                      <div>
                        <span className={log.success ? "text-white font-medium" : "text-amber-400 font-medium"}>
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

          {/* 5. EFFORT SCORING & YEAR GRID THRESHOLDS (FR-54) */}
          {section === "scoring" && (
            <div className="space-y-4">
              <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white">
                Effort Scoring & Year Grid
              </h1>

              {/* Mandatory FR-54 Warning */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-[12px] text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Changes apply to future logs only. Past effort history is never rewritten, and every update is recorded in the audit log (v{data.scoringSettings.version}).
                </span>
              </div>

              <div className="apple-card p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">
                      Above-Usual Slope (default 12.5)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={slope}
                      onChange={(e) => setSlope(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white tabular-nums text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">
                      Below-Usual Root (default 4)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={root}
                      onChange={(e) => setRoot(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white tabular-nums text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">
                      Backfill Window (days)
                    </label>
                    <input
                      type="number"
                      value={backfillDays}
                      onChange={(e) => setBackfillDays(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white tabular-nums text-[13px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/[0.06]">
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">Very Low Max</label>
                    <input
                      type="number"
                      value={tVeryLow}
                      onChange={(e) => setTVeryLow(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white tabular-nums text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">Low Max</label>
                    <input
                      type="number"
                      value={tLow}
                      onChange={(e) => setTLow(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white tabular-nums text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">Steady Max</label>
                    <input
                      type="number"
                      value={tSteady}
                      onChange={(e) => setTSteady(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white tabular-nums text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">High Max</label>
                    <input
                      type="number"
                      value={tHigh}
                      onChange={(e) => setTHigh(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-white tabular-nums text-[13px]"
                    />
                  </div>
                </div>

                {/* Live Formula Preview */}
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] text-[#86868b]">Ratio (today / usual):</span>
                    <input
                      type="number"
                      step="0.25"
                      value={simRatio}
                      onChange={(e) => setSimRatio(e.target.value)}
                      className="w-20 h-9 px-2.5 rounded-lg bg-black border border-white/12 text-white tabular-nums text-[13px]"
                    />
                  </div>
                  <div className="text-[14px] text-white tabular-nums">
                    Score: <strong className="text-[#10e760] text-[18px]">{simScore}</strong> / 100
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
                  className="px-5 h-10 rounded-xl bg-[#10e760] text-black font-semibold text-[13px] cursor-pointer"
                >
                  Save for Future Logs
                </button>
              </div>
            </div>
          )}

          {/* 6. FRIEND MODERATION (FR-52) */}
          {section === "moderation" && (
            <div className="space-y-4">
              <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white">
                Friend Moderation
              </h1>
              <div className="apple-card divide-y divide-white/[0.06]">
                {data.friendReports.map((rep) => (
                  <div key={rep.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-medium text-white">
                        @{rep.reportedUsername} reported by @{rep.reporterUsername}
                      </div>
                      <div className="text-[12px] text-[#86868b] mt-0.5">{rep.reason}</div>
                    </div>
                    {rep.status === "resolved" ? (
                      <span className="text-[12px] text-[#10e760]">Resolved</span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            runAction(
                              { action: "resolve-report", reportId: rep.id, removeFriendLinks: true },
                              `Removed friend links for @${rep.reportedUsername}`
                            )
                          }
                          className="px-3 h-8 rounded-lg bg-red-500/20 text-red-300 text-[12px] font-medium cursor-pointer"
                        >
                          Remove Links
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            runAction(
                              { action: "resolve-report", reportId: rep.id, removeFriendLinks: false },
                              "Report dismissed"
                            )
                          }
                          className="px-3 h-8 rounded-lg bg-white/[0.07] text-white text-[12px] cursor-pointer"
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

          {/* 7. NOTIFICATIONS & BROADCASTS (FR-53) */}
          {section === "announcements" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white">
                  Notifications & Broadcasts
                </h1>
                <p className="text-[12px] text-[#86868b] mt-0.5">
                  Send custom or preset notifications to specific member groups and maintain automated alerts.
                </p>
              </div>

              {/* Send Custom / Targeted Notification */}
              <div className="apple-card p-4 space-y-3.5">
                <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                  Send Custom Notification
                </div>

                {/* Quick Presets */}
                <div className="space-y-1.5">
                  <div className="text-[11px] text-[#86868b]">Quick Presets</div>
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
                        className="px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] font-medium text-[#d1d1d6] cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Audience Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-[#86868b] mb-1">
                      Target Users
                    </label>
                    <select
                      value={annTarget}
                      onChange={(e) => setAnnTarget(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white"
                    >
                      <option value="all">All Members ({data.users.length})</option>
                      <option value="calibrating">Calibrating Members (Est. Effort stage)</option>
                      <option value="inactive_2d">Unlogged Today / 2–3d Streak Grace</option>
                      <option value="active_streak">Active Streak Members</option>
                      <option value="specific">Specific Member (@username)</option>
                    </select>
                  </div>

                  {annTarget === "specific" && (
                    <div>
                      <label className="block text-[11px] text-[#86868b] mb-1">
                        Member @username
                      </label>
                      <input
                        type="text"
                        value={annCustomUser}
                        onChange={(e) => setAnnCustomUser(e.target.value)}
                        placeholder="@hari"
                        className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white"
                      />
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  placeholder="Notification title"
                  className="w-full h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white"
                />
                <textarea
                  rows={2}
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  placeholder="Notification message"
                  className="w-full p-3 rounded-xl bg-black border border-white/12 text-[13px] text-white resize-none"
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
                    // Request permission synchronously on user click gesture before awaiting network action
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
                  className="px-4 h-10 rounded-xl bg-[#10e760] text-black font-semibold text-[13px] cursor-pointer"
                >
                  Send Notification
                </button>
              </div>

              {/* Sent Notifications History */}
              {data.announcements.length > 0 && (
                <div className="apple-card divide-y divide-white/[0.06]">
                  <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                    Sent Notifications ({data.announcements.length})
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
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#10e760]/15 text-[#10e760] border border-[#10e760]/30">
                            Target: {a.target || "all"}
                          </span>
                        </div>
                        <div className="text-[12px] text-[#86868b] mt-1">{a.body}</div>
                        <div className="text-[11px] text-[#525257] mt-1 tabular-nums">
                          Sent by {a.sentBy} · {a.sentAt.slice(0, 16).replace("T", " ")}
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

              {/* Automated Notification Rules (Calibration, Friend Requests, Leaderboard, Streak, Daily) */}
              <div className="apple-card divide-y divide-white/[0.06]">
                <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#86868b]">
                  Automated Notification Templates
                </div>
                {data.notificationTemplates.map((tpl) => {
                  const isEditing = editingTplId === tpl.id;
                  const isEnabled = tpl.enabled !== false;
                  return (
                    <div key={tpl.id} className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] uppercase tracking-[0.06em] text-[#10e760] font-semibold">
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
                            className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-white cursor-pointer"
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
                                `${tpl.type.replace(/_/g, " ")} ${!isEnabled ? "enabled" : "paused"}`
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
                            className="w-full h-9 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white"
                          />
                          <textarea
                            rows={2}
                            value={tplBody}
                            onChange={(e) => setTplBody(e.target.value)}
                            className="w-full p-2.5 rounded-xl bg-black border border-white/12 text-[12px] text-white resize-none"
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
                            className="px-3.5 h-8 rounded-lg bg-[#10e760] text-black font-semibold text-[12px] cursor-pointer"
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

          {/* 8. ADMIN EMAILS (FR-68) */}
          {section === "admins" && (
            <div className="space-y-4">
              <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white">
                Admin Emails
              </h1>
              <div className="apple-card p-4 flex gap-2">
                <input
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  className="flex-1 h-10 px-3 rounded-xl bg-black border border-white/12 text-[13px] text-white"
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
                  className="px-4 h-10 rounded-xl bg-[#10e760] text-black font-semibold text-[13px] cursor-pointer"
                >
                  Add Admin
                </button>
              </div>

              <div className="apple-card divide-y divide-white/[0.06]">
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
                      className="px-3 h-8 rounded-lg bg-white/[0.06] disabled:opacity-30 text-[12px] text-white cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 9. AUDIT LOG (FR-55) */}
          {section === "audit" && (
            <div className="space-y-4">
              <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white">Audit Log</h1>
              <div className="apple-card divide-y divide-white/[0.06]">
                {data.auditLog.map((entry) => (
                  <div key={entry.id} className="p-4 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                    <div>
                      <span className="text-white font-medium">{entry.action}</span>
                      <span className="text-[#86868b] ml-2">({entry.target})</span>
                      <div className="text-[11px] text-[#525257] mt-0.5">{entry.adminEmail}</div>
                    </div>
                    <span className="text-[11px] text-[#86868b] tabular-nums">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 10. EXPORT & SYSTEM HEALTH (FR-56 + Live Supabase Health) */}
          {section === "health" && (
            <div className="space-y-4">
              <h1 className="text-[24px] font-bold tracking-[-0.02em] text-white">
                Export & System Health
              </h1>

              <div className="apple-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-white">Supabase Connection</span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                      data.systemHealth.supabase.reachable ? "text-[#10e760]" : "text-amber-400"
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
                  <div>Project: {data.systemHealth.supabase.projectUrl || "Not configured"}</div>
                  <div>JWKS: {data.systemHealth.supabase.jwksVerified ? "Verified" : "Unverified"}</div>
                  <div>{data.systemHealth.supabase.note}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="apple-card p-4">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-[#86868b] font-semibold">
                    Push Delivery
                  </div>
                  <div className="text-[22px] font-bold text-[#10e760] tabular-nums mt-1">
                    {data.systemHealth.pushDeliveryRate}
                  </div>
                </div>
                <div className="apple-card p-4">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-[#86868b] font-semibold">
                    Email Fallback
                  </div>
                  <div className="text-[22px] font-bold text-white mt-1">
                    {data.systemHealth.emailFallbackStatus}
                  </div>
                </div>
                <div className="apple-card p-4">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-[#86868b] font-semibold">
                    API Latency
                  </div>
                  <div className="text-[22px] font-bold text-white tabular-nums mt-1">
                    {data.systemHealth.apiLatencyMs} ms
                  </div>
                </div>
              </div>

              <div className="apple-card p-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => triggerAdminExport("csv")}
                  className="px-4 h-10 rounded-xl bg-[#10e760] text-black text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => triggerAdminExport("json")}
                  className="px-4 h-10 rounded-xl bg-white/[0.08] text-white text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer"
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
