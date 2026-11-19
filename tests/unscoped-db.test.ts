// Static guard: the unscoped Prisma client (lib/db.ts) sees every company.
// Only these files may import it. Anything new must use requireActor().db /
// scopedDb(companyId), or be added here with a reason.
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const ALLOWED: Record<string, string> = {
  "auth.ts": "sign-in identity resolution (no tenant yet)",
  "lib/tenant.ts": "loads the actor's own row to learn their company",
  "lib/scopedDb.ts": "builds the scoped client",
  "lib/brandContext.ts": "reads Company branding (name/logo/color only)",
  "lib/syncBambooHR.ts": "reads the Company row, then writes via scopedDb",
  "lib/allowanceReset.ts": "cron: iterates companies, writes via scopedDb",
  "lib/seed/demo.ts": "local seed only",
  "app/actions/platform.ts": "platform owner, cross-company by design",
  "app/actions/adminPeople.ts": "changeRole is platform-owner only, cross-company",
  "app/platform/page.tsx": "platform owner page",
  "app/api/chat/route.ts": "Chat identity lookup by verified email",
  "app/api/cron/sync-bamboo/route.ts": "cron: lists companies with BambooHR on",
  "app/api/cron/keep-warm/route.ts": "cron: SELECT 1 only",
  "app/components/auth/DevLoginForm.tsx": "local dev login only",
  "scripts/sync-bamboohr.ts": "CLI resolves a company by slug",
  "scripts/dev-session.ts": "local-only session cookie for smoke tests (guarded)",
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "generated" || name.startsWith(".")) continue
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe("unscoped db import allowlist", () => {
  it("only allowlisted files import lib/db", () => {
    const root = process.cwd()
    const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "lib")), ...walk(path.join(root, "scripts")), path.join(root, "auth.ts")]
    const offenders = files
      .filter((f) => /from\s+["'](@\/lib\/db|\.\.?\/(\.\.\/)*lib\/db|\.\/db)["']|import\(["'](\.\.\/)+lib\/db["']\)/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f))
      .filter((f) => f !== "lib/db.ts" && !(f in ALLOWED))
    expect(offenders).toEqual([])
  })
})
