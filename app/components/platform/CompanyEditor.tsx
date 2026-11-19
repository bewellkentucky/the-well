"use client"

import { useState, useTransition } from "react"
import { createCompany, updateCompany, type CompanyInput } from "@/app/actions/platform"
import { changeRole } from "@/app/actions/adminPeople"

export type CompanyRow = {
  id: string
  name: string
  shortName: string | null
  slug: string
  domains: string[]
  appUrl: string | null
  logoUrl: string | null
  brandColor: string | null
  bambooEnabled: boolean
  bambooSubdomain: string | null
  bambooKeyEnv: string
  bambooKeyPresent: boolean
  chatSpace: string | null
  active: boolean
  kudoCount: number
  people: { id: string; fullName: string; email: string; role: string; isPlatformOwner: boolean }[]
}

const EMPTY: CompanyInput = {
  name: "", shortName: null, slug: "", domains: "", appUrl: null, logoUrl: null, brandColor: null,
  bambooEnabled: false, bambooSubdomain: null, chatSpace: null, active: true,
}

function toInput(c: CompanyRow): CompanyInput {
  return {
    name: c.name, shortName: c.shortName, slug: c.slug, domains: c.domains.join(", "), appUrl: c.appUrl, logoUrl: c.logoUrl,
    brandColor: c.brandColor, bambooEnabled: c.bambooEnabled, bambooSubdomain: c.bambooSubdomain,
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
        <Field label="Brand color"><input {...text("brandColor")} placeholder="#c2410c" /></Field>
        <Field label="BambooHR subdomain"><input {...text("bambooSubdomain")} placeholder="yourco" /></Field>
        <Field label="Google Chat space"><input {...text("chatSpace")} placeholder="spaces/XXXX" /></Field>
      </div>
      <div className="plat-checks">
        <label><input type="checkbox" checked={v.bambooEnabled} onChange={(e) => set("bambooEnabled", e.target.checked)} /> BambooHR connected (read-only)</label>
        <label><input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} /> Company active</label>
      </div>
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
              <CompanyForm initial={toInput(c)} submitLabel="Save company" slugLocked onSubmit={(v) => updateCompany(c.id, v)} />
              <h3 className="plat-subtitle">Roles</h3>
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
