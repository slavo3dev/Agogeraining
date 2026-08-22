import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The floating dev badge sits on top of the phone-width bottom tab bar; build/runtime errors still show as an overlay.
  devIndicators: false,
  // Workspace packages ship TypeScript source; Next compiles them like app code.
  transpilePackages: [
    "@agogeraining/app-core", "@agogeraining/campaigns", "@agogeraining/challenges", "@agogeraining/design-tokens",
    "@agogeraining/game-engine", "@agogeraining/shared-types", "@agogeraining/training",
  ],
  turbopack: { root: path.join(__dirname, "../..") },
  outputFileTracingRoot: path.join(__dirname, "../.."),
};
export default config;
