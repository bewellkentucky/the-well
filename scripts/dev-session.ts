// Local only: print an Auth.js session cookie for a seeded person, for
// smoke-testing pages with curl. Refuses unless the DB guard passes.
// Usage: npx tsx scripts/dev-session.ts <email>
import * as dotenv from "dotenv"
dotenv.config({ path: ".env.development.local", quiet: true })
import { assertSafeDatabaseEnv } from "../lib/dbGuard"
assertSafeDatabaseEnv("dev-session")

async function main() {
  const { encode } = await import("next-auth/jwt")
  const { db } = await import("../lib/db")
  const email = process.argv[2]
  const user = await db.user.findUnique({ where: { email }, select: { id: true, fullName: true } })
  if (!user) throw new Error(`No user ${email}`)
  const salt = "authjs.session-token"
  const token = await encode({
    salt,
    secret: process.env.AUTH_SECRET!,
    token: { sub: user.id, userId: user.id, name: user.fullName, email },
  })
  process.stdout.write(`${salt}=${token}`)
  process.exit(0)
}
main().catch((e) => { console.error(e.message); process.exit(1) })
