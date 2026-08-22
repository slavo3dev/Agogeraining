/** Build an href with query params (the web equivalent of expo-router's `{ pathname, params }`). */
export function href(pathname: string, params?: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}
