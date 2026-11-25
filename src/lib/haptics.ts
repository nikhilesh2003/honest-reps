"use client";

// Universal Haptic Engine for iOS (iPhone WebKit/PWA) and Android
export type HapticStyle =
  | "light"
  | "medium"
  | "heavy"
  | "success"
  | "warning"
  | "error"
  | "selection";

const HAPTICS_PREF_KEY = "hr_haptics_enabled";

let switchInputElement: HTMLInputElement | null = null;
let switchLabelElement: HTMLLabelElement | null = null;

export function isHapticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(HAPTICS_PREF_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HAPTICS_PREF_KEY, String(enabled));
  } catch {
    // Ignore storage quota/privacy mode errors
  }
}

/**
 * iOS WebKit Switch Trigger:
 * iOS 17.4+ Safari / WebKit may fire the native Taptic Engine when a <label>
 * linked to a rendered <input type="checkbox" switch> is .click()ed
 * synchronously inside a user gesture.
 */
function triggerIosSwitchHaptic(): void {
  if (typeof document === "undefined" || !document.body) return;
  try {
    if (!switchInputElement || !switchLabelElement || !document.body.contains(switchLabelElement)) {
      const id = "hr-ios-haptic-switch";

      const input = document.createElement("input");
      input.id = id;
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.setAttribute("aria-hidden", "true");
      input.tabIndex = -1;
      input.style.appearance = "auto";

      const label = document.createElement("label");
      label.htmlFor = id;
      label.setAttribute("aria-hidden", "true");
      label.style.position = "fixed";
      label.style.top = "0";
      label.style.left = "0";
      label.style.width = "1px";
      label.style.height = "1px";
      label.style.overflow = "hidden";
      label.style.clipPath = "inset(50%)";
      label.style.opacity = "0.01";

      label.appendChild(input);
      document.body.appendChild(label);

      switchInputElement = input;
      switchLabelElement = label;
    }
    switchLabelElement.click();
  } catch {
    // Non-blocking fallback
  }
}

const androidPatterns: Record<HapticStyle, number | number[]> = {
  light: 20,
  selection: 16,
  medium: 32,
  heavy: 55,
  success: [20, 50, 28],
  warning: [30, 50, 30],
  error: [45, 35, 45],
};

export function triggerHaptic(style: HapticStyle = "light"): boolean {
  if (typeof window === "undefined") return false;
  if (!isHapticsEnabled()) return false;

  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  let triggered = false;

  // 1. Android & Standard Vibration API
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      triggered = navigator.vibrate(androidPatterns[style]);
    } catch {
      // Ignored if device blocks programmatic vibration
    }
  }

  // 2. iOS Taptic Engine Switch Trigger (best-effort WebKit workaround)
  if (isIos) {
    triggerIosSwitchHaptic();
    triggered = true;
  }

  return triggered;
}

export function stopHaptics(): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(0);
    } catch {
      // Ignore
    }
  }
}

export const haptics = {
  isSupported(): boolean {
    if (typeof window === "undefined") return false;
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return (
      isIos ||
      (typeof navigator !== "undefined" && typeof navigator.vibrate === "function")
    );
  },
  isEnabled: isHapticsEnabled,
  setEnabled: setHapticsEnabled,
  trigger: triggerHaptic,
  light: () => triggerHaptic("light"),
  medium: () => triggerHaptic("medium"),
  heavy: () => triggerHaptic("heavy"),
  selection: () => triggerHaptic("selection"),
  success: () => triggerHaptic("success"),
  warning: () => triggerHaptic("warning"),
  error: () => triggerHaptic("error"),
  stop: stopHaptics,
};

export const hapticLight = () => triggerHaptic("light");
export const hapticMedium = () => triggerHaptic("medium");
export const hapticHeavy = () => triggerHaptic("heavy");
export const hapticSuccess = () => triggerHaptic("success");
export const hapticSelection = () => triggerHaptic("selection");
export const hapticWarning = () => triggerHaptic("warning");
export const hapticError = () => triggerHaptic("error");
