"use client";

import React, { useId, useMemo, useState } from "react";
import {
  Trophy,
  Dumbbell,
  Flame,
  Footprints,
  Timer,
  Zap,
  Weight,
  Check,
  ChevronDown,
  ChevronUp,
  Calendar,
} from "lucide-react";
import {
  formatPlateMultiplierBreakdown,
  MilestoneBadge,
  MilestoneCategory,
  MilestoneTier,
  UserMilestoneSummary,
} from "@/lib/milestones";
import { BottomSheet } from "./BottomSheet";
import { triggerHaptic } from "@/lib/haptics";

interface MilestoneBadgesCardProps {
  summary: UserMilestoneSummary;
  initialFilter?: MilestoneCategory;
}

interface MattePlatePalette {
  bodyTop: string;
  bodyBottom: string;
  dishFill: string;
  rimStroke: string;
  hubFill: string;
  textColor: string;
  subTextColor: string;
}

/**
 * Matte cast-iron / vulcanized rubber palette for the 25 kg competition plate.
 * Flat, low-sheen finishes designed for Pure OLED Black without plastic shine.
 */
function getMattePlatePalette(isUnlocked: boolean): MattePlatePalette {
  if (!isUnlocked) {
    return {
      bodyTop: "#141416",
      bodyBottom: "#0e0e10",
      dishFill: "#101012",
      rimStroke: "#5e2426",
      hubFill: "#1a1a1d",
      textColor: "#5c5c63",
      subTextColor: "#48484e",
    };
  }

  return {
    bodyTop: "#3b1b1d",
    bodyBottom: "#2b1315",
    dishFill: "#241113",
    rimStroke: "#9e4044",
    hubFill: "#1b1112",
    textColor: "#f5dede",
    subTextColor: "#c98587",
  };
}

