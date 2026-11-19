// Seeds spotlight_dev with fictional companies and people. Never real staff.
// Run: npm run db:seed
import * as dotenv from "dotenv"
dotenv.config({ path: process.env.SPOTLIGHT_ENV_FILE ?? ".env.development.local", quiet: true })

import { assertSafeDatabaseEnv } from "../lib/dbGuard"
assertSafeDatabaseEnv("the seed script")

async function main() {
  const { seedDemoData } = await import("../lib/seed/demo")
  const summary = await seedDemoData()
  console.log("Seeded:", summary)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
