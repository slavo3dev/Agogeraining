import { createAnalytics } from "./analytics-core";
import { onPlatform } from "./platform";
export type { AnalyticsEvent } from "./analytics-core";

export const analytics = createAnalytics(null);
export const track = analytics.track.bind(analytics);
// Dev builds log to the console; no vendor SDK is wired yet.
// eslint-disable-next-line no-console
onPlatform((p) => { if (p.isDev) analytics.setSink((e, props) => console.log(`[analytics] ${e}`, props)); });
