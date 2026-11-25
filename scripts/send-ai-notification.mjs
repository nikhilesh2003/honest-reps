import { createClient } from "@supabase/supabase-js";
import * as webpush from "web-push";
import fs from "fs";
import path from "path";

// 1. Load configuration from .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
const env = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      env[k] = v;
    }
  }
}

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "https://imsxvctqwdkriblrolan.supabase.co";
const supabaseKey = env.SUPABASE_SECRET_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const vapidPublicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BA7XdKS84-qLiKi7sK_z26bNXn1DTxglIb7-g3y08NkrwJxymuM_VbDkK_qiriWbIVGFEimtfGZBpun8tAAi-pE";
const vapidPrivateKey = env.VAPID_PRIVATE_KEY || "6ySR8KINmN-FcjT_k5D4DCK1cVS7bQK6w9iZQppu4oU";
const geminiApiKey = env.GEMINI_API_KEY || "";

webpush.setVapidDetails("mailto:mailbox2249@gmail.com", vapidPublicKey, vapidPrivateKey);

const sb = createClient(supabaseUrl, supabaseKey);

/**
 * Optional Gemini AI text generator for coaching messages
 */
async function generateAiCoachingMessage(promptText) {
  if (!geminiApiKey) {
    const motivationalFallback = [
      "Consistency beats intensity. Even 20 honest minutes today builds your streak.",
      "Your chest and back are fully recovered. Great day to log a progressive overload session!",
      "Hydrate and hit today's reps honestly. Remember: 50 is your usual, push for 55+ today!",
      "Rest days grow muscle. If today is rest, log it cleanly to keep your recovery balanced.",
    ];
    return motivationalFallback[Math.floor(Math.random() * motivationalFallback.length)];
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      geminiApiKey
    )}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are the Honest Reps AI fitness coach. Honest Reps is an Apple-minimalist, zero-gimmick gym tracker.
