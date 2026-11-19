import type { NextConfig } from "next";
import { assertSafeDatabaseEnv } from "./lib/dbGuard";

// Refuse to start `next dev` / `next build` / `next start` off Vercel unless the
// database is local spotlight_dev or spotlight_test.
assertSafeDatabaseEnv("Next.js");

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
