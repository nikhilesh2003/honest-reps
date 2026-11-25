"use client";

import { useCallback } from "react";
import {
  haptics,
  HapticStyle,
  isHapticsEnabled,
  setHapticsEnabled,
} from "@/lib/haptics";

export function useHaptics() {
  const trigger = useCallback((type: HapticStyle = "light") => {
    return haptics.trigger(type);
  }, []);

  return {
    trigger,
    light: useCallback(() => haptics.light(), []),
    medium: useCallback(() => haptics.medium(), []),
    heavy: useCallback(() => haptics.heavy(), []),
    selection: useCallback(() => haptics.selection(), []),
    success: useCallback(() => haptics.success(), []),
    warning: useCallback(() => haptics.warning(), []),
    error: useCallback(() => haptics.error(), []),
    stop: useCallback(() => haptics.stop(), []),
    isSupported: useCallback(() => haptics.isSupported(), []),
    isEnabled: useCallback(() => isHapticsEnabled(), []),
    setEnabled: useCallback((enabled: boolean) => setHapticsEnabled(enabled), []),
  };
}
