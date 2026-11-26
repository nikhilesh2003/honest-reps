"use client";

import { useEffect, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { AppStatePayload } from "@/lib/client-types";
import { BottomSheet } from "../ui/BottomSheet";

interface ShareCardSheetProps {
  open: boolean;
  onClose: () => void;
  state: AppStatePayload;
  onToast: (text: string, tone?: "success" | "error") => void;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderSummaryCanvas(state: AppStatePayload): string {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Pure OLED Black Canvas (Zero neon glow — pure Apple Fitness minimalism)
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);

  // Outer Quiet Surface Card
  drawRoundedRect(ctx, 56, 56, W - 112, H - 112, 64);
  ctx.fillStyle = "#111113";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();

  const fontStack =
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif';

  // Header
  ctx.fillStyle = "#86868b";
  ctx.font = `600 26px ${fontStack}`;
  ctx.fillText("Honest Reps", 124, 154);

  ctx.fillStyle = "#86868b";
  ctx.font = `500 26px ${fontStack}`;
  ctx.textAlign = "right";
  ctx.fillText(`@${state.profile.username}`, W - 124, 154);
  ctx.textAlign = "left";

  ctx.fillStyle = "#f5f5f7";
  ctx.font = `600 56px ${fontStack}`;
  ctx.fillText(state.profile.name, 124, 228);

  // Hero Score Block
  const heroScore =
    state.todaySummary.effortScore ?? state.monthStats.monthEffort ?? null;
  const isTodayScored = state.todaySummary.effortScore !== null;
  const heroLabel = isTodayScored
    ? "Today's Effort"
    : `${state.monthStats.monthPrefix} Monthly Effort`;

  drawRoundedRect(ctx, 124, 280, W - 248, 316, 44);
  ctx.fillStyle = "#1c1c1e";
  ctx.fill();

  ctx.fillStyle = "#86868b";
  ctx.font = `500 26px ${fontStack}`;
  ctx.fillText(heroLabel, 174, 344);

  ctx.fillStyle = "#30d158";
  ctx.font = `600 156px ${fontStack}`;
  const scoreStr = heroScore !== null ? String(heroScore) : "Cal";
  ctx.fillText(scoreStr, 168, 496);

  const scoreWidth = ctx.measureText(scoreStr).width;
  if (heroScore !== null) {
    ctx.fillStyle = "#636366";
    ctx.font = `500 42px ${fontStack}`;
    ctx.fillText("/ 100", 186 + scoreWidth, 496);
  }

  ctx.fillStyle = "#86868b";
  ctx.font = `500 25px ${fontStack}`;
  ctx.fillText("50 is personal usual · Scored against own history", 174, 554);

  // 7-Day Rolling Bars
  ctx.fillStyle = "#86868b";
  ctx.font = `500 25px ${fontStack}`;
  ctx.fillText("Last 7 Days", 124, 666);

  const days = state.rolling7Days;
  const barAreaX = 124;
  const barAreaW = W - 248;
  const gap = 22;
  const barW = (barAreaW - gap * 6) / 7;
  const barTop = 702;
  const barH = 228;

  days.forEach((d, idx) => {
    const bx = barAreaX + idx * (barW + gap);
    const isLast = idx === days.length - 1;

    drawRoundedRect(ctx, bx, barTop, barW, barH, 24);
    ctx.fillStyle = "#1c1c1e";
    ctx.fill();

    if (d.effortScore !== null) {
      const pct = Math.max(0.18, Math.min(1, d.effortScore / 100));
      const fh = Math.round((barH - 12) * pct);
      drawRoundedRect(ctx, bx + 6, barTop + barH - 6 - fh, barW - 12, fh, 18);
      ctx.fillStyle =
        d.status === "Calibrating"
          ? "#ff9f0a"
          : isLast || d.effortScore >= 75
          ? "#30d158"
          : d.effortScore >= 50
          ? "#228b46"
          : "#175c31";
      ctx.fill();

      ctx.fillStyle = d.effortScore >= 48 || isLast ? "#000000" : "#dcfce7";
      ctx.font = `600 23px ${fontStack}`;
      ctx.textAlign = "center";
      ctx.fillText(String(d.effortScore), bx + barW / 2, barTop + barH - fh + 28);
    } else if (d.isRest) {
      ctx.fillStyle = "#86868b";
      ctx.font = `500 20px ${fontStack}`;
      ctx.textAlign = "center";
      ctx.fillText("Rest", bx + barW / 2, barTop + barH - 22);
    }

    ctx.fillStyle = isLast ? "#30d158" : "#86868b";
    ctx.font = `500 22px ${fontStack}`;
    ctx.textAlign = "center";
    ctx.fillText(isLast ? "Today" : d.dayLetter, bx + barW / 2, barTop + barH + 38);
    ctx.textAlign = "left";
  });

  // 3 Summary Stat Tiles
  const stats = [
    { label: "Streak", val: `${state.monthStats.currentStreak}d` },
    { label: "Month Active", val: `${state.monthStats.activeDaysThisMonth}d` },
    { label: "Year Active", val: `${state.monthStats.activeDaysYear}d` },
  ];
  const tileW = (barAreaW - 32) / 3;
  stats.forEach((st, idx) => {
    const tx = 124 + idx * (tileW + 16);
    const ty = 1020;
    drawRoundedRect(ctx, tx, ty, tileW, 144, 30);
    ctx.fillStyle = "#1c1c1e";
    ctx.fill();

    ctx.fillStyle = idx === 2 ? "#f5f5f7" : "#30d158";
    ctx.font = `600 48px ${fontStack}`;
    ctx.textAlign = "center";
    ctx.fillText(st.val, tx + tileW / 2, ty + 76);

    ctx.fillStyle = "#86868b";
    ctx.font = `500 21px ${fontStack}`;
    ctx.fillText(st.label, tx + tileW / 2, ty + 114);
    ctx.textAlign = "left";
  });

  // Footer
  ctx.fillStyle = "#636366";
  ctx.font = `500 22px ${fontStack}`;
  ctx.textAlign = "center";
  ctx.fillText("honestreps.ifleon.com", W / 2, H - 92);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}

export function ShareCardSheet({ open, onClose, state, onToast }: ShareCardSheetProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    setDataUrl(renderSummaryCanvas(state));
  }, [open, state]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `honest-reps-${state.profile.username}-${state.todayIso}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast("Saved summary card");
  };

  const handleNativeShare = async () => {
    if (!dataUrl) return;
    setSharing(true);
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File(
        [blob],
        `honest-reps-${state.profile.username}.png`,
        { type: "image/png" }
      );
      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          title: "Honest Reps Summary",
          text: `My Honest Reps effort (@${state.profile.username}) — 50 means my usual.`,
          files: [file],
        });
        return;
      }
      handleDownload();
    } catch {
      handleDownload();
    } finally {
      setSharing(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Summary Card"
      subtitle="Ready for Stories, WhatsApp, or iMessage"
    >
      <div className="space-y-4">
        {dataUrl && (
          <div className="rounded-2xl overflow-hidden bg-[#1c1c1e] p-2.5">
            <img
              src={dataUrl}
              alt="Honest Reps Summary Card"
              className="w-full max-h-[360px] object-contain mx-auto rounded-xl"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={sharing || !dataUrl}
            onClick={handleNativeShare}
            className="h-11 rounded-full bg-[#30d158] hover:opacity-90 text-black font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            {sharing ? "Sharing..." : "Share"}
          </button>
          <button
            type="button"
            disabled={!dataUrl}
            onClick={handleDownload}
            className="h-11 rounded-full bg-[#1c1c1e] hover:bg-white/[0.12] text-white font-medium text-[13px] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Save PNG
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
