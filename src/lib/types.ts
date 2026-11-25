export type ActiveStatus =
  | "Sedentary"
  | "Lightly active"
  | "Moderately active"
  | "Very active";

export type WeightUnit = "kg" | "lb";
export type HeightUnit = "cm" | "ft-in";
export type ThemePreference = "system" | "dark" | "light";
export type LogSource = "manual" | "text-parsed" | "image-parsed";
export type EffortStatus = "Calibrating" | "Scored" | "Rest" | "No log";
export type EffortBand =
  | "Very low"
  | "Low"
  | "Steady"
  | "High"
  | "Very high"
  | "Calibrating"
  | "Rest"
  | "No log";

export interface Profile {
  userId: string;
  email: string;
  name: string;
  username: string;
  heightCm: number;
  activeStatus: ActiveStatus;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  age?: number;
  sex?: "Male" | "Female" | "Other" | "";
  goal?: string;
  shareWorkoutDetails: boolean;
  onboardingComplete: boolean;
  suspended: boolean;
  firstLogDate: string; // YYYY-MM-DD
  createdAt: string;
  inGym?: boolean;
  gymStartedAt?: string | null;
}

export interface WeightLog {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  createdAt: string;
}

export interface MuscleGroup {
  id: string;
  name: string;
  enabled: boolean;
  displayOrder: number;
  ownerId: string | null; // null = site-wide default
}

export interface ExerciseLibraryItem {
  id: string;
  name: string;
  muscleGroup: string;
  enabled: boolean;
  displayOrder: number;
  ownerId: string | null; // null = site-wide default
}

export interface HiddenExercise {
  userId: string;
  exerciseId: string;
}

export interface DailySession {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  muscleGroups: string[];
  isRest: boolean;
  createdAt: string;
}

export interface ExerciseSet {
  setNumber: number;
  weightKg: number;
  reps: number;
  restSeconds?: number;
}

export interface PersonalRecordResult {
  isWeightPr: boolean;
  isOneRepMaxPr: boolean;
  isVolumePr: boolean;
  bestWeight: number;
  bestOneRepMax: number;
  bestVolume: number;
}

export interface ExerciseLog {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  exerciseId?: string;
  exerciseName: string;
  muscleGroup: string;
  sets: ExerciseSet[];
  optionalMinutes?: number;
  rir?: number; // optional Reps in Reserve (0-5); missing = unknown, never penalized
  source: LogSource;
  addedLater: boolean;
  work: number;
  usualUsed: number | null;
  effortScore: number | null; // null while Calibrating
  status: "Calibrating" | "Scored";
  scoringSettingsVersion: number;
  createdAt: string;
}

export interface CardioLog {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  activityType: string;
  distanceKm?: number;
  minutes: number; // required (FR-12, FR-16)
  avgHeartRate?: number;
  kcal: number;
  kcalIsEstimated: boolean; // FR-21
  source: LogSource;
  addedLater: boolean; // FR-74
  isRestActivity: boolean; // FR-32, FR-77
  work: number;
  usualUsed: number | null;
  effortScore: number | null; // null while Calibrating or Rest
  status: "Calibrating" | "Scored" | "Rest";
  scoringSettingsVersion: number;
  createdAt: string;
}

export interface Friendship {
  id: string;
  userId: string; // requester
  friendId: string; // recipient
  status: "pending" | "accepted";
  createdAt: string;
}

export interface NotificationSettings {
  userId: string;
  dailyPromptEnabled: boolean;
  dailyPromptTime: string;
  weeklyWeightEnabled: boolean;
  weeklyWeightTime: string;
  friendRequestsEnabled: boolean;
  summariesEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  emailFallbackEnabled: boolean;
  pushSubscribed: boolean;
}

export interface AdminEmailRecord {
  email: string;
  addedBy: string;
  addedAt: string;
}

