"use client"

import { useState, useTransition } from "react"
import { createCompany, updateCompany, setCompanyOpen, setTester, type CompanyInput } from "@/app/actions/platform"
import { changeRole } from "@/app/actions/adminPeople"
import { DEFAULT_THEME, THEME_KEYS, THEME_LABELS, themeContrastPairs, type Theme } from "@/lib/theme"

export type CompanyRow = {
  id: string
  name: string
  shortName: string | null
  slug: string
  domains: string[]
  appUrl: string | null
  logoUrl: string | null
  theme: Theme | null
  bambooEnabled: boolean
  bambooSubdomain: string | null
  bambooKeyEnv: string
  bambooKeyPresent: boolean
  chatSpace: string | null
  active: boolean
  isOpen: boolean
  refusedSignIns: number
  kudoCount: number
  people: { id: string; fullName: string; email: string; role: string; isPlatformOwner: boolean; isTester: boolean }[]
}

const EMPTY: CompanyInput = {
  name: "", shortName: null, slug: "", domains: "", appUrl: null, logoUrl: null, theme: null,
  bambooEnabled: false, bambooSubdomain: null, chatSpace: null, active: true,
}

function toInput(c: CompanyRow): CompanyInput {
  return {
    name: c.name, shortName: c.shortName, slug: c.slug, domains: c.domains.join(", "), appUrl: c.appUrl, logoUrl: c.logoUrl,
    theme: c.theme, bambooEnabled: c.bambooEnabled, bambooSubdomain: c.bambooSubdomain,
    chatSpace: c.chatSpace, active: c.active,
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="plat-field">
      <span className="adj-label">{label}</span>
      {children}
    </label>
  )
}

function CompanyForm({
  initial,
  onSubmit,
  submitLabel,
  slugLocked,
}: {
  initial: CompanyInput
  onSubmit: (v: CompanyInput) => Promise<{ error?: string }>
  submitLabel: string
  slugLocked?: boolean
}) {
  const [v, setV] = useState<CompanyInput>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, start] = useTransition()
  const set = <K extends keyof CompanyInput>(k: K, val: CompanyInput[K]) => { setV((p) => ({ ...p, [k]: val })); setSaved(false) }
  const text = (k: keyof CompanyInput) => ({
    value: (v[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value || null) as never),
    className: "adj-input",
  })

  return (
    <div className="plat-form">
      <div className="plat-grid">
        <Field label="Name"><input {...text("name")} /></Field>
        <Field label="Short name (phones)"><input {...text("shortName")} placeholder="e.g. LCED" maxLength={24} /></Field>
        <Field label="Slug (for env keys)"><input {...text("slug")} disabled={slugLocked} /></Field>
        <Field label="Sign-in email domains (comma separated)"><input {...text("domains")} placeholder="example.com, alias.com" /></Field>
        <Field label="Company address"><input {...text("appUrl")} placeholder="https://spotlight.example.com" /></Field>
        <Field label="Logo URL"><input {...text("logoUrl")} placeholder="https://…" /></Field>
        <Field label="BambooHR subdomain"><input {...text("bambooSubdomain")} placeholder="yourco" /></Field>
        <Field label="Google Chat space"><input {...text("chatSpace")} placeholder="spaces/XXXX" /></Field>
      </div>
      <div className="plat-checks">
        <label><input type="checkbox" checked={v.bambooEnabled} onChange={(e) => set("bambooEnabled", e.target.checked)} /> BambooHR connected (read-only)</label>
        <label><input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} /> Company active</label>
      </div>
      <ThemeEditor value={v.theme} onChange={(t) => set("theme", t)} />
      {error && <p className="prog-error">{error}</p>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={isPending}
        onClick={() => start(async () => {
          setError(null)
          const res = await onSubmit(v)
          if (res.error) setError(res.error)
          else setSaved(true)
        })}
      >
        {isPending ? "Saving…" : saved ? "Saved" : submitLabel}
      </button>
    </div>
  )
}

// 14-color palette with a live WCAG AA check of every text and button pair.
// The server re-checks and refuses a failing palette.
function ThemeEditor({ value, onChange }: { value: Theme | null; onChange: (t: Theme | null) => void }) {
  const t = value ?? DEFAULT_THEME
  const pairs = themeContrastPairs(t)
  const failing = pairs.filter((p) => !p.ok)
  const HEX = /^#[0-9a-f]{6}$/i
  return (
    <div className="plat-theme">
      <div className="plat-theme-head">
        <span className="adj-label">Color palette</span>
        <label>
          <input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : { ...DEFAULT_THEME })} />{" "}
          Use Spotlight default
        </label>
      </div>
      {value !== null && (
        <div className="plat-theme-grid">
          {THEME_KEYS.map((k) => (
            <label key={k} className="plat-theme-field">
              <input
                type="color"
                aria-label={THEME_LABELS[k]}
                value={HEX.test(t[k]) ? t[k] : "#000000"}
                onChange={(e) => onChange({ ...t, [k]: e.target.value })}
              />
              <input
                className="adj-input"
                value={t[k]}
                onChange={(e) => onChange({ ...t, [k]: e.target.value.trim().toLowerCase() })}
              />
              <span className="plat-theme-label">{THEME_LABELS[k]}</span>
            </label>
          ))}
        </div>
      )}
      <p className={failing.length ? "prog-error" : "plat-theme-ok"}>
        {failing.length
          ? `${failing.length} of ${pairs.length} pairs are too low: ${failing.map((p) => `${p.use} (${p.ratio}:1, needs ${p.min}:1)`).join(", ")}`
          : `All ${pairs.length} pairs pass WCAG AA (4.5:1 for text, 3:1 for field borders).`}
      </p>
    </div>
  )
}