export function WeightPlateGraphic({
  label = "25",
  plateCount = 1,
  isUnlocked,
  size = "md",
}: {
  label?: string;
  baseKg?: number;
  plateCount?: number;
  isUnlocked: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const palette = getMattePlatePalette(isUnlocked);
  const stackVisible = Math.min(8, Math.max(1, plateCount));
  const isStacked = stackVisible > 1;
  const frontR = stackVisible >= 6 ? 27 : isStacked ? 29 : 36;
  const shiftStep =
    stackVisible <= 2
      ? 8
      : stackVisible === 3
      ? 6
      : stackVisible === 4
      ? 4.8
      : stackVisible === 5
      ? 3.8
      : stackVisible === 6
      ? 3.2
      : stackVisible === 7
      ? 2.8
      : 2.5;
  const totalStackWidth = (stackVisible - 1) * shiftStep;
  const frontCx = isStacked ? 44 + totalStackWidth / 2 : 44;
  const cy = 44;

  const fontSize = isStacked ? "12" : "14.5";
  const labelY = cy - frontR * 0.44;
  const kgY = cy + frontR * 0.68;
  const hubR = frontR * 0.34;
  const boreR = frontR * 0.145;

  const sizeClass =
    size === "lg" ? "w-28 h-28" : size === "sm" ? "w-10 h-10" : "w-[58px] h-[58px]";

  return (
    <svg
      viewBox="0 0 88 88"
      className={`${sizeClass} drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)] overflow-visible`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`matte-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={palette.bodyTop} />
          <stop offset="100%" stopColor={palette.bodyBottom} />
        </linearGradient>
      </defs>

      {/* Stacked backing discs when multiplying plates inside detail preview */}
      {Array.from({ length: stackVisible - 1 }).map((_, idx) => {
        const layerFromBack = stackVisible - 1 - idx;
        const backCx = frontCx - layerFromBack * shiftStep;
        return (
          <g key={layerFromBack}>
            <circle
              cx={backCx}
              cy={cy}
              r={frontR}
              fill={palette.bodyBottom}
              stroke={palette.rimStroke}
              strokeWidth="1.5"
              strokeOpacity={isUnlocked ? 0.7 : 0.4}
            />
            <circle
              cx={backCx + 1.4}
              cy={cy}
              r={frontR - 0.5}
              fill="none"
              stroke="#050507"
              strokeWidth="1.6"
              opacity="0.8"
            />
          </g>
        );
      })}

      {/* Outer solid matte rubber/cast bumper lip */}
      <circle
        cx={frontCx}
        cy={cy}
        r={frontR}
        fill={`url(#matte-${uid})`}
        stroke={palette.rimStroke}
        strokeWidth="1.6"
        strokeOpacity={isUnlocked ? 0.85 : 0.65}
      />

      {/* Recessed inner lip groove */}
      <circle
        cx={frontCx}
        cy={cy}
        r={frontR * 0.85}
        fill="none"
        stroke="#08080a"
        strokeWidth="1.5"
        opacity="0.7"
      />

      {/* Matte concave dish */}
      <circle
        cx={frontCx}
        cy={cy}
        r={frontR * 0.79}
        fill={palette.dishFill}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth="0.9"
      />

      {/* Cast matte grip notches on left & right */}
      <line
        x1={frontCx - frontR * 0.68}
        y1={cy}
        x2={frontCx - frontR * 0.48}
        y2={cy}
        stroke={palette.rimStroke}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={isUnlocked ? 0.35 : 0.2}
      />
      <line
        x1={frontCx + frontR * 0.48}
        y1={cy}
        x2={frontCx + frontR * 0.68}
        y2={cy}
        stroke={palette.rimStroke}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={isUnlocked ? 0.35 : 0.2}
      />

      {/* Flat molded weight numeral */}
      <text
        x={frontCx}
        y={labelY}
        textAnchor="middle"
        fill={palette.textColor}
        fontSize={fontSize}
        fontWeight="800"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        letterSpacing="-0.04em"
      >
        {label}
      </text>

      {/* Anodized Matte Gunmetal Center Hub Flange */}
      <circle
        cx={frontCx}
        cy={cy}
        r={hubR}
        fill={palette.hubFill}
        stroke={palette.rimStroke}
        strokeWidth="0.9"
        strokeOpacity={isUnlocked ? 0.45 : 0.25}
      />
      {/* 4 Matte Recessed Hub Bolts */}
      {[45, 135, 225, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const bx = frontCx + Math.cos(rad) * (hubR * 0.72);
        const by = cy + Math.sin(rad) * (hubR * 0.72);
        return (
          <circle
            key={deg}
            cx={bx.toFixed(1)}
            cy={by.toFixed(1)}
            r={frontR * 0.035}
            fill="#09090b"
            stroke="#3f3f46"
            strokeWidth="0.4"
          />
        );
      })}

      {/* Center Olympic Barbell Bore Hole */}
      <circle
        cx={frontCx}
        cy={cy}
        r={boreR + 1.1}
        fill="none"
        stroke="#52525b"
        strokeWidth="0.7"
        opacity="0.55"
      />
      <circle
        cx={frontCx}
        cy={cy}
        r={boreR}
        fill="#050507"
        stroke="#18181b"
        strokeWidth="0.8"
      />

      {/* Milled KG Label */}
      <text
        x={frontCx}
        y={kgY}
        textAnchor="middle"
        fill={palette.subTextColor}
        fontSize={isStacked ? "6.2" : "7.2"}
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.14em"
      >
        KG
      </text>
    </svg>
  );
}

export function MonthlyMedalGraphic({
  monthCode,
  yearNumber,
  monthNumber,
  isUnlocked,
  size = "md",
}: {
  monthCode: string;
  yearNumber: number;
  monthNumber: number;
  isUnlocked: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const angleRad = ((monthNumber * 30 - 90) * Math.PI) / 180;
  const dotX = 32 + Math.cos(angleRad) * 25.5;
  const dotY = 32 + Math.sin(angleRad) * 25.5;
  const sizeClass = size === "lg" ? "w-24 h-24" : size === "sm" ? "w-10 h-10" : "w-14 h-14";

  return (
    <svg viewBox="0 0 64 64" className={sizeClass} aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="29"
        fill={isUnlocked ? "#241d0f" : "#0e0e11"}
        stroke={isUnlocked ? "#d4a644" : "#38383d"}
        strokeWidth="1.8"
      />
      <circle
        cx="32"
        cy="32"
        r="25.5"
        fill="none"
        stroke={isUnlocked ? "#8f712c" : "#27272c"}
        strokeWidth="1.1"
        strokeDasharray="1.5 11.85"
      />
      <circle
        cx={dotX.toFixed(1)}
        cy={dotY.toFixed(1)}
        r="2.1"
        fill={isUnlocked ? "#eab308" : "#636369"}
      />
      <text
        x="32"
        y="27"
        textAnchor="middle"
        fill={isUnlocked ? "#f7e09e" : "#86868b"}
        fontSize="10"
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.1em"
      >
        {monthCode}
      </text>
      <text
        x="32"
        y="42.5"
        textAnchor="middle"
        fill={isUnlocked ? "#d4a644" : "#5c5c63"}
        fontSize="10.5"
        fontWeight="700"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        letterSpacing="0.04em"
      >
        {yearNumber}
      </text>
    </svg>
  );
}

export function YearlyMedalGraphic({
  yearNumber,
  isUnlocked,
  size = "md",
}: {
  yearNumber: number;
  isUnlocked: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "lg" ? "w-24 h-24" : size === "sm" ? "w-10 h-10" : "w-14 h-14";

  return (
    <svg viewBox="0 0 64 64" className={sizeClass} aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="29"
        fill={isUnlocked ? "#112419" : "#0e0e11"}
        stroke={isUnlocked ? "#10e760" : "#38383d"}
        strokeWidth="1.8"
      />
      <circle
        cx="32"
        cy="32"
        r="24.5"
        fill="none"
        stroke={isUnlocked ? "#177038" : "#27272c"}
        strokeWidth="1"
      />
      <text
        x="32"
        y="24.5"
        textAnchor="middle"
        fill={isUnlocked ? "#7ee8a3" : "#71717a"}
        fontSize="7"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.16em"
      >
        YEAR
      </text>
      <text
        x="32"
        y="40.5"
        textAnchor="middle"
        fill={isUnlocked ? "#ffffff" : "#86868b"}
        fontSize="13.5"
        fontWeight="800"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        letterSpacing="-0.03em"
      >
        {yearNumber}
      </text>
    </svg>
  );
}

export function BadgeVisualThumbnail({
  badge,
  size = "md",
}: {
  badge: MilestoneBadge;
  size?: "sm" | "md" | "lg";
}) {
  if (badge.iconType === "plate") {
    return (
      <WeightPlateGraphic
        label={badge.plateLabel ?? "25"}
        plateCount={badge.plateCount ?? 1}
        isUnlocked={badge.isUnlocked}
        size={size}
      />
    );
  }
  if (
    badge.iconType === "calendar" &&
    badge.monthLabel &&
    badge.monthNumber &&
    badge.yearNumber
  ) {
    return (
      <MonthlyMedalGraphic
        monthCode={badge.monthLabel}
        yearNumber={badge.yearNumber}
        monthNumber={badge.monthNumber}
        isUnlocked={badge.isUnlocked}
        size={size}
      />
    );
  }
  if (badge.iconType === "yearly" && badge.yearNumber) {
    return (
      <YearlyMedalGraphic
        yearNumber={badge.yearNumber}
        isUnlocked={badge.isUnlocked}
        size={size}
      />
    );
  }

  const iconClass =
    size === "lg"
      ? badge.isUnlocked
        ? "w-10 h-10"
        : "w-9 h-9 opacity-35"
      : size === "sm"
      ? "w-4 h-4"
      : badge.isUnlocked
      ? "w-5 h-5"
      : "w-4 h-4 opacity-40";

  switch (badge.iconType) {
    case "dumbbell":
      return <Dumbbell className={iconClass} />;
    case "weight":
      return <Weight className={iconClass} />;
    case "flame":
      return <Flame className={iconClass} />;
    case "footprints":
      return <Footprints className={iconClass} />;
    case "timer":
      return <Timer className={iconClass} />;
    case "zap":
      return <Zap className={iconClass} />;
    case "calendar":
      return <Calendar className={iconClass} />;
    case "trophy":
    default:
      return <Trophy className={iconClass} />;
  }
}

export function getMatteMedalContainerStyle(tier: MilestoneTier, isUnlocked: boolean) {
  if (!isUnlocked) {
    return {
      outer: "bg-[#0e0e11] border-white/[0.07] text-[#525257]",
    };
  }
  switch (tier) {
    case "diamond":
      return {
        outer: "bg-[#112419] border-[#10e760]/45 text-[#10e760]",
      };
    case "gold":
      return {
        outer: "bg-[#241d0f] border-amber-500/45 text-amber-300",
      };
    case "silver":
      return {
        outer: "bg-[#1e2024] border-slate-400/45 text-slate-200",
      };
    case "bronze":
    default:
      return {
        outer: "bg-[#241a13] border-amber-700/50 text-amber-400",
      };
  }
}

export function MilestoneBadgesCard({
  summary,
  initialFilter = "all",
}: MilestoneBadgesCardProps) {
  const [filter, setFilter] = useState<MilestoneCategory>(initialFilter);
  const [expanded, setExpanded] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<MilestoneBadge | null>(null);

  const openBadgeDetail = (badge: MilestoneBadge) => {
    triggerHaptic(badge.isUnlocked ? "success" : "selection");
    setSelectedBadge(badge);
  };

  const hasWorkoutDetailBadges = useMemo(
    () =>
      summary.badges.some(
        (b) => b.category === "strength" || b.category === "cardio" || b.subCategory === "plate"
      ),
    [summary.badges]
  );

  const categoryTabs = useMemo(() => {
    const tabs: Array<{ key: MilestoneCategory; label: string }> = [
      { key: "all", label: "All" },
      {
        key: "monthly",
        label: `Monthly ${summary.monthlyUnlocked}/${summary.monthlyTotal}`,
      },
      {
        key: "yearly",
        label: `Yearly ${summary.yearlyUnlocked}/${summary.yearlyTotal}`,
      },
    ];
    if (hasWorkoutDetailBadges) {
      tabs.push(
        {
          key: "plates",
          label: `Plates ${summary.platesUnlocked}/${summary.platesTotal}`,
        },
        { key: "strength", label: "Strength" },
        { key: "cardio", label: "Cardio" }
      );
    }
    tabs.push({ key: "streak", label: "Streaks" });
    return tabs;
  }, [
    hasWorkoutDetailBadges,
    summary.monthlyUnlocked,
    summary.monthlyTotal,
    summary.yearlyUnlocked,
    summary.yearlyTotal,
    summary.platesUnlocked,
    summary.platesTotal,
  ]);

  const activeFilter: MilestoneCategory = categoryTabs.some((t) => t.key === filter)
    ? filter
    : "all";

  const filteredBadges = useMemo(() => {
    let list = summary.badges;
    if (activeFilter === "plates") {
      list = list.filter((b) => b.subCategory === "plate");
      return [...list].sort((a, b) => (a.plateWeightKg ?? 0) - (b.plateWeightKg ?? 0));
    }
    if (activeFilter === "monthly") {
      list = list.filter((b) => b.category === "monthly");
      return [...list].sort((a, b) =>
        (a.monthPrefix ?? "").localeCompare(b.monthPrefix ?? "")
      );
    }
    if (activeFilter === "yearly") {
      list = list.filter((b) => b.category === "yearly");
      return [...list].sort((a, b) => (a.yearNumber ?? 0) - (b.yearNumber ?? 0));
    }
    if (activeFilter !== "all") {
      list = list.filter((b) => b.category === activeFilter);
    }
    return [...list].sort((a, b) => {
      if (a.isUnlocked !== b.isUnlocked) {
        return a.isUnlocked ? -1 : 1;
      }
      return b.progressPercent - a.progressPercent;
    });
  }, [summary.badges, activeFilter]);

  const showAllInTab =
    activeFilter === "plates" ||
    activeFilter === "monthly" ||
    activeFilter === "yearly" ||
    expanded;
  const displayedBadges = showAllInTab ? filteredBadges : filteredBadges.slice(0, 6);

  const categorySubtitle = (badge: MilestoneBadge) => {
    if (badge.subCategory === "plate") return `MATTE WEIGHT PLATE · ${badge.tier.toUpperCase()}`;
    if (badge.subCategory === "calendar-month")
      return `MONTHLY MEDAL · ${badge.yearNumber ?? ""}`;
    if (badge.subCategory === "yearly-goal") return `YEARLY MEDAL · ${badge.yearNumber ?? ""}`;
    return `${badge.category.toUpperCase()} · ${badge.tier.toUpperCase()} TIER`;
  };

  const plateBreakdown =
    summary.highestWeightKg > 0 ? formatPlateMultiplierBreakdown(summary.highestWeightKg) : null;

  return (
    <div className="apple-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="apple-section-label flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-[#30d158]" />
            <span>Awards</span>
          </div>
          <div className="text-[17px] font-semibold text-white tabular-nums mt-0.5">
            {summary.totalUnlocked} of {summary.totalAvailable} earned
          </div>
        </div>

        <span className="text-[12px] font-medium text-[#86868b] tabular-nums">
          {Math.round((summary.totalUnlocked / Math.max(1, summary.totalAvailable)) * 100)}%
        </span>
      </div>

      {/* Category Pills */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {categoryTabs.map((c) => {
          const active = activeFilter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                triggerHaptic("selection");
                setFilter(c.key);
              }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? "bg-white text-black font-semibold"
                  : "bg-[#1c1c1e] text-[#86868b] hover:text-white"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Highest Weight + Plate Stack Readout on Plates Tab */}
      {activeFilter === "plates" && (
        <div className="px-3.5 py-2.5 rounded-xl bg-[#1c1c1e] space-y-1 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#86868b]">Highest Weight</span>
            <span className="font-semibold text-white tabular-nums">
              {summary.highestWeightKg > 0
                ? `${summary.highestWeightKg} kg${
                    summary.highestWeightExercise ? ` · ${summary.highestWeightExercise}` : ""
                  }`
                : "No strength sets yet"}
            </span>
          </div>
          {plateBreakdown && (
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[#86868b]">Plate Stack</span>
              <span className="font-medium text-[#30d158] tabular-nums">
                {plateBreakdown}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3-Column Medallion Grid */}
      <div className="grid grid-cols-3 gap-y-4 gap-x-2 pt-1">
        {displayedBadges.map((badge) => {
          const style = getMatteMedalContainerStyle(badge.tier, badge.isUnlocked);
          const isPlate = badge.iconType === "plate";
          const isFullFaceSvg =
            isPlate || badge.iconType === "calendar" || badge.iconType === "yearly";

          return (
            <button
              key={badge.id}
              type="button"
              onClick={() => openBadgeDetail(badge)}
              className="flex flex-col items-center text-center group cursor-pointer focus:outline-none"
            >
              <div className="relative w-16 h-16 flex items-center justify-center">
                {isPlate ? (
                  <div className="w-[58px] h-[58px] flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                    <BadgeVisualThumbnail badge={badge} size="md" />
                  </div>
                ) : (
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center ${
                      isFullFaceSvg ? "" : "border"
                    } transition-transform duration-200 group-hover:scale-105 ${style.outer}`}
                  >
                    <BadgeVisualThumbnail badge={badge} size="md" />
                  </div>
                )}

                {/* SVG Progress Ring for locked badges */}
                {!badge.isUnlocked && badge.progressPercent > 0 && (
                  <svg className="absolute inset-0 w-16 h-16 -rotate-90 pointer-events-none">
                    <circle
                      cx="32"
                      cy="32"
                      r="30"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.05)"
                      strokeWidth="2"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="30"
                      fill="none"
                      stroke="#10e760"
                      strokeWidth="2"
                      strokeDasharray={188.5}
                      strokeDashoffset={188.5 - (188.5 * badge.progressPercent) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </div>

              <span
                className={`text-[11px] font-medium tracking-tight mt-1.5 px-0.5 line-clamp-1 max-w-[100px] leading-tight ${
                  badge.isUnlocked ? "text-white" : "text-[#86868b]"
                }`}
              >
                {badge.title}
              </span>

              <span className="text-[10px] text-[#6e6e73] font-mono tabular-nums mt-0.5">
                {badge.isUnlocked ? "Earned" : `${badge.progressPercent}%`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expand / Collapse Button */}
      {activeFilter !== "plates" &&
        activeFilter !== "monthly" &&
        activeFilter !== "yearly" &&
        filteredBadges.length > 6 && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[11px] font-semibold text-[#86868b] hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>{expanded ? "Show Fewer" : `See All ${filteredBadges.length} Awards`}</span>
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}

      {/* Apple-Style Award Detail Bottom Sheet */}
      {selectedBadge &&
        (() => {
          const isPlateModal = selectedBadge.subCategory === "plate";
          const isFullFaceSvg =
            selectedBadge.iconType === "calendar" || selectedBadge.iconType === "yearly";

          return (
            <BottomSheet
              open={Boolean(selectedBadge)}
              onClose={() => setSelectedBadge(null)}
              title="Award Detail"
              subtitle={categorySubtitle(selectedBadge)}
            >
              <div className="py-2 space-y-5 text-center">
                <div className="flex justify-center pt-1">
                  {isPlateModal ? (
                    <div className="w-28 h-28 flex items-center justify-center">
                      <BadgeVisualThumbnail badge={selectedBadge} size="lg" />
                    </div>
                  ) : (
                    <div
                      className={`w-24 h-24 rounded-full flex items-center justify-center ${
                        isFullFaceSvg ? "" : "border"
                      } shadow-xl ${
                        getMatteMedalContainerStyle(
                          selectedBadge.tier,
                          selectedBadge.isUnlocked
                        ).outer
                      }`}
                    >
                      <BadgeVisualThumbnail badge={selectedBadge} size="lg" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 px-4">
                  <h2 className="text-[20px] font-bold text-white tracking-tight">
                    {selectedBadge.title}
                  </h2>
                  <p className="text-[13px] text-[#86868b] leading-relaxed">
                    {selectedBadge.description}
                  </p>
                  {selectedBadge.detailNote && (
                    <p className="text-[11px] font-mono text-[#a1a1a6] pt-1">
                      {selectedBadge.detailNote}
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-[#1c1c1e] text-left space-y-2.5">
                  <div className="flex items-center justify-between text-[12px] tabular-nums">
                    <span className="text-[#86868b]">Progress</span>
                    <span
                      className={
                        selectedBadge.isUnlocked
                          ? "text-[#30d158] font-semibold"
                          : "text-white font-semibold"
                      }
                    >
                      {selectedBadge.currentValue.toLocaleString()} /{" "}
                      {selectedBadge.targetValue.toLocaleString()} {selectedBadge.unit}
                    </span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        selectedBadge.isUnlocked ? "bg-[#30d158]" : "bg-white/40"
                      }`}
                      style={{ width: `${selectedBadge.progressPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-0.5">
                    <span className="text-[#86868b]">Status</span>
                    {selectedBadge.isUnlocked ? (
                      <span className="text-[#30d158] font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Unlocked</span>
                      </span>
                    ) : (
                      <span className="text-amber-400 font-medium">
                        {selectedBadge.progressPercent}% complete
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedBadge(null)}
                  className="w-full h-11 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-white font-medium text-[14px] transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </BottomSheet>
          );
        })()}
    </div>
  );
}
