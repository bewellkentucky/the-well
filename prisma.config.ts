import * as dotenv from "dotenv"
import { defineConfig } from "prisma/config"
import { assertSafeDatabaseEnv } from "./lib/dbGuard"

// Local settings only. Never .env.local (it held production values).
// SPOTLIGHT_ENV_FILE lets the test scripts point Prisma at .env.test.local.
dotenv.config({ path: process.env.SPOTLIGHT_ENV_FILE ?? ".env.development.local", quiet: true })

assertSafeDatabaseEnv("Prisma CLI (migrations / db push)")

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
