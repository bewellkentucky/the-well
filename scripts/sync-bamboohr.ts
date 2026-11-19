import * as dotenv from "dotenv"
dotenv.config({ path: ".env.development.local", quiet: true })

import { assertSafeDatabaseEnv } from "../lib/dbGuard"
assertSafeDatabaseEnv("the BambooHR sync script")

// Usage: npm run sync-bamboo -- --company=<slug> [--full] [--since=2026-01-01T00:00:00Z]
async function main() {
  const { db } = await import("../lib/db")
  const { syncBambooHR } = await import("../lib/syncBambooHR")
  const args = process.argv.slice(2)
  const slug = args.find((a) => a.startsWith("--company="))?.replace("--company=", "")
  if (!slug) throw new Error("Pass --company=<slug>.")
  const company = await db.company.findUnique({ where: { slug }, select: { id: true } })
  if (!company) throw new Error(`No company with slug ${slug}.`)
  const sinceArg = args.find((a) => a.startsWith("--since="))
  const result = await syncBambooHR(company.id, {
    force: args.includes("--full"),
    since: sinceArg ? new Date(sinceArg.replace("--since=", "")) : undefined,
  })
  console.log(`Sync complete: ${result.created} created, ${result.enriched} enriched, ${result.skipped} skipped, ${result.errors} errors (${result.total} total)`)
  process.exit(result.errors > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
