// BambooHR: optional, READ-ONLY connection per company. Only GET requests are
// ever sent to Bamboo. Google sign-in creates people; Bamboo pre-creates and
// enriches them. Use undefined (not null) for missing Bamboo fields so a
// blank in Bamboo never wipes data.
//
// Tenant safety: runs for exactly one company, writes only through that
// company's scoped client, and skips any employee whose work email domain is
// not one of that company's sign-in domains.
import { db } from "@/lib/db"
import { scopedDb } from "@/lib/scopedDb"
import { ActionError } from "@/lib/errors"

/** Env var holding a company's BambooHR API key, e.g. BAMBOOHR_API_KEY_LCED. */
export function bambooKeyEnvName(slug: string): string {
  return `BAMBOOHR_API_KEY_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`
}

/** Pure: may this Bamboo employee be written into this company? */
export function employeeDomainAllowed(workEmail: string, companyDomains: string[]): boolean {
  const domain = workEmail.toLowerCase().split("@")[1]
  return !!domain && companyDomains.map((d) => d.toLowerCase()).includes(domain)
}

// Parse "YYYY-MM-DD" as noon UTC so no timezone ever shifts the day.
function parseBambooDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
}

const FIELDS = [
  "id", "workEmail", "firstName", "lastName", "preferredName",
  "jobTitle", "department", "location", "reportsTo",
  "hireDate", "dateOfBirth", "employmentHistoryStatus",
].join(",")

type BambooConn = { base: string; auth: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped third-party JSON
async function bambooGet(conn: BambooConn, path: string, attempt = 0): Promise<any> {
  const res = await fetch(`${conn.base}${path}`, {
    method: "GET",
    headers: { Authorization: conn.auth, Accept: "application/json" },
  })
  // BambooHR returns 503 (not 429) for rate limits
  if (res.status === 503 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 30_000))
    return bambooGet(conn, path, attempt + 1)
  }
  if (!res.ok) throw new Error(`BambooHR HTTP ${res.status}`)
  return res.json()
}

export async function syncBambooHR(companyId: string, opts: { since?: Date; force?: boolean } = {}) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { slug: true, bambooEnabled: true, bambooSubdomain: true, allowanceAmount: true, domains: { select: { domain: true } } },
  })
  if (!company) throw new ActionError("Company not found.")
  // Runs for closed companies too (launch switch, decided 2026-11-19): it is
  // read-only GETs from Bamboo and sends nothing to staff. People it creates
  // or updates are never admins or testers, so they still can't sign in.
  if (!company.bambooEnabled || !company.bambooSubdomain) {
    throw new ActionError("BambooHR is not connected for this company.")
  }
  const keyName = bambooKeyEnvName(company.slug)
  const apiKey = process.env[keyName]
  if (!apiKey) throw new ActionError(`BambooHR key is not configured (${keyName}).`)

  const conn: BambooConn = {
    base: `https://api.bamboohr.com/api/gateway.php/${encodeURIComponent(company.bambooSubdomain)}/v1`,
    auth: "Basic " + Buffer.from(`${apiKey}:x`).toString("base64"),
  }
  const domains = company.domains.map((d) => d.domain)
  const sdb = scopedDb(companyId)

  const lastSync = opts.force
    ? undefined
    : opts.since ??
      (await sdb.integrationSync.findFirst({ where: { source: "bamboohr" }, orderBy: { lastRunAt: "desc" } }))?.lastRunAt
  // Bamboo wants YYYY-MM-DDTHH:MM:SSZ (no milliseconds).
  const sinceIso = lastSync?.toISOString().replace(/\.\d{3}Z$/, "Z")

  const employeeIds: string[] = sinceIso
    ? Object.keys((await bambooGet(conn, `/employees/changed?since=${sinceIso}&type=updated`)).employees ?? {})
    : ((await bambooGet(conn, "/employees/directory")).employees as { id: string | number }[]).map((e) => String(e.id))

  let created = 0, enriched = 0, skipped = 0, errors = 0

  for (const id of employeeIds) {
    try {
      const emp = await bambooGet(conn, `/employees/${encodeURIComponent(id)}?fields=${FIELDS}`)
      if (!emp.workEmail) { skipped++; continue }
      const email = String(emp.workEmail).toLowerCase()
      if (!employeeDomainAllowed(email, domains)) { skipped++; continue }

      const reportsTo =
        typeof emp.reportsTo === "string" && emp.reportsTo
          ? emp.reportsTo
          : typeof emp.reportsTo === "object" && emp.reportsTo
            ? (emp.reportsTo.displayName as string) ?? undefined
            : undefined
      const fullName = emp.preferredName
        ? `${emp.preferredName} ${emp.lastName}`
        : emp.firstName && emp.lastName ? `${emp.firstName} ${emp.lastName}` : undefined

      const fieldsData = {
        bambooId: emp.id ? String(emp.id) : undefined,
        title: emp.jobTitle || undefined,
        department: emp.department || undefined,
        location: emp.location || undefined,
        reportsTo,
        hireDate: emp.hireDate ? parseBambooDate(emp.hireDate) : undefined,
        birthday: emp.dateOfBirth ? parseBambooDate(emp.dateOfBirth) : undefined,
        employmentStatus: emp.employmentHistoryStatus || undefined,
      }

      const user = await sdb.user.findFirst({ where: { email }, select: { id: true } })
      if (!user) {
        // Pre-create so they're recognizable before first sign-in. googleId
        // stays null until Google sign-in links it.
        await sdb.user.create({
          data: { companyId, email, fullName: fullName ?? email, givingBalance: company.allowanceAmount, ...fieldsData },
        })
        created++
        continue
      }
      await sdb.user.updateMany({ where: { id: user.id }, data: { fullName: fullName ?? undefined, ...fieldsData } })
      enriched++
    } catch {
      console.error(`BambooHR sync: error on employee ${id}`)
      errors++
    }
  }

  await sdb.integrationSync.create({
    data: {
      companyId,
      source: "bamboohr",
      lastRunAt: new Date(),
      recordsProcessed: created + enriched,
      errors,
      notes: `${sinceIso ? `incremental since ${sinceIso}` : "full sync"}: ${created} created, ${enriched} enriched, ${skipped} skipped`,
    },
  })

  return { created, enriched, skipped, errors, total: employeeIds.length }
}
