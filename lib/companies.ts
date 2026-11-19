// Company / domain validation helpers. Plain module.

const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const SLUG = /^[a-z][a-z0-9-]{1,39}$/

export function normalizeDomain(input: string): string {
  const d = String(input ?? "").trim().toLowerCase().replace(/^@/, "")
  if (!DOMAIN.test(d)) throw new Error(`"${input}" is not a valid email domain.`)
  return d
}

export function normalizeDomains(list: string[] | string): string[] {
  const raw = Array.isArray(list) ? list : String(list ?? "").split(/[\s,]+/)
  const out = [...new Set(raw.filter((x) => x && x.trim()).map(normalizeDomain))]
  if (out.length === 0) throw new Error("At least one email domain is required.")
  return out
}

export function normalizeSlug(input: string): string {
  const s = String(input ?? "").trim().toLowerCase()
  if (!SLUG.test(s)) throw new Error("Slug must be 2-40 lowercase letters, numbers or dashes, starting with a letter.")
  return s
}
