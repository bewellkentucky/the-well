// Google sign-in -> company. Replaces the old single ALLOWED_EMAIL_DOMAIN lock.
//
// Rules:
//  - Google must say the email is verified, and the `hd` (hosted domain) claim
//    must be one of the company's domains. `hd` is only present for Google
//    Workspace accounts, so a consumer Google account that happens to use a
//    company address is refused.
//  - Existing people are matched by Google account id (`sub`) FIRST, then by
//    email. When LCED's primary domain flips from bewellkentucky.com to
//    lcedky.com, the same Google account comes back with a new email; matching
//    on `sub` keeps the same row (and balances) and just updates the email.
//  - A person can never move between companies by signing in: the new email
//    domain must belong to the company they already belong to.
//  - Inactive people and inactive companies are refused.
//  - New people are created only when their domain maps to an active company.

import type { PrismaClient } from "@/app/generated/prisma/client"

export type GoogleProfileLike = {
  sub?: string | null
  email?: string | null
  email_verified?: boolean | null
  hd?: string | null
  name?: string | null
}

export type SignInDenied =
  | "missing_profile"
  | "email_unverified"
  | "not_workspace"
  | "unknown_domain"
  | "domain_mismatch"
  | "inactive"
  | "account_conflict"

export type SignInResult = { ok: true; userId: string; created: boolean } | { ok: false; reason: SignInDenied }

export const SIGN_IN_MESSAGES: Record<SignInDenied, string> = {
  missing_profile: "Google didn't send enough account details. Please try again.",
  email_unverified: "Your Google email address isn't verified.",
  not_workspace: "Please sign in with your work Google account.",
  unknown_domain: "Your organization isn't set up in Spotlight yet.",
  domain_mismatch: "That account doesn't match your organization in Spotlight. Ask your admin.",
  inactive: "Your Spotlight account is turned off. Ask your admin.",
  account_conflict: "There's a conflict with an existing account. Ask your admin.",
}

type Db = Pick<PrismaClient, "user" | "companyDomain" | "company">

export async function resolveGoogleSignIn(db: Db, profile: GoogleProfileLike | null | undefined): Promise<SignInResult> {
  const sub = profile?.sub?.trim()
  const email = profile?.email?.trim().toLowerCase()
  if (!sub || !email || !email.includes("@")) return { ok: false, reason: "missing_profile" }
  if (profile?.email_verified !== true) return { ok: false, reason: "email_unverified" }
  const hd = profile?.hd?.trim().toLowerCase()
  if (!hd) return { ok: false, reason: "not_workspace" }
  const domain = email.split("@")[1]
  const name = profile?.name?.trim() || undefined
  const now = new Date()

  // 1) Known Google account.
  const byGoogle = await db.user.findUnique({
    where: { googleId: sub },
    select: { id: true, email: true, active: true, companyId: true, company: { select: { active: true } } },
  })
  if (byGoogle) {
    const domains = await companyDomains(db, byGoogle.companyId)
    if (!domains.includes(domain) || !domains.includes(hd)) return { ok: false, reason: "domain_mismatch" }
    if (!byGoogle.active || !byGoogle.company.active) return { ok: false, reason: "inactive" }
    if (byGoogle.email !== email) {
      const holder = await db.user.findUnique({ where: { email }, select: { id: true } })
      if (holder && holder.id !== byGoogle.id) return { ok: false, reason: "account_conflict" }
    }
    await db.user.update({ where: { id: byGoogle.id }, data: { email, fullName: name, lastSignInAt: now } })
    return { ok: true, userId: byGoogle.id, created: false }
  }

  // 2) Domain must belong to a company, and hd must be one of its domains.
  const mapping = await db.companyDomain.findUnique({
    where: { domain },
    select: { companyId: true, company: { select: { active: true, allowanceAmount: true } } },
  })
  if (!mapping) return { ok: false, reason: "unknown_domain" }
  const domains = await companyDomains(db, mapping.companyId)
  if (!domains.includes(hd)) return { ok: false, reason: "domain_mismatch" }
  if (!mapping.company.active) return { ok: false, reason: "inactive" }

  // 3) Pre-created row (BambooHR sync or admin) with this email.
  const byEmail = await db.user.findUnique({
    where: { email },
    select: { id: true, googleId: true, active: true, companyId: true },
  })
  if (byEmail) {
    if (byEmail.companyId !== mapping.companyId) return { ok: false, reason: "domain_mismatch" }
    if (byEmail.googleId && byEmail.googleId !== sub) return { ok: false, reason: "account_conflict" }
    if (!byEmail.active) return { ok: false, reason: "inactive" }
    await db.user.update({ where: { id: byEmail.id }, data: { googleId: sub, fullName: name, lastSignInAt: now } })
    return { ok: true, userId: byEmail.id, created: false }
  }

  // 4) Brand new person in a known company.
  const created = await db.user.create({
    data: {
      companyId: mapping.companyId,
      email,
      googleId: sub,
      fullName: name ?? email,
      givingBalance: mapping.company.allowanceAmount,
      lastSignInAt: now,
    },
    select: { id: true },
  })
  return { ok: true, userId: created.id, created: true }
}

async function companyDomains(db: Db, companyId: string): Promise<string[]> {
  const rows = await db.companyDomain.findMany({ where: { companyId }, select: { domain: true } })
  return rows.map((r) => r.domain)
}
