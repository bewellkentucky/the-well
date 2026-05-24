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

// Parse a date-only string "YYYY-MM-DD" as noon UTC so no timezone ever shifts
// the day. new Date("YYYY-MM-DD") parses as UTC midnight which becomes the previous
// day in US timezones — storing at noon UTC is safe everywhere.
function parseBambooDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
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
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`BambooHR ${res.status}: ${body || "(empty body)"}`)
  }
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

  // BambooHR /employees/changed requires YYYY-MM-DDTHH:MM:SSZ — no milliseconds.
  // toISOString() produces ...000Z which BambooHR rejects with 400.
  const sinceIso = since?.toISOString().replace(/\.\d{3}Z$/, "Z")

  const employeeIds: string[] = since
    ? Object.keys(
        (await bamboo(`/employees/changed?since=${sinceIso}&type=updated`))
          .employees ?? {}
      )
    : (await bamboo("/employees/directory")).employees.map((e: any) => String(e.id))

  console.log(
    `BambooHR sync: ${sinceIso ? `incremental since ${sinceIso}` : "full"} — ${employeeIds.length} employees`
  )

  let created  = 0
  let enriched = 0
  let skipped  = 0
  let errors   = 0

  for (const id of employeeIds) {
    try {
      const emp = await bamboo(`/employees/${id}?fields=${FIELDS}`)
      if (!emp.workEmail) {
        console.log(`  skip (no workEmail): Bamboo id ${id}`)
        skipped++
        continue
      }

      const email = (emp.workEmail as string).toLowerCase()

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

      const user = await getDb().user.findUnique({ where: { email } })

      if (!user) {
        // Pre-populate — makes the employee recognizable in the app before they sign in.
        // googleId stays null until they log in via Google OAuth, which fills it in.
        await getDb().user.create({
          data: {
            email,
            fullName:         fullName ?? email,
            domain:           "bewellkentucky.com",
            bambooId:         emp.id                  ? String(emp.id)                   : undefined,
            title:            emp.jobTitle                                                || undefined,
            department:       emp.department                                              || undefined,
            location:         emp.location                                                || undefined,
            reportsTo,
            hireDate:         emp.hireDate    ? parseBambooDate(emp.hireDate)    : undefined,
            birthday:         emp.dateOfBirth ? parseBambooDate(emp.dateOfBirth) : undefined,
            employmentStatus: emp.employmentHistoryStatus                                 || undefined,
          },
        })
        console.log(`  created: ${email}`)
        created++
        continue
      }

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
          hireDate:         emp.hireDate    ? parseBambooDate(emp.hireDate)    : undefined,
          birthday:         emp.dateOfBirth ? parseBambooDate(emp.dateOfBirth) : undefined,
          employmentStatus: emp.employmentHistoryStatus                   || undefined,
        },
      })
      console.log(`  enriched: ${email}`)
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
      recordsProcessed: created + enriched,
      errors,
      notes:            `${sinceIso ? `incremental since ${sinceIso}` : "full sync"} — ${created} created, ${enriched} enriched`,
    },
  })

  return { created, enriched, skipped, errors, total: employeeIds.length }
}
