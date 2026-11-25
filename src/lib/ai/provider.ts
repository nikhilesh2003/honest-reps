import { estimateCardioCalories } from "../effort";
import { AppSettings, ParsedCardioDraft } from "../types";

export interface ParseCardioInput {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  imageFileName?: string;
  userWeightKg: number;
  settings: AppSettings;
}

const SYSTEM_PROMPT = `You extract structured cardio workout logs from user text or screenshots of treadmills, watches, or fitness apps.
Return ONLY valid JSON with these exact keys:
{
  "activityType": string (e.g. "Indoor Walk", "Outdoor Run", "Treadmill Run", "Cycling", "Rowing", "Elliptical", "Stairmaster", "Swimming", "HIIT"),
  "distanceKm": number | null,
  "minutes": number | null,
  "avgHeartRate": number | null,
  "kcal": number | null
}
CRITICAL RULES (FR-16):
- Never guess missing values. If a field is not explicitly present or readable, return null.
- Convert miles to km (1 mi = 1.60934 km) if distance is in miles.
- Convert hours:minutes to total integer minutes if needed.`;

async function callGeminiProvider(input: ParseCardioInput): Promise<Partial<ParsedCardioDraft> | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = input.settings.aiModel || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts: Array<Record<string, unknown>> = [{ text: SYSTEM_PROMPT }];
  if (input.text?.trim()) {
    parts.push({ text: `User input: ${input.text.trim()}` });
  }
  if (input.imageBase64 && input.imageMimeType) {
    const cleanBase64 = input.imageBase64.includes(",")
      ? input.imageBase64.split(",")[1]
      : input.imageBase64;
    parts.push({
      inlineData: {
        mimeType: input.imageMimeType,
        data: cleanBase64,
      },
    });
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Empty response from Gemini");

  const parsed = JSON.parse(rawText);
  return {
    activityType: typeof parsed.activityType === "string" ? parsed.activityType : "Cardio",
    distanceKm: typeof parsed.distanceKm === "number" ? Number(parsed.distanceKm.toFixed(2)) : null,
    minutes: typeof parsed.minutes === "number" ? Math.round(parsed.minutes) : null,
    avgHeartRate: typeof parsed.avgHeartRate === "number" ? Math.round(parsed.avgHeartRate) : null,
    kcal: typeof parsed.kcal === "number" ? Math.round(parsed.kcal) : null,
  };
}

async function callOpenRouterProvider(input: ParseCardioInput): Promise<Partial<ParsedCardioDraft> | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model = input.settings.aiModel || "google/gemini-2.5-flash";
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: `${SYSTEM_PROMPT}\n\nUser input: ${input.text || "Extract from image"}` },
  ];
  if (input.imageBase64) {
    content.push({
      type: "image_url",
      image_url: { url: input.imageBase64 },
    });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText) throw new Error("Empty response from OpenRouter");
  const parsed = JSON.parse(rawText);
  return {
    activityType: typeof parsed.activityType === "string" ? parsed.activityType : "Cardio",
    distanceKm: typeof parsed.distanceKm === "number" ? Number(parsed.distanceKm.toFixed(2)) : null,
    minutes: typeof parsed.minutes === "number" ? Math.round(parsed.minutes) : null,
    avgHeartRate: typeof parsed.avgHeartRate === "number" ? Math.round(parsed.avgHeartRate) : null,
    kcal: typeof parsed.kcal === "number" ? Math.round(parsed.kcal) : null,
  };
}

