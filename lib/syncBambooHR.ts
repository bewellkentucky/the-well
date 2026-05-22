import { PrismaClient } from "@/app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

// Lazy Prisma instance — reads DATABASE_URL at call time so this module can be
// statically imported before dotenv.config() runs (esbuild hoists static imports).
let _db: PrismaClient | undefined
function getDb(): PrismaClient {
  if (!_db) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    _db = new PrismaClient({ adapter })
  }
  return _db
}

// Field aliases confirmed via /v1/meta/fields on 2026-05-22
const FIELDS = [
  "id", "workEmail", "firstName", "lastName", "preferredName",
  "jobTitle", "department", "location", "reportsTo",
  "hireDate", "dateOfBirth", "employmentHistoryStatus",
].join(",")

// Read env vars lazily so this module can be imported before dotenv.config() runs
function bambooConfig() {
  const subdomain = process.env.BAMBOOHR_SUBDOMAIN!
  const apiKey = process.env.BAMBOOHR_API_KEY!
  return {
    base: `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1`,
    auth: "Basic " + Buffer.from(`${apiKey}:x`).toString("base64"),
  }
}

async function bamboo(path: string): Promise<any> {
  const { base, auth } = bambooConfig()
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: auth, Accept: "application/json" },
  })
  // BambooHR returns 503 (not 429) for rate limits
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 30_000))
    return bamboo(path)
  }
  if (!res.ok) throw new Error(`BambooHR ${res.status}: ${await res.text()}`)
  return res.json()
}

async function getLastSyncDate(): Promise<Date | undefined> {
  const last = await getDb().integrationSync.findFirst({
    where: { source: "bamboohr" },
    orderBy: { lastRunAt: "desc" },
  })
  return last?.lastRunAt ?? undefined
}

export async function syncBambooHR(opts: { since?: Date; force?: boolean } = {}) {
  const since = opts.force ? undefined : (opts.since ?? await getLastSyncDate())

  const employeeIds: string[] = since
    ? Object.keys(
        (await bamboo(`/employees/changed?since=${since.toISOString()}&type=updated`))
          .employees ?? {}
      )
    : (await bamboo("/employees/directory")).employees.map((e: any) => String(e.id))

  console.log(
    `BambooHR sync: ${since ? `incremental since ${since.toISOString()}` : "full"} — ${employeeIds.length} employees`
  )

  let enriched = 0
  let skipped = 0
  let errors = 0

  for (const id of employeeIds) {
    try {
      const emp = await bamboo(`/employees/${id}?fields=${FIELDS}`)
      if (!emp.workEmail) { skipped++; continue }

      const email = (emp.workEmail as string).toLowerCase()
      const user = await getDb().user.findUnique({ where: { email } })
      if (!user) {
        console.warn(`  skip: ${email} is in Bamboo but not in DB`)
        skipped++
        continue
      }

      // reportsTo comes back as a plain string (manager display name) or ""
      const reportsTo =
        typeof emp.reportsTo === "string" && emp.reportsTo
          ? emp.reportsTo
          : typeof emp.reportsTo === "object" && emp.reportsTo
            ? (emp.reportsTo.displayName as string) ?? undefined
            : undefined

      // preferredName wins over firstName for display
      const fullName = emp.preferredName
        ? `${emp.preferredName} ${emp.lastName}`
        : emp.firstName && emp.lastName
          ? `${emp.firstName} ${emp.lastName}`
          : undefined

      // Use undefined (not null) for absent fields — avoids wiping data Bamboo doesn't own
      await getDb().user.update({
        where: { id: user.id },
        data: {
          bambooId:         emp.id         ? String(emp.id)              : undefined,
          fullName:         fullName                                      ?? undefined,
          title:            emp.jobTitle                                  || undefined,
          department:       emp.department                                || undefined,
          location:         emp.location                                  || undefined,
          reportsTo,
          hireDate:         emp.hireDate    ? new Date(emp.hireDate)    : undefined,
          birthday:         emp.dateOfBirth ? new Date(emp.dateOfBirth) : undefined,
          employmentStatus: emp.employmentHistoryStatus                   || undefined,
        },
      })
      enriched++
    } catch (err) {
      console.error(`  error syncing Bamboo id ${id}:`, err)
      errors++
    }
  }

  await getDb().integrationSync.create({
    data: {
      id:               `bamboohr-${Date.now()}`,
      source:           "bamboohr",
      lastRunAt:        new Date(),
      recordsProcessed: enriched,
      errors,
      notes:            since ? `incremental since ${since.toISOString()}` : "full sync",
    },
  })

  return { enriched, skipped, errors, total: employeeIds.length }
}
