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

  // Pure OLED Black Canvas
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);

  // Subtle emerald radial glow behind hero
  const glow = ctx.createRadialGradient(W / 2, 340, 40, W / 2, 340, 480);
  glow.addColorStop(0, "rgba(16, 231, 96, 0.16)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Outer Card Border
  drawRoundedRect(ctx, 56, 56, W - 112, H - 112, 56);
  ctx.fillStyle = "#0a0a0c";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.stroke();

  const fontStack = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif';

  // Header
  ctx.fillStyle = "#10e760";
  ctx.font = `700 26px ${fontStack}`;
  ctx.fillText("HONEST REPS", 120, 150);

  ctx.fillStyle = "#86868b";
  ctx.font = `500 26px ${fontStack}`;
  ctx.textAlign = "right";
  ctx.fillText(`@${state.profile.username}`, W - 120, 150);
  ctx.textAlign = "left";

  ctx.fillStyle = "#f5f5f7";
  ctx.font = `700 54px ${fontStack}`;
  ctx.fillText(state.profile.name, 120, 225);

  // Hero Score Block
  const heroScore =
    state.todaySummary.effortScore ?? state.monthStats.monthEffort ?? null;
  const isTodayScored = state.todaySummary.effortScore !== null;
  const heroLabel = isTodayScored ? "TODAY'S EFFORT" : `${state.monthStats.monthPrefix} MONTH AVG`;

  drawRoundedRect(ctx, 120, 275, W - 240, 320, 40);
  ctx.fillStyle = "#050507";
  ctx.fill();
  ctx.strokeStyle = "rgba(16, 231, 96, 0.35)";
  ctx.stroke();

  ctx.fillStyle = "#86868b";
  ctx.font = `600 24px ${fontStack}`;
  ctx.fillText(heroLabel, 170, 340);

  ctx.fillStyle = "#10e760";
  ctx.font = `700 156px ${fontStack}`;
  const scoreStr = heroScore !== null ? String(heroScore) : "Cal";
  ctx.fillText(scoreStr, 165, 495);

  const scoreWidth = ctx.measureText(scoreStr).width;
  if (heroScore !== null) {
    ctx.fillStyle = "#525257";
    ctx.font = `600 44px ${fontStack}`;
    ctx.fillText("/ 100", 185 + scoreWidth, 495);
  }

  ctx.fillStyle = "#a1a1a6";
  ctx.font = `500 26px ${fontStack}`;
  ctx.fillText("50 = Personal Usual · Relative to Own History", 170, 555);

  // 7-Day Rolling Bars
  ctx.fillStyle = "#86868b";
  ctx.font = `600 24px ${fontStack}`;
  ctx.fillText("LAST 7 DAYS", 120, 665);

  const days = state.rolling7Days;
  const barAreaX = 120;
  const barAreaW = W - 240;
  const gap = 22;
  const barW = (barAreaW - gap * 6) / 7;
  const barTop = 700;
  const barH = 230;

  days.forEach((d, idx) => {
    const bx = barAreaX + idx * (barW + gap);
    const isLast = idx === days.length - 1;

    drawRoundedRect(ctx, bx, barTop, barW, barH, 22);
    ctx.fillStyle = "#050506";
    ctx.fill();
    ctx.strokeStyle = isLast ? "rgba(16,231,96,0.65)" : "rgba(255,255,255,0.1)";
    ctx.stroke();

    if (d.effortScore !== null) {
      const pct = Math.max(0.18, Math.min(1, d.effortScore / 100));
      const fh = Math.round((barH - 12) * pct);
      drawRoundedRect(ctx, bx + 6, barTop + barH - 6 - fh, barW - 12, fh, 16);
      ctx.fillStyle =
        d.status === "Calibrating"
          ? "#ea580c"
          : isLast || d.effortScore >= 75
          ? "#10e760"
          : d.effortScore >= 50
          ? "#26a641"
          : "#006d32";
      ctx.fill();

      ctx.fillStyle = d.effortScore >= 48 || isLast ? "#000000" : "#bbf7d0";
      ctx.font = `700 24px ${fontStack}`;
      ctx.textAlign = "center";
      ctx.fillText(String(d.effortScore), bx + barW / 2, barTop + barH - fh + 26);
    } else if (d.isRest) {
      ctx.fillStyle = "#525257";
      ctx.font = `600 20px ${fontStack}`;
      ctx.textAlign = "center";
      ctx.fillText("Rest", bx + barW / 2, barTop + barH - 22);
    }

    ctx.fillStyle = isLast ? "#10e760" : "#86868b";
    ctx.font = `600 22px ${fontStack}`;
    ctx.textAlign = "center";
    ctx.fillText(isLast ? "Today" : d.dayLetter, bx + barW / 2, barTop + barH + 38);
    ctx.textAlign = "left";
  });

  // 3 Summary Stat Tiles
  const stats = [
    { label: "STREAK", val: `${state.monthStats.currentStreak}d` },
    { label: "MONTH ACTIVE", val: `${state.monthStats.activeDaysThisMonth}d` },
    { label: "YEAR ACTIVE", val: `${state.monthStats.activeDaysYear}d` },
  ];
  const tileW = (barAreaW - 32) / 3;
  stats.forEach((st, idx) => {
    const tx = 120 + idx * (tileW + 16);
    const ty = 1020;
    drawRoundedRect(ctx, tx, ty, tileW, 145, 28);
    ctx.fillStyle = "#111115";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.stroke();

    ctx.fillStyle = "#10e760";
    ctx.font = `700 48px ${fontStack}`;
    ctx.textAlign = "center";
    ctx.fillText(st.val, tx + tileW / 2, ty + 78);

    ctx.fillStyle = "#86868b";
    ctx.font = `600 20px ${fontStack}`;
    ctx.fillText(st.label, tx + tileW / 2, ty + 116);
    ctx.textAlign = "left";
  });

  // Footer
  ctx.fillStyle = "#525257";
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
    onToast("Saved OLED summary card");
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
      title="Share Summary Card"
      subtitle="OLED card ready for Stories, WhatsApp, or iMessage"
    >
      <div className="space-y-4">
        {dataUrl && (
          <div className="rounded-2xl overflow-hidden border border-white/12 bg-black p-2">
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
            className="h-11 rounded-2xl bg-[#10e760] hover:bg-[#25d658] text-black font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            {sharing ? "Sharing..." : "Share Image"}
          </button>
          <button
            type="button"
            disabled={!dataUrl}
            onClick={handleDownload}
            className="h-11 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-white font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Save PNG
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
