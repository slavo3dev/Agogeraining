import { createAnalytics } from "./analytics-core";
export type { AnalyticsEvent } from "./analytics-core";

// eslint-disable-next-line no-console
export const analytics = createAnalytics(__DEV__ ? (e, p) => console.log(`[analytics] ${e}`, p) : null);
export const track = analytics.track.bind(analytics);
