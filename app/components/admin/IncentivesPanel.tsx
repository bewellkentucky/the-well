"use client"

import { useState, useTransition } from "react"
import Avatar from "@/app/components/ui/Avatar"
import {
  createIncentive,
  updateIncentive,
  setIncentiveActive,
  type IncentiveFormData,
} from "@/app/actions/adminIncentives"
import EmojiPicker from "@/app/components/ui/EmojiPicker"

export type IncentiveAdminRow = {
  id:           string
  title:        string
  description:  string
  reward:       number
  verification: string
  cap:          string
  icon:         string
  color:        string
  proofPrompt:  string | null
  active:       boolean
  sortOrder:    number
  startsAt:     string | null
  endsAt:       string | null
  claimCount:   number
}

export type ClaimHistoryRow = {
  id:              string
  createdAt:       string
  userName:        string
  userEmail:       string
  userThumbnail:   string | null
  incentiveTitle:  string
  incentiveIcon:   string
  incentiveColor:  string
  status:          string
  decidedById:     string | null
  rewardSnapshot:  number | null
  incentiveReward: number
}

const COLORS = [
  { label: "Sage",       value: "#7a9b7e" },
  { label: "Terracotta", value: "#c97b5c" },
  { label: "Plum",       value: "#6b5b73" },
  { label: "Slate",      value: "#2a3441" },
  { label: "Honey",      value: "#a89060" },
  { label: "Teal",       value: "#4a8fa8" },
]

const CAP_LABELS: Record<string, string> = {
  once:       "Once",
  monthly:    "Monthly",
  quarterly:  "Quarterly",
  unlimited:  "Unlimited",
}

type ClaimFilter = "all" | "approved" | "declined" | "self-attested"

const CLAIM_FILTERS: { id: ClaimFilter; label: string }[] = [
  { id: "all",           label: "All" },
  { id: "approved",      label: "Approved" },
  { id: "declined",      label: "Declined" },
  { id: "self-attested", label: "Self-attested" },
]

function claimAmount(row: ClaimHistoryRow): number {
  return row.rewardSnapshot ?? row.incentiveReward
}

function isAutoCredit(row: ClaimHistoryRow): boolean {
  return row.status === "credited" && !row.decidedById
}

function matchesFilter(row: ClaimHistoryRow, filter: ClaimFilter): boolean {
  if (filter === "all")           return true
  if (filter === "approved")      return row.status === "credited" && !!row.decidedById
  if (filter === "declined")      return row.status === "declined"
  if (filter === "self-attested") return isAutoCredit(row)
  return true
}

function claimLabel(row: ClaimHistoryRow): string {
  if (isAutoCredit(row))      return "Self-attested"
  if (row.status === "credited") return "Approved"
  if (row.status === "pending")  return "Pending"
  return "Declined"
}

function claimStatusClass(row: ClaimHistoryRow): string {
  if (isAutoCredit(row))         return "status-self"
  if (row.status === "credited") return "status-credited"
  if (row.status === "pending")  return "status-pending"
  return "status-declined"
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60)    return "just now"
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

const EMPTY_FORM = {
  title:        "",
  description:  "",
  reward:       "25",
  verification: "self",
  cap:          "once",
  icon:         "⭐",
  color:        "#7a9b7e",
  proofPrompt:  "",
  startsAt:     "",
  endsAt:       "",
}

type FormState = typeof EMPTY_FORM

function rowToForm(inc: IncentiveAdminRow): FormState {
  return {
    title:        inc.title,
    description:  inc.description,
    reward:       String(inc.reward),
    verification: inc.verification,
    cap:          inc.cap,
    icon:         inc.icon,
    color:        inc.color,
    proofPrompt:  inc.proofPrompt ?? "",
    startsAt:     inc.startsAt ? inc.startsAt.slice(0, 10) : "",
    endsAt:       inc.endsAt   ? inc.endsAt.slice(0, 10)   : "",
  }
}

