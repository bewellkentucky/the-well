// Blocked sign-in addresses (Company.blockedSignIns). Plain module.
//
// Shared mailboxes (intake@, reception@, support@ ...) must never become
// Spotlight people. A blocked address:
//  - is refused at Google sign-in whether the company is open or closed, sees
//    the calm "coming soon" page, and gets no user row (an audit row is
//    written instead, action "signin_refused_blocked");
//  - never resolves as an actor, even with an old session or dev login;
//  - is skipped by BambooHR sync, so it is never pre-created either.
// The list is per company, editable only by the platform owner in /platform
// (audit-logged). Each entry must be a full address on one of the company's
// own sign-in domains.

const EMAIL = /^[a-z0-9._%+-]+@([a-z0-9-]+\.)+[a-z]{2,63}$/
export const MAX_BLOCKED_SIGN_INS = 200

/** Validates and normalizes the list from the platform form. */
export function normalizeBlockedSignIns(input: string[] | string, companyDomains: string[]): string[] {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(/[\s,;]+/)
  const domains = companyDomains.map((d) => d.toLowerCase())
  const out: string[] = []
  for (const item of raw) {
    const email = String(item ?? "").trim().toLowerCase()
    if (!email) continue
    if (!EMAIL.test(email)) throw new Error(`"${item}" is not a full email address.`)
    if (!domains.includes(email.split("@")[1]))
      throw new Error(`${email} is not on one of this company's sign-in domains (${domains.join(", ")}).`)
    if (!out.includes(email)) out.push(email)
  }
  if (out.length > MAX_BLOCKED_SIGN_INS) throw new Error(`At most ${MAX_BLOCKED_SIGN_INS} blocked addresses.`)
  return out.sort()
}

/** Is this address blocked for this company? Case-insensitive. */
export function isBlockedSignIn(company: { blockedSignIns: string[] | null }, email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.trim().toLowerCase()
  return (company.blockedSignIns ?? []).some((b) => b.toLowerCase() === e)
}

/** LCED's shared mailboxes, on both of its domains. */
export const LCED_BLOCKED_SIGN_INS = ["intake", "reception", "support"]
  .flatMap((name) => [`${name}@lcedky.com`, `${name}@bewellkentucky.com`])
  .sort()
