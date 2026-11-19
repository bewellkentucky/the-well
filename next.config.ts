import type { NextConfig } from "next";
import path from "node:path";
import { assertSafeDatabaseEnv } from "./lib/dbGuard";

// Refuse to start `next dev` / `next build` / `next start` off Vercel unless the
// database is local spotlight_dev or spotlight_test.
assertSafeDatabaseEnv("Next.js");

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without it, a package-lock.json in
  // the home folder made Turbopack treat the whole home folder as the
  // workspace (thousands of PostCSS workers, dev server hang).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