export interface GridThresholds {
  veryLowMax: number; // default 24 (0-24)
  lowMax: number; // default 44 (25-44)
  steadyMax: number; // default 55 (45-55)
  highMax: number; // default 75 (56-75), 76-100 Very high
}

export interface AppSettings {
  version: number;
  aiProvider: "gemini" | "openrouter";
  aiModel: string;
  aiRateLimitPerDay: number;
  maxImageSizeMb: number;
  aboveUsualSlope: number; // default 12.5
  belowUsualRoot: number; // default 4
  backfillWindowDays: number; // default 2
  gridThresholds: GridThresholds;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  adminEmail: string;
  action: string;
  target: string;
  timestamp: string;
}

export interface AiUsageLog {
  id: string;
  userId: string;
  provider: "gemini" | "openrouter" | "local-fallback";
  model: string;
  inputType: "text" | "image";
  success: boolean;
  errorMessage?: string;
  estimatedCostUsd: number;
  timestamp: string;
}

export interface FriendReport {
  id: string;
  reporterUsername: string;
  reportedUserId: string;
  reportedUsername: string;
  reason: string;
  status: "open" | "resolved";
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  target?: string; // "all" | "calibrating" | "inactive_2d" | "active_streak" | "@username"
  sentBy: string;
  sentAt: string;
}

export interface NotificationTemplate {
  id: string;
  type:
    | "daily_prompt"
    | "weekly_weight"
    | "friend_request"
    | "month_summary"
    | "calibration_milestone"
    | "leaderboard_update"
    | "streak_grace";
  title: string;
  body: string;
  enabled?: boolean;
}

export interface PublicGym {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  createdByUserId: string;
  createdByName?: string;
  memberUserIds: string[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoggedItemSplit {
  id: string;
  splitNumber: number;
  minutes: number;
  distanceKm?: number;
  kcal: number;
  effortScore: number | null;
  addedLater?: boolean;
  createdAt: string;
}

export interface DatabaseState {
  currentUserId: string | null; // simulated session cookie / auth state
  profiles: Profile[];
  weightLogs: WeightLog[];
  muscleGroups: MuscleGroup[];
  exerciseLibrary: ExerciseLibraryItem[];
  hiddenExercises: HiddenExercise[];
  sessions: DailySession[];
  exerciseLogs: ExerciseLog[];
  cardioLogs: CardioLog[];
  friendships: Friendship[];
  notificationSettings: NotificationSettings[];
  adminEmails: AdminEmailRecord[];
  appSettings: AppSettings;
  auditLog: AuditLogEntry[];
  aiUsageLogs: AiUsageLog[];
  friendReports: FriendReport[];
  announcements: Announcement[];
  notificationTemplates: NotificationTemplate[];
  publicGyms?: PublicGym[];
}

export interface DaySummary {
  date: string; // YYYY-MM-DD
  dayLetter: string;
  shortLabel: string;
  sessionGroups: string[];
  isRest: boolean;
  status: EffortStatus;
  effortScore: number | null;
  band: EffortBand;
  itemCount: number;
  loggedItems: Array<{
    id: string;
    kind: "strength" | "cardio";
    title: string;
    detail: string;
    effortScore: number | null;
    status: "Calibrating" | "Scored" | "Rest";
    addedLater: boolean;
    kcalIsEstimated?: boolean;
    createdAt?: string;
    splits?: LoggedItemSplit[];
  }>;
  effortBreakdown?: {
    mode: "provisional" | "calibrated";
    formulaNote: string;
    items: Array<{
      label: string;
      points: string;
      detail: string;
    }>;
  };
}

export interface ParsedCardioDraft {
  activityType: string;
  distanceKm: number | null;
  minutes: number | null;
  avgHeartRate: number | null;
  kcal: number | null;
  kcalIsEstimated: boolean;
  missingMinutes: boolean;
  source: LogSource;
  providerUsed: string;
  confidenceNote?: string;
}
