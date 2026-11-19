import { execSync } from "node:child_process"
import { loadTestEnv } from "./loadTestEnv"
import { truncateAllTables } from "@/lib/devTruncate"

export default async function setup() {
  loadTestEnv()
  // Empty spotlight_test first, then bring the schema up to date. The tables
  // are empty, so --accept-data-loss only drops/alters empty tables.
  // prisma.config.ts re-checks the guard.
  await truncateAllTables()
  execSync("npx prisma db push --accept-data-loss", {
    stdio: "pipe",
    env: { ...process.env, SPOTLIGHT_ENV_FILE: ".env.test.local" },
  })
}
