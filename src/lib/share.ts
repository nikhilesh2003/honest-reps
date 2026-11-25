export const SITE_URL = "https://honestreps.ifleon.com";

export function getInviteUrl(username: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : SITE_URL;
  return `${origin}/invite/?u=${encodeURIComponent(username)}`;
}

export function buildInviteShareText(name: string, username: string): string {
  const link = getInviteUrl(username);
  return `${name} invited you to Honest Reps — compare gym & cardio effort fairly against your own history.\n\nAdd @${username}: ${link}`;
}

export function buildProgressShareText(params: {
  name: string;
  username: string;
  monthPrefix: string;
  monthEffort: number | null;
  activeDays: number;
  streak: number;
}): string {
  const effortStr =
    params.monthEffort !== null ? `${params.monthEffort}/100` : "Calibrating";
  const link = getInviteUrl(params.username);
  return `Honest Reps · ${params.monthPrefix}\n${params.name} (@${params.username})\nMonth Effort: ${effortStr} | ${params.activeDays} active days | ${params.streak}d streak\n\nJoin me: ${link}`;
}

export function getWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function openWhatsAppShare(text: string): void {
  const url = getWhatsAppShareUrl(text);
  window.open(url, "_blank", "noopener,noreferrer");
}
