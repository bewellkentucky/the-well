import * as dotenv from "dotenv"
import { assertSafeDatabaseEnv } from "@/lib/dbGuard"

// Tests only ever read .env.test.local, and only ever touch spotlight_test.
export function loadTestEnv() {
  dotenv.config({ path: ".env.test.local", override: true, quiet: true })
  assertSafeDatabaseEnv("the test suite")
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1)
  if (name !== "spotlight_test") {
    throw new Error(`[spotlight db guard] Tests must use spotlight_test, got "${name}".`)
  }
}
