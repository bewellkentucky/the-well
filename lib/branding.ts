// Company branding: validation and the CSS override. Plain module.
import { DEFAULT_BRAND_COLOR } from "@/lib/brand"

const HEX = /^#[0-9a-fA-F]{6}$/

export function normalizeBrandColor(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null
  if (typeof input !== "string" || !HEX.test(input.trim())) throw new Error("Brand color must look like #1a2b3c.")
  return input.trim().toLowerCase()
}

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

/**
 * CSS that applies a company's brand color. Only a validated #rrggbb ever
 * reaches the <style> tag, so nothing can be injected through it.
 */
export function brandCss(brandColor: string | null | undefined): string {
  const c = brandColor && HEX.test(brandColor) ? brandColor : DEFAULT_BRAND_COLOR
  return `html:root{--accent:${c};}`
}

export type CompanyBrand = {
  name: string
  shortName: string | null
  logoUrl: string | null
  brandColor: string | null
}

/** Short display name: trimmed, 1 to 24 characters, or null (falls back to name). */
export function normalizeShortName(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim().replace(/\s+/g, " ")
  if (!v) return null
  if (v.length > 24) throw new Error("Short name must be 24 characters or fewer.")
  return v
}
