"use client"

import { useState, useTransition } from "react"
import { setAllowanceSetting } from "@/app/actions/adminProgram"

const COMPANY_VALUES = [
  "Compassion",
  "Ownership",
  "Curiosity",
  "Team-First",
  "Excellence",
  "Above & Beyond",
]

export default function ProgramPanel({
  allowanceAmount,
}: {
  allowanceAmount: number
}) {
  const [amount, setAmount]         = useState(String(allowanceAmount))
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    const parsed = parseInt(amount, 10)
    if (isNaN(parsed)) { setError("Enter a valid number."); return }
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await setAllowanceSetting(parsed)
      if (result.error) {
        setError(result.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>

      {/* ── Giving allowance ─────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Monthly giving allowance</h2>
        </div>
        <p className="prog-section-desc">
          Each staff member receives this many drops to give out per month. The reset
          cron job will use this value when it ships.
        </p>

        <div className="prog-allowance-row">
          <div className="prog-amount-wrap">
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setSaved(false) }}
              className="prog-amount-input"
              aria-label="Allowance amount in drops"
            />
            <span className="prog-amount-unit">đ per person</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        </div>

        {error && (
          <p className="prog-error">{error}</p>
        )}

        <div className="prog-notice">
          <span className="prog-notice-icon">ⓘ</span>
          <span>
            Automatic monthly resets are not built yet. Use this value as the reference
            when topping up balances manually via People → Adjust balance. When the
            reset cron job ships, it will read this setting.
          </span>
        </div>
      </div>

      {/* ── Reset cadence ─────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Reset cadence</h2>
        </div>
        <div className="prog-placeholder-row">
          <span className="prog-cadence-value">Monthly</span>
          <span className="prog-coming-soon-badge">Not yet automated</span>
        </div>
        <p className="prog-section-desc" style={{ marginTop: 10 }}>
          The intended cadence is monthly (1st of each month). Automatic resets require
          a scheduled cron job, which will be set up at production deployment. Until
          then, top up balances manually via People → Adjust balance.
        </p>
      </div>

      {/* ── Drops value ───────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Drops value (đ → USD)</h2>
        </div>
        <div className="prog-placeholder-row">
          <span className="prog-section-desc" style={{ margin: 0 }}>
            Not configured — conversion rate not used anywhere in the app yet.
          </span>
          <span className="prog-coming-soon-badge">Coming later</span>
        </div>
      </div>

      {/* ── Notifications ─────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Notifications</h2>
        </div>
        <div className="prog-placeholder-row">
          <span className="prog-section-desc" style={{ margin: 0 }}>
            Email and push notification settings will live here. No notification
            system is built yet.
          </span>
          <span className="prog-coming-soon-badge">Coming later</span>
        </div>
      </div>

      {/* ── Company values ────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Company values</h2>
        </div>
        <p className="prog-section-desc">
          These are the six recognition values staff attach to kudos. They are fixed
          by the program and not editable here.
        </p>
        <div className="prog-values-grid">
          {COMPANY_VALUES.map((v) => (
            <span key={v} className="prog-value-chip">{v}</span>
          ))}
        </div>
      </div>

    </div>
  )
}
