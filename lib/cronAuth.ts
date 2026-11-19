import { timingSafeEqual } from "node:crypto"

/** True only if CRON_SECRET is set and the request carries it as a Bearer token. */
export function isAuthorizedCron(authorizationHeader: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const got = Buffer.from(authorizationHeader ?? "")
  return got.length === expected.length && timingSafeEqual(got, expected)
}