function LaunchSwitch({ c }: { c: CompanyRow }) {
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const testers = c.people.filter((p) => p.isTester).length
  return (
    <div className={`plat-launch ${c.isOpen ? "is-open" : ""}`}>
      <div className="plat-launch-info">
        <div className="plat-launch-state">{c.isOpen ? "Open to everyone" : "Closed: coming soon"}</div>
        <div className="plat-launch-hint">
          {c.isOpen
            ? "Everyone from this company's domains can sign in. Chat posts and the allowance reset run."
            : `Only platform owners, admins and testers (${testers}) can sign in. No Chat posts or allowance reset; BambooHR sync still runs (read-only). ${c.refusedSignIns} refused sign-in${c.refusedSignIns === 1 ? "" : "s"} so far.`}
        </div>
        {error && <div className="prog-error">{error}</div>}
      </div>
      <button
        className={c.isOpen ? "role-change-btn" : "btn btn-primary"}
        disabled={isPending}
        onClick={() => start(async () => {
          setError(null)
          const msg = c.isOpen
            ? `Close Spotlight for ${c.name}? Only admins and testers will be able to sign in.`
            : `Open Spotlight for ${c.name}? Everyone from ${c.domains.join(", ")} will be able to sign in.`
          if (!window.confirm(msg)) return
          const res = await setCompanyOpen(c.id, !c.isOpen)
          if (res.error) setError(res.error)
        })}
      >
        {c.isOpen ? "Close Spotlight" : "Open Spotlight"}
      </button>
    </div>
  )
}

function RoleRow({ p }: { p: CompanyRow["people"][number] }) {
  const [isPending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const next = p.role === "admin" ? "member" : "admin"
  return (
    <div className="plat-person">
      <div className="plat-person-info">
        <div className="people-name">{p.fullName}{p.isPlatformOwner ? " · platform owner" : ""}</div>
        <div className="people-email">{p.email}</div>
        {error && <div className="prog-error">{error}</div>}
      </div>
      <label className="plat-tester">
        <input
          type="checkbox"
          checked={p.isTester}
          disabled={isPending}
          onChange={(e) => {
            const value = e.target.checked
            start(async () => {
              setError(null)
              const res = await setTester(p.id, value)
              if (res.error) setError(res.error)
            })
          }}
        />
        Tester
      </label>
      <span className={`role-badge role-badge-${p.role}`}>{p.role}</span>
      <button
        className="role-change-btn"
        disabled={isPending}
        onClick={() => start(async () => {
          setError(null)
          const res = await changeRole(p.id, next)
          if (res.error) setError(res.error)
        })}
      >
        Make {next}
      </button>
    </div>
  )
}

export default function CompanyEditor({ companies, currentCompanyId }: { companies: CompanyRow[]; currentCompanyId: string }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {companies.map((c) => (
        <div key={c.id} className="card">
          <div className="card-header" style={{ marginBottom: 8 }}>
            <h2 className="card-title">
              {c.name} {c.id === currentCompanyId && <span className="people-you">yours</span>}
              {!c.active && <span className="inc-admin-badge inc-badge-inactive" style={{ marginLeft: 8 }}>Inactive</span>}
              {!c.isOpen && <span className="inc-admin-badge inc-badge-inactive" style={{ marginLeft: 8 }}>Coming soon</span>}
            </h2>
            <button className="role-change-btn" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
              {openId === c.id ? "Close" : "Manage"}
            </button>
          </div>
          <div className="plat-summary">
            <span>{c.domains.join(", ")}</span>
            <span>{c.people.length} active people</span>
            <span>{c.kudoCount} kudos</span>
            <span>
              BambooHR: {c.bambooEnabled ? `on (${c.bambooKeyPresent ? "key set" : `missing ${c.bambooKeyEnv}`})` : "off"}
            </span>
          </div>
          {openId === c.id && (
            <>
              <LaunchSwitch c={c} />
              <CompanyForm initial={toInput(c)} submitLabel="Save company" slugLocked onSubmit={(v) => updateCompany(c.id, v)} />
              <h3 className="plat-subtitle">Roles and testers</h3>
              <div className="plat-people">
                {c.people.map((p) => <RoleRow key={p.id} p={p} />)}
              </div>
            </>
          )}
        </div>
      ))}

      <div className="card">
        <div className="card-header" style={{ marginBottom: creating ? 16 : 0 }}>
          <h2 className="card-title">New company</h2>
          <button className="role-change-btn" onClick={() => setCreating((x) => !x)}>{creating ? "Close" : "Add"}</button>
        </div>
        {creating && (
          <CompanyForm initial={EMPTY} submitLabel="Create company" onSubmit={async (v) => {
            const res = await createCompany(v)
            return res.error ? { error: res.error } : {}
          }} />
        )}
      </div>
    </div>
  )
}
