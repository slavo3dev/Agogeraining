import { BRAND } from "@agogeraining/design-tokens";
import type { Metadata, Viewport } from "next";
import React from "react";
import { themeCss } from "../src/theme";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = { title: BRAND.name, description: BRAND.tagline };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0D1016" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head><style dangerouslySetInnerHTML={{ __html: themeCss }} /></head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
