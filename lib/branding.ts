// Company branding: logo, address and name validation. Plain module.
// Colors live in lib/theme.ts (per-company palette).

export function normalizeLogoUrl(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null
  if (typeof input !== "string") throw new Error("Logo must be an https:// image URL.")
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error("Logo must be an https:// image URL.")
  }
  if (url.protocol !== "https:") throw new Error("Logo must be an https:// image URL.")
  if (url.toString().length > 1000) throw new Error("Logo URL is too long.")
  return url.toString()
}

export function normalizeAppUrl(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null
  if (typeof input !== "string") throw new Error("Address must be an https:// URL.")
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error("Address must be an https:// URL.")
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))
    throw new Error("Address must be an https:// URL.")
  return url.origin
}

export type CompanyBrand = {
  name: string
  shortName: string | null
  logoUrl: string | null
  theme: unknown // validated by lib/theme.ts before use
}

/** Short display name: trimmed, 1 to 24 characters, or null (falls back to name). */
export function normalizeShortName(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim().replace(/\s+/g, " ")
  if (!v) return null
  if (v.length > 24) throw new Error("Short name must be 24 characters or fewer.")
  return v
}
