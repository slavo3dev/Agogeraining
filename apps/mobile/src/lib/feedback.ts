import * as Haptics from "expo-haptics";
import { usePrefs } from "../theme";

export function tap() { if (usePrefs.getState().haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); }
export function celebrate() { if (usePrefs.getState().haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); }