// Deterministic offline/local parser when no external AI key is configured yet.
// Strictly follows FR-16: never invents values that aren't present in text.
function parseCardioDeterministic(input: ParseCardioInput): Partial<ParsedCardioDraft> {
  const raw = (input.text || "").trim();
  const lower = raw.toLowerCase();

  // Detect activity type
  let activityType = "Cardio";
  if (lower.includes("indoor walk")) activityType = "Indoor Walk";
  else if (lower.includes("incline walk")) activityType = "Incline Walk";
  else if (lower.includes("treadmill")) activityType = "Treadmill Run";
  else if (lower.includes("outdoor run") || lower.includes("5k")) activityType = "Outdoor Run";
  else if (lower.includes("walk")) activityType = "Walking";
  else if (lower.includes("run") || lower.includes("jog")) activityType = "Running";
  else if (lower.includes("cycl") || lower.includes("bike") || lower.includes("spin")) activityType = "Cycling";
  else if (lower.includes("row")) activityType = "Rowing";
  else if (lower.includes("elliptical")) activityType = "Elliptical";
  else if (lower.includes("stair")) activityType = "Stairmaster";
  else if (lower.includes("swim")) activityType = "Swimming";
  else if (lower.includes("hiit")) activityType = "HIIT";
  else if (input.imageBase64 && !raw) {
    const fname = (input.imageFileName || "").toLowerCase();
    if (fname.includes("walk")) activityType = "Indoor Walk";
    else if (fname.includes("cycle") || fname.includes("bike")) activityType = "Cycling";
    else activityType = "Treadmill Run";
  }

  // Distance (km or miles)
  let distanceKm: number | null = null;
  const kmMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:km|kms|kilometer|kilometers|kilometre|kilometres)\b/);
  const miMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/);
  const kShortMatch = lower.match(/\b(\d+(?:\.\d+)?)k\b/);
  if (kmMatch) {
    distanceKm = Number(parseFloat(kmMatch[1]).toFixed(2));
  } else if (miMatch) {
    distanceKm = Number((parseFloat(miMatch[1]) * 1.60934).toFixed(2));
  } else if (kShortMatch) {
    distanceKm = Number(parseFloat(kShortMatch[1]).toFixed(2));
  }

  // Duration (minutes / hours)
  let minutes: number | null = null;
  const hrMinMatch = lower.match(/(\d+)\s*(?:h|hr|hrs|hour|hours)\s*(\d+)\s*(?:m|min|mins|minute|minutes)?/);
  const minMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes|m)\b/);
  const hrOnlyMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (hrMinMatch) {
    minutes = parseInt(hrMinMatch[1], 10) * 60 + parseInt(hrMinMatch[2], 10);
  } else if (minMatch) {
    minutes = Math.round(parseFloat(minMatch[1]));
  } else if (hrOnlyMatch) {
    minutes = Math.round(parseFloat(hrOnlyMatch[1]) * 60);
  }

  // Heart rate (bpm / hr)
  let avgHeartRate: number | null = null;
  const hrMatch =
    lower.match(/(\d{2,3})\s*(?:bpm|avg\s*hr|hr)\b/) ||
    lower.match(/(?:hr|heart\s*rate|avg\s*hr)\s*[:=]?\s*(\d{2,3})\b/);
  if (hrMatch) {
    const val = parseInt(hrMatch[1], 10);
    if (val >= 50 && val <= 220) avgHeartRate = val;
  }

  // Calories (kcal / cal)
  let kcal: number | null = null;
  const kcalMatch = lower.match(/(\d{2,4})\s*(?:kcal|cal|cals|calories)\b/);
  if (kcalMatch) {
    kcal = parseInt(kcalMatch[1], 10);
  }

  return {
    activityType,
    distanceKm,
    minutes,
    avgHeartRate,
    kcal,
  };
}

// Single swappable entry point for all AI parsing (Spec Section 2.3 & 6)
export async function parseCardioWithAI(input: ParseCardioInput): Promise<{
  draft: ParsedCardioDraft;
  provider: "gemini" | "openrouter" | "local-fallback";
  costUsd: number;
}> {
  const source: "text-parsed" | "image-parsed" = input.imageBase64 ? "image-parsed" : "text-parsed";
  let extracted: Partial<ParsedCardioDraft> | null = null;
  let provider: "gemini" | "openrouter" | "local-fallback" = "local-fallback";
  let costUsd = 0;

  if (input.settings.aiProvider === "gemini" && process.env.GEMINI_API_KEY) {
    extracted = await callGeminiProvider(input);
    provider = "gemini";
    costUsd = input.imageBase64 ? 0.0004 : 0.0001;
  } else if (input.settings.aiProvider === "openrouter" && process.env.OPENROUTER_API_KEY) {
    extracted = await callOpenRouterProvider(input);
    provider = "openrouter";
    costUsd = input.imageBase64 ? 0.0006 : 0.0002;
  }

  if (!extracted) {
    extracted = parseCardioDeterministic(input);
    provider = "local-fallback";
  }

  const minutes = extracted.minutes ?? null;
  const distanceKm = extracted.distanceKm ?? null;
  const avgHeartRate = extracted.avgHeartRate ?? null;
  const activityType = extracted.activityType || "Cardio";

  // FR-19, FR-20, FR-21: Use supplied calories as-is; estimate missing calories via MET when minutes are known
  let kcal = extracted.kcal ?? null;
  let kcalIsEstimated = false;
  if (kcal === null && minutes !== null && minutes > 0) {
    kcal = estimateCardioCalories(input.userWeightKg, activityType, minutes, distanceKm);
    kcalIsEstimated = true;
  }

  const missingMinutes = minutes === null || minutes <= 0;

  return {
    provider,
    costUsd,
    draft: {
      activityType,
      distanceKm,
      minutes,
      avgHeartRate,
      kcal,
      kcalIsEstimated,
      missingMinutes,
      source,
      providerUsed:
        provider === "local-fallback"
          ? `${input.settings.aiModel} (local parser)`
          : `${input.settings.aiProvider}/${input.settings.aiModel}`,
      confidenceNote:
        source === "image-parsed" && provider === "local-fallback"
          ? "Set GEMINI_API_KEY for live vision OCR. Review or enter fields below."
          : undefined,
    },
  };
}
