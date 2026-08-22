"use client";
import "../src/platform"; // must run first: wires storage/Supabase into @agogeraining/app-core
import { analytics, bootstrapSession, draftQueue, getApi, queryClient, useRewards, useSession } from "@agogeraining/app-core";
import { QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import React, { Suspense, useEffect } from "react";
import { RewardModal } from "../src/components/game";
import { AppText } from "../src/components/ui";
import { NavBar } from "../src/components/NavBar";
import { loadPrefs, usePrefs } from "../src/theme";

const AUTH_ROUTES = ["/welcome", "/sign-in"];

/** Same routing rules as the mobile root layout: signed out → welcome, no profile → onboarding, else the app. */
function Gate({ children }: { children: React.ReactNode }) {
  const { ready, mode, hasProfile, setHasProfile } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const scheme = usePrefs((s) => s.scheme);
  const reduced = usePrefs((s) => s.reducedMotionOverride);

  useEffect(() => { loadPrefs(); void bootstrapSession(); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = scheme;
    document.documentElement.classList.toggle("reduce-motion", reduced);
  }, [scheme, reduced]);

  useEffect(() => {
    if (mode === "none" || hasProfile !== null) return;
    getApi().hasProfile().then(setHasProfile).catch(() => setHasProfile(false));
  }, [mode, hasProfile, setHasProfile]);

  const onAuth = AUTH_ROUTES.includes(pathname);
  useEffect(() => {
    if (!ready) return;
    if (mode === "none") { if (!onAuth) router.replace("/welcome"); return; }
    if (hasProfile === null) return;
    if (!hasProfile) { if (pathname !== "/onboarding") router.replace("/onboarding"); return; }
    if (onAuth || pathname === "/onboarding") router.replace("/");
  }, [ready, mode, hasProfile, pathname, onAuth, router]);

  // Restore the analytics consent (off unless the player opted in).
  useEffect(() => {
    if (mode === "none" || !hasProfile) { analytics.setOptIn(false); return; }
    getApi().getSettings().then((st) => analytics.setOptIn(st.analyticsOptIn)).catch(() => analytics.setOptIn(false));
  }, [mode, hasProfile]);

  // Retry offline workout drafts on load, when the tab regains focus and when the network returns.
  useEffect(() => {
    if (mode === "none" || !hasProfile) return;
    const sync = () => draftQueue.flush().then((r) => { if (r.synced) { useRewards.getState().show(r.newRewards); void queryClient.invalidateQueries(); } }).catch(() => undefined);
    void sync();
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", sync);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", sync); };
  }, [mode, hasProfile]);

  const waiting = !ready || (mode !== "none" && hasProfile === null)
    || (mode === "none" && !onAuth) || (mode !== "none" && hasProfile === false && pathname !== "/onboarding")
    || (mode !== "none" && hasProfile === true && (onAuth || pathname === "/onboarding"));
  if (waiting) {
    return <div className="center" style={{ minHeight: "100vh" }}><span className="spinner" /><AppText muted>Preparing your training ground…</AppText></div>;
  }
  const inApp = mode !== "none" && hasProfile === true;
  return (
    <div className="shell">
      {inApp ? <NavBar /> : null}
      {children}
      <RewardModal />
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}><Gate>{children}</Gate></Suspense>
    </QueryClientProvider>
  );
}
