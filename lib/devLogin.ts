// Local-only "sign in as a seeded person" for checking layouts without Google.
// Enabled only when ALL are true: SPOTLIGHT_DEV_LOGIN=1, NODE_ENV=development
// (next dev), not on Vercel, and the database guard passes (local
// spotlight_dev / spotlight_test). A production build always has
// NODE_ENV=production, so this can never switch on in a deployed app.
import { checkDatabaseEnv } from "@/lib/dbGuard"

export function devLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (
    env.SPOTLIGHT_DEV_LOGIN === "1" &&
    env.NODE_ENV === "development" &&
    !env.VERCEL &&
    checkDatabaseEnv({ DATABASE_URL: env.DATABASE_URL, DIRECT_URL: env.DIRECT_URL }).ok
  )
}
