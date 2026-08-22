"use client";
import { BRAND } from "@agogeraining/design-tokens";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";

/** Same five tabs as the mobile app. Bottom bar on phones, top bar on wider screens. */
export const TABS = [
  { href: "/", label: "Command", icon: "🛡", aria: "Home, Command Center" },
  { href: "/quests", label: "Quests", icon: "🏋", aria: "Quests" },
  { href: "/trials", label: "Trials", icon: "🏆", aria: "Trials" },
  { href: "/phalanx", label: "Phalanx", icon: "👥", aria: "Phalanx" },
  { href: "/profile", label: "Player", icon: "👤", aria: "Player" },
] as const;

export function NavBar() {
  const pathname = usePathname(); const router = useRouter();
  const isTab = TABS.some((t) => t.href === pathname);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {isTab ? <Link href="/" className="brand">{BRAND.name}</Link>
          : <button type="button" className="back btn ghost inline" style={{ minHeight: 40, padding: 0 }} onClick={() => router.back()}>← Back</button>}
        <nav className="tabs" aria-label="Main">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} aria-label={t.aria} aria-current={pathname === t.href ? "page" : undefined}>
              <span className="icon" aria-hidden>{t.icon}</span>{t.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
