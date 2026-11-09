import { useSession } from "../session";
import { demoApi } from "./demo";
import { remoteApi } from "./remote";
import type { GameApi } from "./types";

export type { GameApi } from "./types";
export { ApiError } from "./types";
export { demoApi };

/** Resolve the active API. Non-React callers (draft sync) use this too. */
export function getApi(): GameApi {
  return useSession.getState().mode === "demo" ? demoApi : remoteApi;
}
export function useApi(): GameApi {
  const mode = useSession((s) => s.mode);
  return mode === "demo" ? demoApi : remoteApi;
}
