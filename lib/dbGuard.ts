// Database safety guard.
//
// Off Vercel (your laptop, CI, scripts, tests), Spotlight refuses to start the
// app, run migrations, seeds or tests unless DATABASE_URL (and DIRECT_URL, if
// set) points at a local Postgres database named spotlight_dev or
// spotlight_test. This exists because .env.local on the original machine held
// the production Supabase URL, and prisma.config.ts used to load it.
//
// On a real Vercel deployment (VERCEL=1 and VERCEL_ENV production|preview) the
// guard steps aside: those environments are configured in the Vercel dashboard.
//
// Plain module (no "use server"), no imports, so it can run from
// next.config.ts, prisma.config.ts, scripts and tests.

export const ALLOWED_LOCAL_DATABASES = ["spotlight_dev", "spotlight_test"] as const
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

type Env = Record<string, string | undefined>

export type GuardResult = { ok: true; reason: string } | { ok: false; reason: string }

export function isManagedDeployment(env: Env): boolean {
  return env.VERCEL === "1" && (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview")
}

export function checkUrl(name: string, raw: string | undefined): GuardResult {
  if (!raw) return { ok: false, reason: `${name} is not set.` }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: `${name} is not a valid URL.` }
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return { ok: false, reason: `${name} must be a postgres:// URL.` }
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    return { ok: false, reason: `${name} host "${url.hostname}" is not localhost.` }
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""))
  if (!(ALLOWED_LOCAL_DATABASES as readonly string[]).includes(dbName)) {
    return {
      ok: false,
      reason: `${name} database "${dbName}" is not one of ${ALLOWED_LOCAL_DATABASES.join(", ")}.`,
    }
  }
  return { ok: true, reason: `${name} -> ${url.hostname}/${dbName}` }
}

export function checkDatabaseEnv(env: Env): GuardResult {
  if (isManagedDeployment(env)) {
    return { ok: true, reason: `managed Vercel ${env.VERCEL_ENV} deployment` }
  }
  const main = checkUrl("DATABASE_URL", env.DATABASE_URL)
  if (!main.ok) return main
  if (env.DIRECT_URL) {
    const direct = checkUrl("DIRECT_URL", env.DIRECT_URL)
    if (!direct.ok) return direct
  }
  return main
}

export function assertSafeDatabaseEnv(context: string, env: Env = process.env): void {
  const result = checkDatabaseEnv(env)
  if (!result.ok) {
    throw new Error(
      `[spotlight db guard] Refusing to run ${context}: ${result.reason} ` +
        `Off Vercel, DATABASE_URL must point at localhost and one of: ` +
        `${ALLOWED_LOCAL_DATABASES.join(", ")}. Put local settings in .env.development.local.`
    )
  }
}