Generate a concise, punchy push notification message (1-2 short sentences max, under 110 characters, zero emojis).
Context: ${promptText || "Motivate the athlete for today's workout"}.
Output ONLY the message text.`,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.7, maxOutputTokens: 60 },
      }),
    });
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || "Ready to log today's workout? Honest reps count the most.";
  } catch (err) {
    console.warn("Gemini generation fallback:", err.message);
    return "Consistency beats intensity. Keep your streak active today.";
  }
}

/**
 * Core function to send an AI notification
 */
export async function sendAiNotification({
  title = "Honest Reps AI",
  body = null,
  prompt = null,
  target = "all", // "all" | "@username" | userId | "calibrating" | "active_streak"
  url = "/",
  category = "admin",
}) {
  let finalBody = body;
  if (!finalBody) {
    finalBody = await generateAiCoachingMessage(prompt);
  }

  const announcementId = `ai_notif_${Date.now()}`;
  console.log("--------------------------------------------------");
  console.log("  Honest Reps — AI Push Notification Dispatch");
  console.log(`  Title  : ${title}`);
  console.log(`  Body   : ${finalBody}`);
  console.log(`  Target : ${target}`);
  console.log(`  URL    : ${url}`);
  console.log("--------------------------------------------------");

  // 1. Resolve recipient user IDs
  const { data: profiles, error: pErr } = await sb
    .from("profiles")
    .select("user_id, username, name, email")
    .eq("suspended", false);

  if (pErr || !profiles) {
    console.error("Error fetching profiles:", pErr);
    return { success: false, error: pErr };
  }

  let recipientUserIds = [];
  const cleanTarget = target.trim().toLowerCase();

  if (cleanTarget === "all" || cleanTarget === "") {
    recipientUserIds = profiles.map((p) => p.user_id);
  } else if (cleanTarget.startsWith("@")) {
    const handle = cleanTarget.slice(1);
    const match = profiles.find((p) => p.username.toLowerCase() === handle);
    if (match) recipientUserIds = [match.user_id];
  } else {
    // Check direct userId match or handle match
    const match = profiles.find(
      (p) => p.user_id === target || p.username.toLowerCase() === cleanTarget
    );
    if (match) recipientUserIds = [match.user_id];
  }

  if (recipientUserIds.length === 0) {
    console.warn(`No active users matched target: ${target}`);
    return { success: false, message: `Target ${target} matched 0 users.` };
  }

  console.log(`Resolved ${recipientUserIds.length} target user(s). Fetching subscriptions...`);

  // 2. Fetch subscriptions from push_subscriptions
  const { data: subs, error: sErr } = await sb
    .from("push_subscriptions")
    .select("*")
    .in("user_id", recipientUserIds);

  if (sErr) {
    console.error("Error fetching push_subscriptions:", sErr);
  }

  const pushPayload = JSON.stringify({
    title,
    body: finalBody,
    url,
    tag: `honest-reps-${Date.now()}`,
    announcementId,
    notifId: announcementId,
  });

  const sendResults = [];
  for (const s of subs || []) {
    const sub = {
      endpoint: s.device_endpoint,
      keys: { p256dh: s.p256dh, auth: s.auth_key },
    };
    try {
      const res = await webpush.sendNotification(sub, pushPayload, { TTL: 86400 });
      console.log(`  [SENT] to user ${s.user_id} (${s.device_endpoint.slice(0, 32)}...): HTTP ${res.statusCode}`);
      sendResults.push({ userId: s.user_id, success: true, status: res.statusCode });
    } catch (err) {
      console.error(`  [FAILED] for user ${s.user_id}: HTTP ${err.statusCode || "ERR"} - ${err.message}`);
      sendResults.push({ userId: s.user_id, success: false, error: err.message });
      if (err.statusCode === 410 || err.statusCode === 404) {
        await sb.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }

  // 3. Persist to app_settings announcements in Supabase so it lives in app history
  try {
    const { data: currentSettings } = await sb
      .from("app_settings")
      .select("grid_thresholds")
      .eq("id", 1)
      .maybeSingle();

    const existingThresholds = currentSettings?.grid_thresholds || {};
    const existingAnnouncements = Array.isArray(existingThresholds.announcements)
      ? existingThresholds.announcements
      : [];

    const newAnnouncement = {
      id: announcementId,
      title,
      body: finalBody,
      target,
      sentBy: "AI Coach",
      sentAt: new Date().toISOString(),
    };

    const updatedAnnouncements = [newAnnouncement, ...existingAnnouncements].slice(0, 30);
    await sb
      .from("app_settings")
      .update({
        grid_thresholds: {
          ...existingThresholds,
          announcements: updatedAnnouncements,
        },
      })
      .eq("id", 1);
    console.log("  [PERSISTED] Announcement saved to app_settings history.");
  } catch (err) {
    console.warn("Could not persist announcement to app_settings:", err.message);
  }

  // 4. Realtime broadcast to all connected web clients via Supabase channel
  try {
    const channel = sb.channel("hr_realtime_feed");
    await channel.send({
      type: "broadcast",
      event: "admin_announcement",
      payload: {
        id: announcementId,
        title,
        body: finalBody,
        target,
        sentBy: "AI Coach",
        sentAt: new Date().toISOString(),
      },
    });
    console.log("  [BROADCAST] Dispatched realtime WebSocket event to active clients.");
  } catch (err) {
    // Non-blocking
  }

  return {
    success: true,
    announcementId,
    message: finalBody,
    targetedUsers: recipientUserIds.length,
    pushSentCount: sendResults.filter((r) => r.success).length,
    pushFailCount: sendResults.filter((r) => !r.success).length,
    details: sendResults,
  };
}

// Command Line Runner
if (process.argv[1] && process.argv[1].endsWith("send-ai-notification.mjs")) {
  const args = process.argv.slice(2);
  let title = "Honest Reps AI";
  let body = "";
  let prompt = "";
  let target = "all";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--title" && args[i + 1]) title = args[++i];
    else if (args[i] === "--body" && args[i + 1]) body = args[++i];
    else if (args[i] === "--prompt" && args[i + 1]) prompt = args[++i];
    else if (args[i] === "--target" && args[i + 1]) target = args[++i];
    else if (!body && !args[i].startsWith("--")) body = args[i];
  }

  sendAiNotification({ title, body: body || null, prompt: prompt || null, target }).then((res) => {
    console.log("\nSummary Result:\n", JSON.stringify(res, null, 2));
    process.exit(0);
  });
}
