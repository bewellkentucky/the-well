export const ADMIN_TABS = [
  { id: "overview",     label: "Overview" },
  { id: "approvals",    label: "Approvals" },
  { id: "rewards",      label: "Rewards" },
  { id: "incentives",   label: "Incentives" },
  { id: "people",       label: "People" },
  { id: "reports",      label: "Reports" },
  { id: "integrations", label: "Integrations" },
  { id: "program",      label: "Program" },
  { id: "audit",        label: "Audit log" },
] as const

export type AdminTabId = (typeof ADMIN_TABS)[number]["id"]
