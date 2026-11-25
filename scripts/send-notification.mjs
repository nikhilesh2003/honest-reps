import { createClient } from "@supabase/supabase-js";
import * as webpush from "web-push";
import fs from "fs";
import path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
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

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY;

const vapidPublicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = env.VAPID_PRIVATE_KEY;
const vapidSubject = "mailto:mailbox2249@gmail.com";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const sb = createClient(supabaseUrl, supabaseKey);

export async function sendPushNotification({
  title = "Honest Reps",
  body = "Push notification test.",
  url = "/",
  targetUserId = null,
  announcementId = null,
}) {
  console.log("Preparing to send notification:", { title, body, url, targetUserId });

  let query = sb.from("push_subscriptions").select("*");
  if (targetUserId) {
    query = query.eq("user_id", targetUserId);
  }
  const { data: subs, error } = await query;
  if (error) {
    console.error("Error fetching subscriptions:", error);
    return { success: false, error };
  }

  if (!subs || subs.length === 0) {
    console.log("No subscriptions found.");
    return { success: false, message: "No subscriptions found" };
  }

  const payload = JSON.stringify({
    title,
    body,
    url,
    tag: `honest-reps-${Date.now()}`,
    announcementId: announcementId || `push-${Date.now()}`,
  });

  const results = [];
  for (const s of subs) {
    const pushSubscription = {
      endpoint: s.device_endpoint,
      keys: {
        p256dh: s.p256dh,
        auth: s.auth_key,
      },
    };

    try {
      const res = await webpush.sendNotification(pushSubscription, payload, {
        TTL: 86400,
      });
      console.log(`[SENT] to user ${s.user_id} (${s.device_endpoint.slice(0, 35)}...): HTTP ${res.statusCode}`);
      results.push({ userId: s.user_id, success: true, status: res.statusCode });
    } catch (err) {
      console.error(`[FAILED] for user ${s.user_id}: HTTP ${err.statusCode || "N/A"} - ${err.message}`);
      results.push({ userId: s.user_id, success: false, error: err.message, status: err.statusCode });

      // Clean up 410 Gone / 404 Not Found expired subscriptions
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`Cleaning up expired subscription: ${s.id}`);
        await sb.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }

  return { success: true, results };
}

// If executed directly from command line
if (process.argv[1] && process.argv[1].endsWith("send-notification.mjs")) {
  const customTitle = process.argv[2] || "Honest Reps · Test Alert";
  const customBody = process.argv[3] || "Hello from Honest Reps! Push notifications are working perfectly.";
  sendPushNotification({ title: customTitle, body: customBody }).then((res) => {
    console.log("Result summary:", JSON.stringify(res, null, 2));
    process.exit(0);
  });
}