export default function IncentivesPanel({
  incentives,
  claimHistory,
}: {
  incentives:   IncentiveAdminRow[]
  claimHistory: ClaimHistoryRow[]
}) {
  const [modal, setModal] = useState<{ mode: "new" | "edit"; id: string | null } | null>(null)
  const [form, setForm]   = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [claimFilter, setClaimFilter] = useState<ClaimFilter>("all")

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setModal({ mode: "new", id: null })
  }

  function openEdit(inc: IncentiveAdminRow) {
    setForm(rowToForm(inc))
    setFormError(null)
    setModal({ mode: "edit", id: inc.id })
  }

  function closeModal() {
    if (!isPending) { setModal(null); setFormError(null) }
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  function submitForm() {
    const rewardNum = parseInt(form.reward, 10)
    if (isNaN(rewardNum) || rewardNum <= 0) {
      setFormError("Reward must be a positive whole number.")
      return
    }

    const data: IncentiveFormData = {
      title:        form.title,
      description:  form.description,
      reward:       rewardNum,
      verification: form.verification,
      cap:          form.cap,
      icon:         form.icon || "⭐",
      color:        form.color,
      proofPrompt:  form.proofPrompt || null,
      startsAt:     form.startsAt || null,
      endsAt:       form.endsAt   || null,
    }

    setFormError(null)
    startTransition(async () => {
      const result = modal?.mode === "new"
        ? await createIncentive(data)
        : await updateIncentive(modal!.id!, data)
      if (result.error) setFormError(result.error)
      else closeModal()
    })
  }

  function toggleActive(inc: IncentiveAdminRow) {
    startTransition(async () => {
      await setIncentiveActive(inc.id, !inc.active)
    })
  }

  const filteredClaims = claimHistory.filter((r) => matchesFilter(r, claimFilter))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Section 1: Incentive catalog ────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Incentive catalog</h2>
          <button
            className="btn btn-primary"
            style={{ padding: "7px 14px", fontSize: 13 }}
            onClick={openCreate}
          >
            + New incentive
          </button>
        </div>
        <p className="people-explainer">
          Active incentives appear on the Earn page. Inactive ones are hidden from staff
          but existing claims and credits are preserved.
        </p>

        {incentives.length === 0 ? (
          <p className="report-empty">No incentives yet. Create one above.</p>
        ) : (
          <div className="inc-admin-list">
            {incentives.map((inc) => (
              <div
                key={inc.id}
                className={`inc-admin-row${inc.active ? "" : " inc-admin-row-inactive"}`}
              >
                <div
                  className="inc-admin-icon"
                  style={{ background: inc.color + "22", color: inc.color }}
                >
                  {inc.icon}
                </div>

                <div className="inc-admin-body">
                  <div className="inc-admin-title">{inc.title}</div>
                  <div className="inc-admin-desc">{inc.description}</div>
                  <div className="inc-admin-meta">
                    <span className="inc-admin-badge inc-badge-reward">{inc.reward}đ</span>
                    <span className={`inc-admin-badge ${inc.verification === "admin" ? "inc-badge-admin-verify" : "inc-badge-self"}`}>
                      {inc.verification === "admin" ? "Admin review" : "Self-attest"}
                    </span>
                    <span className="inc-admin-badge">{CAP_LABELS[inc.cap] ?? inc.cap}</span>
                    {!inc.active && (
                      <span className="inc-admin-badge inc-badge-inactive">Inactive</span>
                    )}
                    <span className="inc-admin-claimcount">
                      {inc.claimCount} {inc.claimCount === 1 ? "claim" : "claims"}
                    </span>
                  </div>
                </div>

                <div className="inc-admin-actions">
                  <button className="role-change-btn" onClick={() => openEdit(inc)}>
                    Edit
                  </button>
                  <button
                    className={`role-change-btn${inc.active ? " inc-btn-disable" : " inc-btn-enable"}`}
                    onClick={() => toggleActive(inc)}
                    disabled={isPending}
                  >
                    {inc.active ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Claim history ─────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Claim history</h2>
          <span className="report-period">All time</span>
        </div>

        <div className="audit-filter-tabs">
          {CLAIM_FILTERS.map((tab) => (
            <button
              key={tab.id}
              className={`audit-filter-tab${claimFilter === tab.id ? " active" : ""}`}
              onClick={() => setClaimFilter(tab.id)}
            >
              {tab.label}
              <span className="audit-tab-count">
                {claimHistory.filter((r) => matchesFilter(r, tab.id)).length}
              </span>
            </button>
          ))}
        </div>

        {filteredClaims.length === 0 ? (
          <p className="report-empty">
            No {claimFilter === "all" ? "" : claimFilter + " "}claims yet.
          </p>
        ) : (
          <div className="claim-hist-list">
            {filteredClaims.map((claim) => (
              <div key={claim.id} className="claim-hist-row">
                <Avatar
                  name={claim.userName}
                  email={claim.userEmail}
                  thumbnailUrl={claim.userThumbnail}
                  size="sm"
                />
                <div className="claim-hist-body">
                  <div className="claim-hist-name">{claim.userName}</div>
                  <div className="claim-hist-incentive">
                    <span style={{ marginRight: 4 }}>{claim.incentiveIcon}</span>
                    {claim.incentiveTitle}
                  </div>
                </div>
                <div className="claim-hist-right">
                  <span className={`claim-status ${claimStatusClass(claim)}`}>
                    {claimLabel(claim)}
                  </span>
                  <span className="claim-hist-amount">{claimAmount(claim)}đ</span>
                  <span className="claim-hist-time">{timeAgo(claim.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: Staff suggestions placeholder ─────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Staff suggestions</h2>
        </div>
        <p className="people-explainer">
          Staff-submitted incentive ideas will appear here once the "Suggest an incentive"
          feature is built. The submission form on the Earn page is currently a placeholder.
        </p>
      </div>

      {/* ── Edit / Create modal ──────────────────────────────────── */}
      {modal && (
        <div className="reward-modal-backdrop" onClick={closeModal}>
          <div
            className="reward-modal"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reward-modal-body">
              <div className="reward-modal-title">
                {modal.mode === "new" ? "New incentive" : "Edit incentive"}
              </div>

              <div className="inc-form">

                {/* Title */}
                <div className="inc-form-field">
                  <label className="adj-label">Title</label>
                  <input
                    className="adj-input"
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    placeholder="e.g. Google Review"
                    maxLength={80}
                  />
                </div>

                {/* Description */}
                <div className="inc-form-field">
                  <label className="adj-label">Description</label>
                  <textarea
                    className="adj-input inc-form-textarea"
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                    placeholder="What staff need to do to earn this"
                    maxLength={300}
                    rows={2}
                  />
                </div>

                {/* Icon + Color */}
                <div className="inc-form-row">
                  <div className="inc-form-field" style={{ flex: "0 0 auto" }}>
                    <label className="adj-label">Icon</label>
                    <EmojiPicker
                      value={form.icon}
                      onChange={(v) => setField("icon", v)}
                    />
                  </div>
                  <div className="inc-form-field" style={{ flex: 1 }}>
                    <label className="adj-label">Color</label>
                    <div className="inc-color-swatches">
                      {COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          className={`inc-color-swatch${form.color === c.value ? " selected" : ""}`}
                          style={{ background: c.value }}
                          title={c.label}
                          onClick={() => setField("color", c.value)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Reward */}
                <div className="inc-form-field">
                  <label className="adj-label">Reward (đ)</label>
                  <input
                    className="adj-input"
                    type="number"
                    min={1}
                    max={10000}
                    value={form.reward}
                    onChange={(e) => setField("reward", e.target.value)}
                    style={{ width: 120 }}
                  />
                </div>

                {/* Verification */}
                <div className="inc-form-field">
                  <label className="adj-label">Verification</label>
                  <div className="inc-radio-group">
                    {[
                      { value: "self",  label: "Self-attest",  desc: "Instant credit, no review" },
                      { value: "admin", label: "Admin review",  desc: "Claim goes to approvals queue" },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`inc-radio-option${form.verification === opt.value ? " selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="verification"
                          value={opt.value}
                          checked={form.verification === opt.value}
                          onChange={() => setField("verification", opt.value)}
                        />
                        <span className="inc-radio-label">{opt.label}</span>
                        <span className="inc-radio-desc">{opt.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Proof prompt (admin verify only) */}
                {form.verification === "admin" && (
                  <div className="inc-form-field">
                    <label className="adj-label">Proof prompt (optional)</label>
                    <input
                      className="adj-input"
                      value={form.proofPrompt}
                      onChange={(e) => setField("proofPrompt", e.target.value)}
                      placeholder="e.g. Paste a link to your review"
                      maxLength={120}
                    />
                  </div>
                )}

                {/* Cap */}
                <div className="inc-form-field">
                  <label className="adj-label">Cap</label>
                  <select
                    className="adj-select"
                    value={form.cap}
                    onChange={(e) => setField("cap", e.target.value)}
                  >
                    <option value="once">Once (lifetime)</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="unlimited">Unlimited</option>
                  </select>
                </div>

                {/* Time window */}
                <div className="inc-form-row">
                  <div className="inc-form-field" style={{ flex: 1 }}>
                    <label className="adj-label">Start date (optional)</label>
                    <input
                      className="adj-input"
                      type="date"
                      value={form.startsAt}
                      onChange={(e) => setField("startsAt", e.target.value)}
                    />
                  </div>
                  <div className="inc-form-field" style={{ flex: 1 }}>
                    <label className="adj-label">End date (optional)</label>
                    <input
                      className="adj-input"
                      type="date"
                      value={form.endsAt}
                      onChange={(e) => setField("endsAt", e.target.value)}
                    />
                  </div>
                </div>

                {formError && (
                  <p className="adj-error">{formError}</p>
                )}
              </div>

              <div className="reward-modal-actions" style={{ marginTop: 20 }}>
                <button
                  className="reward-btn reward-btn-confirm"
                  onClick={submitForm}
                  disabled={isPending}
                >
                  {isPending
                    ? (modal.mode === "new" ? "Creating..." : "Saving...")
                    : (modal.mode === "new" ? "Create incentive" : "Save changes")}
                </button>
                <button
                  className="reward-btn-cancel"
                  onClick={closeModal}
                  disabled={isPending}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
