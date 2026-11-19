// Empties every table in a guarded local database (spotlight_dev / spotlight_test).
// Used by the test harness and `npm run db:reset`. Never runs anywhere else:
// it calls the guard itself and additionally refuses managed deployments.
import { Client } from "pg"
import { assertSafeDatabaseEnv, isManagedDeployment } from "./dbGuard"

export async function truncateAllTables(env: Record<string, string | undefined> = process.env) {
  if (isManagedDeployment(env)) throw new Error("[spotlight db guard] truncate refused on Vercel.")
  assertSafeDatabaseEnv("table truncation", { DATABASE_URL: env.DATABASE_URL })
  const client = new Client({ connectionString: env.DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`
    )
    if (rows.length > 0) {
      const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ")
      await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
    }
    return rows.length
  } finally {
    await client.end()
  }
}
