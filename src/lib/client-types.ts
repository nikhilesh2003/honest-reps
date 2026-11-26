import {
  Announcement,
  CardioLog,
  DailySession,
  DaySummary,
  ExerciseLibraryItem,
  ExerciseLog,
  GridThresholds,
  MuscleGroup,
  NotificationSettings,
  Profile,
  PublicGym,
  WeightLog,
} from "./types";
import { UserMilestoneSummary } from "./milestones";

export interface LeaderboardEntry {
  userId: string;
  name: string;
  username: string;
  isMe: boolean;
  shareWorkoutDetails: boolean;
  inGym?: boolean;
  gymStartedAt?: string | null;
  todayScore: number | null;
  todayStatus: "Calibrating" | "Scored" | "Rest" | "No log";
  todayGroups: string[];
  todayItemCount?: number;
  todayBreakdown?: DaySummary["effortBreakdown"];
  monthEffort: number | null;
  isMonthCalibrating: boolean;
  activeDaysThisMonth: number;
  restDaysThisMonth?: number;
  currentStreak: number;
}

export interface FriendRequestSummary {
  friendshipId: string;
  userId: string;
  name: string;
  username: string;
  createdAt: string;
}

export type MemberRelationshipStatus =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "accepted";

export interface MemberSearchResult {
  userId: string;
  name: string;
  username: string;
  goal?: string;
  shareWorkoutDetails: boolean;
  friendshipStatus: MemberRelationshipStatus;
  friendshipId?: string | null;
}

export interface MemberPreviewPayload extends MemberSearchResult {
  activeDays30d: number;
  totalWorkouts: number;
}

export interface AppStatePayload {
  authenticated: boolean;
  suspended?: boolean;
  authMode?: "supabase-google" | "local";
  supabaseConfigured?: boolean;
  isAdmin?: boolean;
  todayIso: string;
  realTodayIso: string;
  profile: Profile;
  todaySession: DailySession | null;
  todaySummary: DaySummary;
  previousScoredDay: { date: string; effortScore: number | null } | null;
  rolling7Days: DaySummary[];
  summaries365: DaySummary[];
  monthStats: {
    monthPrefix: string;
    monthEffort: number | null;
    isMonthCalibrating: boolean;
    activeDaysThisMonth: number;
    restDaysThisMonth: number;
    activeDaysYear: number;
    currentStreak: number;
    longestStreak: number;
  };
  progressAndConsistency: {
    progressPercent: number | null;
    progressStatus: "Calibrating" | "Scored";
    consistencyPercent: number;
    consistencyWindowDays: number;
  };
  weightLogs: WeightLog[];
  latestWeight: WeightLog | null;
  daysSinceLastWeight: number;
  needsWeightPrompt: boolean;
  visibleMuscleGroups: MuscleGroup[];
  visibleExercises: ExerciseLibraryItem[];
  allAccessibleExercises: ExerciseLibraryItem[];
  hiddenExerciseIds: string[];
  recentExerciseLogs: ExerciseLog[];
  recentCardioLogs: CardioLog[];
  strengthProgression: Record<
    string,
    Array<{
      date: string;
      shortDate: string;
      maxWeightKg: number;
      best1RMKg: number;
      totalVolume: number;
      totalReps: number;
      effortScore: number | null;
      status: string;
    }>
  >;
  muscleGroupProgression: Record<
    string,
    Array<{
      date: string;
      shortDate: string;
      totalVolume: number;
      maxWeightKg: number;
      totalSets: number;
    }>
  >;
  cardioTotals: {
    totalDistanceKm: number;
    totalMinutes: number;
    loggedKcal: number;
    estimatedKcal: number;
    sessionCount: number;
  };
  muscleGroupSplit: Array<{ group: string; count: number; percent: number }>;
  monthCalendar: DaySummary[];
  leaderboard: LeaderboardEntry[];
  incomingRequests: FriendRequestSummary[];
  outgoingRequests: FriendRequestSummary[];
  notificationSettings: NotificationSettings;
  appSettings: {
    version: number;
    backfillWindowDays: number;
    gridThresholds: GridThresholds;
    aboveUsualSlope: number;
    belowUsualRoot: number;
  };
  announcements: Announcement[];
  publicGyms: PublicGym[];
  milestones?: UserMilestoneSummary;
}
