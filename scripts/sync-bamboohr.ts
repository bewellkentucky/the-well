import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { syncBambooHR } from "../lib/syncBambooHR"

async function main() {
  // Optional: pass --full to force a full sync even if a prior run exists
  // Optional: pass --since=2026-01-01T00:00:00Z to override the since date
  const args = process.argv.slice(2)
  const force = args.includes("--full")
  const sinceArg = args.find((a) => a.startsWith("--since="))
  const since = sinceArg ? new Date(sinceArg.replace("--since=", "")) : undefined

  const result = await syncBambooHR({ since, force })
  console.log(
    `\nSync complete: ${result.enriched} enriched, ${result.skipped} skipped, ${result.errors} errors (${result.total} total)`
  )
  process.exit(result.errors > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
