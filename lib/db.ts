import { PrismaClient } from "@/app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { assertSafeDatabaseEnv } from "@/lib/dbGuard"

// Refuse to connect anywhere but spotlight_dev / spotlight_test off Vercel.
assertSafeDatabaseEnv("the app database client")

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function makeClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

// UNSCOPED client. Sees every company. Only a short allowlist of files may
// import it (see tests/unscoped-db.test.ts). Everything else must use
// scopedDb(companyId) from lib/tenant.ts.
export const db = globalForPrisma.prisma ?? makeClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
