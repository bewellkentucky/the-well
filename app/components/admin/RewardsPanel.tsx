"use client"

import { useState, useTransition } from "react"
import {
  createReward,
  updateReward,
  setRewardActive,
  type RewardFormData,
} from "@/app/actions/adminRewards"
import EmojiPicker from "@/app/components/ui/EmojiPicker"

export type RewardAdminRow = {
  id:             string
  title:          string
  description:    string
  cost:           number
  category:       string
  inventory:      number | null
  icon:           string
  color:          string
  active:         boolean
  redemptionCount: number
}

const COLORS = [
  { label: "Sage",       value: "#7a9b7e" },
  { label: "Terracotta", value: "#c97b5c" },
  { label: "Plum",       value: "#6b5b73" },
  { label: "Slate",      value: "#2a3441" },
  { label: "Honey",      value: "#a89060" },
  { label: "Teal",       value: "#4a8fa8" },
]

const CATEGORIES = ["Swag", "Gift Card", "Time", "Office", "Team", "Growth"]

const CATEGORY_LABELS: Record<string, string> = {
  "Swag":      "Swag",
  "Gift Card": "Gift Card",
  "Time":      "Time off",
  "Office":    "Office",
  "Team":      "Team",
  "Growth":    "Growth",
}

const EMPTY_FORM = {
  title:       "",
  description: "",
  cost:        "50",
  category:    "Gift Card",
  inventory:   "",
  icon:        "🎁",
  color:       "#7a9b7e",
}

type FormState = typeof EMPTY_FORM

function rowToForm(row: RewardAdminRow): FormState {
  return {
    title:       row.title,
    description: row.description,
    cost:        String(row.cost),
    category:    row.category,
    inventory:   row.inventory !== null ? String(row.inventory) : "",
    icon:        row.icon,
    color:       row.color,
  }
}

