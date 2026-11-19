// Company-scoped Prisma client. See lib/tenant.ts for the rules.
// Kept separate from lib/tenant.ts so scripts can use it without importing
// the auth stack.
import { db } from "@/lib/db"
import { TenantError } from "@/lib/errors"

export const TENANT_MODELS = [
  "User",
  "Kudo",
  "PileOn",
  "Reaction",
  "Reward",
  "Redemption",
  "AllowanceReset",
  "TimeOff",
  "IntegrationSync",
  "Incentive",
  "IncentiveClaim",
  "AuditLog",
] as const

const TENANT_MODEL_SET = new Set<string>(TENANT_MODELS)

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
])

const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"])

type AnyArgs = Record<string, unknown> & {
  where?: Record<string, unknown>
  data?: unknown
  create?: Record<string, unknown>
}



function scopeArgs(companyId: string, operation: string, args: AnyArgs | undefined): AnyArgs {
  const a: AnyArgs = { ...(args ?? {}) }
  if (WHERE_OPS.has(operation)) {
    a.where = { ...(a.where ?? {}), companyId }
    // Never allow an update to move a row to another company.
    if ((operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") && a.data) {
      const data = { ...(a.data as Record<string, unknown>) }
      delete data.companyId
      delete data.company
      a.data = data
    }
    return a
  }
  if (CREATE_OPS.has(operation)) {
    if (Array.isArray(a.data)) {
      a.data = a.data.map((row) => ({ ...(row as object), companyId }))
    } else {
      a.data = { ...((a.data ?? {}) as object), companyId }
    }
    return a
  }
  if (operation === "upsert") {
    a.where = { ...(a.where ?? {}), companyId }
    a.create = { ...(a.create ?? {}), companyId }
    if (a.update) {
      const upd = { ...(a.update as Record<string, unknown>) }
      delete upd.companyId
      delete upd.company
      a.update = upd
    }
    return a
  }
  // Anything else on a tenant model is refused rather than silently unscoped.
  throw new TenantError(`Unscoped operation "${operation}" is not allowed on a tenant model.`)
}

export function scopedDb(companyId: string) {
  if (!companyId) throw new TenantError("scopedDb requires a companyId.")
  return db.$extends({
    name: `tenant:${companyId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODEL_SET.has(model)) return query(args)
          return query(scopeArgs(companyId, operation, args as AnyArgs) as typeof args)
        },
      },
    },
  })
}

export type ScopedDb = ReturnType<typeof scopedDb>
/** The transaction client handed to `scoped.$transaction(async (tx) => ...)`. */
export type ScopedTx = Parameters<Parameters<ScopedDb["$transaction"]>[0]>[0]

