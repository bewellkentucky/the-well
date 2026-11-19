import { describe, it, expect } from "vitest"
import { checkDatabaseEnv, assertSafeDatabaseEnv } from "@/lib/dbGuard"

const ok = (env: Record<string, string>) => checkDatabaseEnv(env).ok

describe("database guard", () => {
  it("accepts localhost spotlight_dev and spotlight_test", () => {
    expect(ok({ DATABASE_URL: "postgresql://me@localhost:5432/spotlight_dev" })).toBe(true)
    expect(ok({ DATABASE_URL: "postgres://127.0.0.1/spotlight_test" })).toBe(true)
    expect(ok({ DATABASE_URL: "postgresql://[::1]:5432/spotlight_test" })).toBe(true)
  })

  it("refuses remote hosts", () => {
    expect(ok({ DATABASE_URL: "postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres" })).toBe(false)
    expect(ok({ DATABASE_URL: "postgresql://u:p@db.abc.supabase.co:5432/spotlight_dev" })).toBe(false)
  })

  it("refuses other local database names", () => {
    expect(ok({ DATABASE_URL: "postgresql://localhost/postgres" })).toBe(false)
    expect(ok({ DATABASE_URL: "postgresql://localhost/lced" })).toBe(false)
    expect(ok({ DATABASE_URL: "postgresql://localhost/spotlight_dev_copy" })).toBe(false)
  })

  it("refuses missing or malformed URLs", () => {
    expect(ok({})).toBe(false)
    expect(ok({ DATABASE_URL: "not a url" })).toBe(false)
    expect(ok({ DATABASE_URL: "mysql://localhost/spotlight_dev" })).toBe(false)
  })

  it("checks DIRECT_URL too", () => {
    expect(ok({
      DATABASE_URL: "postgresql://localhost/spotlight_dev",
      DIRECT_URL: "postgresql://u:p@db.abc.supabase.co:5432/postgres",
    })).toBe(false)
  })

  it("only steps aside on real Vercel production/preview", () => {
    const remote = "postgresql://u:p@db.abc.supabase.co:5432/postgres"
    expect(ok({ VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL: remote })).toBe(true)
    expect(ok({ VERCEL: "1", VERCEL_ENV: "preview", DATABASE_URL: remote })).toBe(true)
    expect(ok({ VERCEL: "1", VERCEL_ENV: "development", DATABASE_URL: remote })).toBe(false)
    expect(ok({ VERCEL_ENV: "production", DATABASE_URL: remote })).toBe(false)
  })

  it("assert throws with a clear message", () => {
    expect(() => assertSafeDatabaseEnv("x", { DATABASE_URL: "postgresql://h.example.com/postgres" }))
      .toThrow(/spotlight db guard/)
  })
})