export default function RewardsPanel({
  rewards,
}: {
  rewards: RewardAdminRow[]
}) {
  const [modal, setModal] = useState<{ mode: "new" | "edit"; id: string | null } | null>(null)
  const [form, setForm]   = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setModal({ mode: "new", id: null })
  }

  function openEdit(row: RewardAdminRow) {
    setForm(rowToForm(row))
    setFormError(null)
    setModal({ mode: "edit", id: row.id })
  }

  function closeModal() {
    if (!isPending) { setModal(null); setFormError(null) }
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  function submitForm() {
    const costNum = parseInt(form.cost, 10)
    if (isNaN(costNum) || costNum <= 0) {
      setFormError("Cost must be a positive whole number.")
      return
    }
    const invNum = form.inventory === "" ? null : parseInt(form.inventory, 10)
    if (invNum !== null && (isNaN(invNum) || invNum < 0)) {
      setFormError("Inventory must be a non-negative number, or leave blank for unlimited.")
      return
    }

    const data: RewardFormData = {
      title:       form.title,
      description: form.description,
      cost:        costNum,
      category:    form.category,
      inventory:   invNum,
      icon:        form.icon || "🎁",
      color:       form.color,
    }

    setFormError(null)
    startTransition(async () => {
      const result = modal?.mode === "new"
        ? await createReward(data)
        : await updateReward(modal!.id!, data)
      if (result.error) setFormError(result.error)
      else closeModal()
    })
  }

  function toggleActive(row: RewardAdminRow) {
    startTransition(async () => {
      await setRewardActive(row.id, !row.active)
    })
  }

  const activeRewards   = rewards.filter((r) => r.active)
  const inactiveRewards = rewards.filter((r) => !r.active)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Reward catalog ──────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Reward catalog</h2>
          <button
            className="btn btn-primary"
            style={{ padding: "7px 14px", fontSize: 13 }}
            onClick={openCreate}
          >
            + New reward
          </button>
        </div>
        <p className="people-explainer">
          Active rewards appear in the staff shop. Inactive ones are hidden but existing
          redemptions are preserved.
        </p>

        {rewards.length === 0 ? (
          <p className="report-empty">No rewards yet. Create one above.</p>
        ) : (
          <>
            {activeRewards.length > 0 && (
              <div className="inc-admin-list">
                {activeRewards.map((row) => (
                  <RewardRow
                    key={row.id}
                    row={row}
                    isPending={isPending}
                    onEdit={openEdit}
                    onToggle={toggleActive}
                  />
                ))}
              </div>
            )}

            {inactiveRewards.length > 0 && (
              <>
                <div className="inc-admin-section-divider">
                  Inactive ({inactiveRewards.length})
                </div>
                <div className="inc-admin-list">
                  {inactiveRewards.map((row) => (
                    <RewardRow
                      key={row.id}
                      row={row}
                      isPending={isPending}
                      onEdit={openEdit}
                      onToggle={toggleActive}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Create / Edit modal ──────────────────────────────────── */}
      {modal && (
        <div className="reward-modal-backdrop" onClick={closeModal}>
          <div
            className="reward-modal"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reward-modal-body">
              <div className="reward-modal-title">
                {modal.mode === "new" ? "New reward" : "Edit reward"}
              </div>

              <div className="inc-form">

                {/* Title */}
                <div className="inc-form-field">
                  <label className="adj-label">Title</label>
                  <input
                    className="adj-input"
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    placeholder="e.g. Amazon Gift Card"
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
                    placeholder="What staff receive when they redeem this"
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
                      presets={["🎁","🛍️","💳","☕","🌿","🏖️","📚","🎓","🕐","🌟","🎉","🧘","💻","🎟️","🌸","🍕"]}
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

                {/* Cost */}
                <div className="inc-form-field">
                  <label className="adj-label">Cost (đ)</label>
                  <input
                    className="adj-input"
                    type="number"
                    min={1}
                    max={100000}
                    value={form.cost}
                    onChange={(e) => setField("cost", e.target.value)}
                    style={{ width: 120 }}
                  />
                </div>

                {/* Category */}
                <div className="inc-form-field">
                  <label className="adj-label">Category</label>
                  <select
                    className="adj-select"
                    value={form.category}
                    onChange={(e) => setField("category", e.target.value)}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat] ?? cat}</option>
                    ))}
                  </select>
                </div>

                {/* Inventory */}
                <div className="inc-form-field">
                  <label className="adj-label">Inventory limit (optional)</label>
                  <input
                    className="adj-input"
                    type="number"
                    min={0}
                    value={form.inventory}
                    onChange={(e) => setField("inventory", e.target.value)}
                    placeholder="Leave blank for unlimited"
                    style={{ width: 160 }}
                  />
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
                    : (modal.mode === "new" ? "Create reward" : "Save changes")}
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

function RewardRow({
  row,
  isPending,
  onEdit,
  onToggle,
}: {
  row:       RewardAdminRow
  isPending: boolean
  onEdit:    (row: RewardAdminRow) => void
  onToggle:  (row: RewardAdminRow) => void
}) {
  return (
    <div className={`inc-admin-row${row.active ? "" : " inc-admin-row-inactive"}`}>
      <div
        className="inc-admin-icon"
        style={{ background: row.color + "22", color: row.color }}
      >
        {row.icon}
      </div>

      <div className="inc-admin-body">
        <div className="inc-admin-title">{row.title}</div>
        <div className="inc-admin-desc">{row.description}</div>
        <div className="inc-admin-meta">
          <span className="inc-admin-badge inc-badge-reward">{row.cost}đ</span>
          <span className="inc-admin-badge">{CATEGORY_LABELS[row.category] ?? row.category}</span>
          {row.inventory !== null && (
            <span className="inc-admin-badge">
              {row.inventory} left
            </span>
          )}
          {!row.active && (
            <span className="inc-admin-badge inc-badge-inactive">Inactive</span>
          )}
          <span className="inc-admin-claimcount">
            {row.redemptionCount} {row.redemptionCount === 1 ? "redemption" : "redemptions"}
          </span>
        </div>
      </div>

      <div className="inc-admin-actions">
        <button className="role-change-btn" onClick={() => onEdit(row)}>
          Edit
        </button>
        <button
          className={`role-change-btn${row.active ? " inc-btn-disable" : " inc-btn-enable"}`}
          onClick={() => onToggle(row)}
          disabled={isPending}
        >
          {row.active ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  )
}
