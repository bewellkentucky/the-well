"use client"

import { useState, useTransition } from "react"
import { setAllowanceSetting, setFeaturedCount, setBranding } from "@/app/actions/adminProgram"
import { COMPANY_VALUE_NAMES, DEFAULT_BRAND_COLOR, STAR } from "@/lib/brand"

function useSaver() {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }
  return { saved, error, isPending, run, setSaved }
}

export default function ProgramPanel({
  allowanceAmount,
  featuredCount,
  logoUrl,
  brandColor,
}: {
  allowanceAmount: number
  featuredCount: number
  logoUrl: string | null
  brandColor: string | null
}) {
  const [amount, setAmount] = useState(String(allowanceAmount))
  const [featured, setFeatured] = useState(String(featuredCount))
  const [logo, setLogo] = useState(logoUrl ?? "")
  const [color, setColor] = useState(brandColor ?? "")
  const allowance = useSaver()
  const feat = useSaver()
  const brand = useSaver()

  const previewColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_BRAND_COLOR

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>

      {/* ── Giving allowance ─────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Monthly giving allowance</h2>
        </div>
        <p className="prog-section-desc">
          Each person gets this many stars to give each month. The reset sets everyone&apos;s
          &quot;to give this month&quot; pool to this amount on the 1st. Unused stars don&apos;t roll over.
          Earned stars are never touched by the reset.
        </p>
        <div className="prog-allowance-row">
          <div className="prog-amount-wrap">
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              value={amount}
              onChange={(e) => { setAmount(e.target.value); allowance.setSaved(false) }}
              className="prog-amount-input"
              aria-label="Allowance amount in stars"
            />
            <span className="prog-amount-unit">{STAR} per person</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => allowance.run(() => setAllowanceSetting(parseInt(amount, 10)))}
            disabled={allowance.isPending}
          >
            {allowance.isPending ? "Saving…" : allowance.saved ? "Saved" : "Save"}
          </button>
        </div>
        {allowance.error && <p className="prog-error">{allowance.error}</p>}
      </div>

      {/* ── Featured incentives ──────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Featured on Home</h2>
        </div>
        <p className="prog-section-desc">
          How many incentives show on the Home feed. They are the top ones in the order you set on
          the Incentives tab.
        </p>
        <div className="prog-allowance-row">
          <div className="prog-amount-wrap">
            <input
              type="number"
              min={0}
              max={6}
              step={1}
              value={featured}
              onChange={(e) => { setFeatured(e.target.value); feat.setSaved(false) }}
              className="prog-amount-input"
              aria-label="Number of featured incentives"
            />
            <span className="prog-amount-unit">incentives</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => feat.run(() => setFeaturedCount(parseInt(featured, 10)))}
            disabled={feat.isPending}
          >
            {feat.isPending ? "Saving…" : feat.saved ? "Saved" : "Save"}
          </button>
        </div>
        {feat.error && <p className="prog-error">{feat.error}</p>}
      </div>

      {/* ── Branding ─────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Logo and brand color</h2>
        </div>
        <p className="prog-section-desc">
          Leave either blank to use the Spotlight default. The logo must be an https:// image link.
        </p>
        <div className="prog-brand-grid">
          <label className="adj-label" htmlFor="brand-logo">Logo URL</label>
          <input
            id="brand-logo"
            className="adj-input"
            type="url"
            placeholder="https://…/logo.png"
            value={logo}
            onChange={(e) => { setLogo(e.target.value); brand.setSaved(false) }}
          />
          <label className="adj-label" htmlFor="brand-color">Brand color</label>
          <div className="prog-color-row">
            <input
              type="color"
              aria-label="Pick brand color"
              value={previewColor}
              onChange={(e) => { setColor(e.target.value); brand.setSaved(false) }}
              className="prog-color-swatch"
            />
            <input
              id="brand-color"
              className="adj-input"
              type="text"
              placeholder={DEFAULT_BRAND_COLOR}
              value={color}
              onChange={(e) => { setColor(e.target.value); brand.setSaved(false) }}
            />
          </div>
        </div>
        <div className="prog-brand-preview">
          <span className="prog-brand-chip" style={{ background: previewColor }}>Send kudos →</span>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Preview</span>
        </div>
        <div className="prog-allowance-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => brand.run(() => setBranding({ logoUrl: logo.trim() || null, brandColor: color.trim() || null }))}
            disabled={brand.isPending}
          >
            {brand.isPending ? "Saving…" : brand.saved ? "Saved" : "Save branding"}
          </button>
        </div>
        {brand.error && <p className="prog-error">{brand.error}</p>}
      </div>

      {/* ── Company values ────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Company values</h2>
        </div>
        <p className="prog-section-desc">
          The six recognition values people attach to kudos. Fixed for now.
        </p>
        <div className="prog-values-grid">
          {COMPANY_VALUE_NAMES.map((v) => (
            <span key={v} className="prog-value-chip">{v}</span>
          ))}
        </div>
      </div>

    </div>
  )
}
