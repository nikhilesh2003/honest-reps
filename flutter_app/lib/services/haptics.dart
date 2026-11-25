import 'package:flutter/services.dart';

enum HapticType {
  light,
  medium,
  heavy,
  selection,
  success,
  warning,
  error,
}

/// Native haptic feedback service using Flutter's built-in [HapticFeedback],
/// which maps directly to iOS Taptic Engine and Android vibration hardware.
class HapticService {
  HapticService._();

  static bool enabled = true;

  static Future<void> trigger(HapticType type) async {
    if (!enabled) return;

    switch (type) {
      case HapticType.light:
        await HapticFeedback.lightImpact();
        break;
      case HapticType.medium:
        await HapticFeedback.mediumImpact();
        break;
      case HapticType.heavy:
        await HapticFeedback.heavyImpact();
        break;
      case HapticType.selection:
        await HapticFeedback.selectionClick();
        break;
      case HapticType.success:
        await HapticFeedback.mediumImpact();
        await Future<void>.delayed(const Duration(milliseconds: 65));
        await HapticFeedback.lightImpact();
        break;
      case HapticType.warning:
        await HapticFeedback.heavyImpact();
        await Future<void>.delayed(const Duration(milliseconds: 70));
        await HapticFeedback.mediumImpact();
        break;
      case HapticType.error:
        await HapticFeedback.vibrate();
        break;
    }
  }

  static Future<void> light() => trigger(HapticType.light);
  static Future<void> medium() => trigger(HapticType.medium);
  static Future<void> heavy() => trigger(HapticType.heavy);
  static Future<void> selection() => trigger(HapticType.selection);
  static Future<void> success() => trigger(HapticType.success);
  static Future<void> warning() => trigger(HapticType.warning);
  static Future<void> error() => trigger(HapticType.error);
}
