"use client"

import { useState, useTransition } from "react"
import { triggerBambooSync } from "@/app/actions/adminIntegrations"

export type BambooSyncStatus = {
  id:               string
  lastRunAt:        string
  recordsProcessed: number
  errors:           number
  notes:            string | null
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)    return "just now"
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  const days = Math.floor(secs / 86400)
  return days === 1 ? "yesterday" : `${days}d ago`
}

type SyncResult = { enriched: number; skipped: number; errors: number; total: number }

export default function IntegrationsPanel({
  bambooLastSync,
  userCount,
}: {
  bambooLastSync: BambooSyncStatus | null
  userCount:      number
}) {
  const [isPending, startTransition] = useTransition()
  const [isFullSync, setIsFullSync]  = useState(false)
  const [syncResult, setSyncResult]  = useState<SyncResult | null>(null)
  const [syncError, setSyncError]    = useState<string | null>(null)

  function doSync(full: boolean) {
    setIsFullSync(full)
    setSyncResult(null)
    setSyncError(null)
    startTransition(async () => {
      const res = await triggerBambooSync({ full })
      if (res.error) {
        setSyncError(res.error)
      } else {
        setSyncResult({
          enriched: res.enriched ?? 0,
          skipped:  res.skipped  ?? 0,
          errors:   res.errors   ?? 0,
          total:    res.total    ?? 0,
        })
      }
    })
  }

  return (
    <div className="integ-grid">

      {/* ── BambooHR ─────────────────────────────────────────────── */}
      <div className="integ-card">
        <div className="integ-card-header">
          <div className="integ-card-icon" style={{ background: "#81b62222", color: "#4a8b38" }}>
            🌿
          </div>
          <div className="integ-card-meta">
            <div className="integ-card-name">BambooHR</div>
            <div className="integ-card-desc">HR data — names, titles, departments, hire dates, birthdays</div>
          </div>
          <span className="integ-pill integ-pill-connected">Connected</span>
        </div>

        <div className="integ-card-body">
          {bambooLastSync ? (
            <>
              <div className="integ-stat-row">
                <span>Last sync</span>
                <span>{timeAgo(bambooLastSync.lastRunAt)}</span>
              </div>
              <div className="integ-stat-row">
                <span>Records enriched</span>
                <span>{bambooLastSync.recordsProcessed}</span>
              </div>
              {bambooLastSync.errors > 0 && (
                <div className="integ-stat-row integ-stat-row-error">
                  <span>Errors</span>
                  <span>{bambooLastSync.errors}</span>
                </div>
              )}
              {bambooLastSync.notes && (
                <div className="integ-stat-muted">{bambooLastSync.notes}</div>
              )}
            </>
          ) : (
            <div className="integ-stat">
              Never synced. Run a sync to import HR data for all staff.
            </div>
          )}

          {syncResult && (
            <div className="integ-sync-result">
              Done: {syncResult.enriched} enriched, {syncResult.skipped} skipped
              {syncResult.errors > 0 && `, ${syncResult.errors} errors`}
              {" "}({syncResult.total} total)
            </div>
          )}
          {syncError && (
            <div className="integ-sync-error">{syncError}</div>
          )}
        </div>

        <div className="integ-card-footer">
          <button
            className="btn btn-primary"
            style={{ padding: "7px 14px", fontSize: 13 }}
            onClick={() => doSync(false)}
            disabled={isPending}
          >
            {isPending && !isFullSync ? "Syncing…" : "Sync now"}
          </button>
          <button
            className="role-change-btn"
            onClick={() => doSync(true)}
            disabled={isPending}
          >
            {isPending && isFullSync ? "Syncing…" : "Full sync"}
          </button>
          <span className="integ-footer-note">
            Sync now = changes since last run. Full sync = all employees.
          </span>
        </div>
      </div>

      {/* ── Google Workspace ─────────────────────────────────────── */}
      <div className="integ-card">
        <div className="integ-card-header">
          <div
            className="integ-card-icon integ-card-icon-letter"
            style={{ background: "#4285f422", color: "#4285f4" }}
          >
            G
          </div>
          <div className="integ-card-meta">
            <div className="integ-card-name">Google Workspace</div>
            <div className="integ-card-desc">Identity and SSO</div>
          </div>
          <span className="integ-pill integ-pill-connected">Connected</span>
        </div>

        <div className="integ-card-body">
          <div className="integ-stat-row">
            <span>Domain</span>
            <span>bewellkentucky.com</span>
          </div>
          <div className="integ-stat-row">
            <span>Auth method</span>
            <span>Google OAuth SSO</span>
          </div>
          <div className="integ-stat-row">
            <span>Staff accounts</span>
            <span>{userCount}</span>
          </div>
          <p className="integ-note">
            Staff sign in using their Google account. A user record is created automatically on
            first login. No batch directory sync is configured, so staff must sign in at least
            once to appear in the app.
          </p>
        </div>
      </div>

      {/* ── Coming later ─────────────────────────────────────────── */}
      <div className="integ-section-label">Coming later</div>

      <div className="integ-coming-grid">

        <div className="integ-card integ-card-inactive">
          <div className="integ-card-header">
            <div className="integ-card-icon" style={{ background: "#00ac4722", color: "#00ac47" }}>
              💬
            </div>
            <div className="integ-card-meta">
              <div className="integ-card-name">Google Chat</div>
              <div className="integ-card-desc">Kudos notifications</div>
            </div>
            <span className="integ-pill integ-pill-inactive">Not connected</span>
          </div>
          <div className="integ-card-body">
            <p className="integ-placeholder-desc">
              Posts kudos to a shared space and sends DMs to recipients when recognition is given.
            </p>
          </div>
        </div>

        <div className="integ-card integ-card-inactive">
          <div className="integ-card-header">
            <div
              className="integ-card-icon integ-card-icon-letter"
              style={{ background: "#6b5b7322", color: "#6b5b73" }}
            >
              T
            </div>
            <div className="integ-card-meta">
              <div className="integ-card-name">Tremendous</div>
              <div className="integ-card-desc">Gift card fulfillment</div>
            </div>
            <span className="integ-pill integ-pill-inactive">Not connected</span>
          </div>
          <div className="integ-card-body">
            <p className="integ-placeholder-desc">
              Sends digital gift cards automatically when a reward redemption is approved.
            </p>
          </div>
        </div>

        <div className="integ-card integ-card-inactive">
          <div className="integ-card-header">
            <div
              className="integ-card-icon integ-card-icon-letter"
              style={{ background: "#c97b5c22", color: "#c97b5c" }}
            >
              P
            </div>
            <div className="integ-card-meta">
              <div className="integ-card-name">Printful</div>
              <div className="integ-card-desc">Merchandise fulfillment</div>
            </div>
            <span className="integ-pill integ-pill-inactive">Not connected</span>
          </div>
          <div className="integ-card-body">
            <p className="integ-placeholder-desc">
              Fulfills swag orders automatically when staff redeem merchandise rewards.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
