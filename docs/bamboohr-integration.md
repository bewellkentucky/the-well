# The Well, BambooHR Integration Addendum

Adding BambooHR alongside Workspace. Workspace stays the **identity source** (login, email, name); BambooHR becomes the **HR data source** (hire date, birthday, supervisor, location, time-off, custom fields like Entity).

---

## 1. Why BambooHR Wins Over Other Options

For Be Well / LCED specifically:

| Source | Birthdays | Hire dates | Time-off | Manager hierarchy | Custom fields | Webhooks |
|---|---|---|---|---|---|---|
| **BambooHR** | ✅ canonical | ✅ canonical | ✅ live | ✅ | ✅ unlimited | ✅ real-time |
| Workspace custom schemas | manual upkeep | manual upkeep | ❌ | partial | limited | ❌ |
| Gusto | ✅ (DOB) | ✅ | ❌ | ❌ | ❌ | ❌ payroll-focused |

You already maintain BambooHR as the HR system of record, so this becomes the natural source. The only gotcha: in your case there's a real possibility BambooHR is a **single tenant for both Be Well and LCED**, in which case you'll filter employees by a custom field ("Entity": BWK / LCED / Both). If they're separate Bamboo tenants, you'll just configure two API keys and sync them in sequence.

---

## 2. Authentication (Simpler Than Workspace)

For an internal tool you own, **API key auth is the right call**. OAuth 2.0 is for SaaS products integrating against *other people's* Bamboo accounts; you're integrating against yours.

### Generate the API key
1. Log in to BambooHR as a **user with admin/HR access**, the key inherits that user's field-level permissions. Generate it as `justin@bewellkentucky.com` or a dedicated `thewell-integration@bewellkentucky.com` admin user.
2. Click your profile (top right or lower left depending on UI version) → **API Keys**.
3. **Add New Key**, name it "The Well Integration".
4. **Copy it immediately, it's shown once.** Store as env var `BAMBOOHR_API_KEY`.

### Auth format (this is the only quirk)
HTTP Basic Auth, but the API key is the **username** and any string is the **password**. Convention is `x`:

```bash
curl https://api.bamboohr.com/api/gateway.php/bewellky/v1/employees/directory \
  -u "YOUR_API_KEY:x" \
  -H "Accept: application/json"
```

The other quirk: **default response is XML**. Always set `Accept: application/json` or you'll get angle brackets.

---

## 3. The Endpoints You'll Use

The BambooHR docs list ~80 endpoints. You only need five. Replace `bewellky` with your actual BambooHR subdomain (the part before `.bamboohr.com`).

| Purpose | Endpoint | Notes |
|---|---|---|
| Discover available fields | `GET /v1/meta/fields` | Run once at setup to find your custom field IDs (e.g. "Entity" → `customField_5021`). Cache the mapping. |
| Initial full sync | `GET /v1/employees/directory` | Lightweight directory dump (limited fields). |
| Enrich each employee | `GET /v1/employees/{id}?fields=...` | Full record with the fields you specify. Cap is **400 fields per request**, easy stay under for a normal record. |
| Incremental sync | `GET /v1/employees/changed?since={ISO8601}&type=updated` | Only employees changed since last sync. Use this instead of full re-syncs after the first run. |
| Out today | `GET /v1/time_off/whos_out?start=YYYY-MM-DD&end=YYYY-MM-DD` | For the "Out today" feed widget. |

**Field names**: `firstName`, `lastName`, `preferredName`, `workEmail`, `hireDate`, `dateOfBirth`, `jobTitle`, `department`, `location`, `supervisor`, `employmentHistoryStatus`, plus your custom field IDs from step 1.

---

## 4. The Sync Script

Adds onto the Workspace sync from the main plan. Conceptually: **Workspace runs first** (sets the identity floor), **Bamboo enriches second** (joined on email).

```typescript
// /scripts/sync-bamboohr.ts
import { db } from "../lib/db"

const SUBDOMAIN = process.env.BAMBOOHR_SUBDOMAIN!  // "bewellky"
const API_KEY = process.env.BAMBOOHR_API_KEY!
const BASE = `https://api.bamboohr.com/api/gateway.php/${SUBDOMAIN}/v1`

// Pre-encoded auth header
const AUTH = "Basic " + Buffer.from(`${API_KEY}:x`).toString("base64")

const FIELDS_TO_FETCH = [
  "id", "workEmail", "firstName", "lastName", "preferredName",
  "jobTitle", "department", "location", "supervisor",
  "hireDate", "dateOfBirth", "employmentHistoryStatus",
  // Custom: replace with your actual field ID from /v1/meta/fields
  "customField_5021",  // "Entity": BWK | LCED | Both
].join(",")

async function bamboo(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: AUTH,
      Accept: "application/json",
    },
  })
  // BambooHR returns 503 (not 429) for rate limits — ~100 req/min cap
  if (res.status === 503) {
    await new Promise(r => setTimeout(r, 30_000))
    return bamboo(path)
  }
  if (!res.ok) throw new Error(`BambooHR ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function syncBambooHR(opts: { since?: Date } = {}) {
  // Incremental if we've synced before, full otherwise
  const employeeIds = opts.since
    ? Object.keys((await bamboo(
        `/employees/changed?since=${opts.since.toISOString()}&type=updated`
      )).employees ?? {})
    : (await bamboo(`/employees/directory`)).employees.map((e: any) => e.id)

  let enriched = 0
  for (const id of employeeIds) {
    try {
      const emp = await bamboo(`/employees/${id}?fields=${FIELDS_TO_FETCH}`)
      if (!emp.workEmail) continue  // shared mailboxes etc. — skip

      // Workspace is source of truth for identity. Bamboo enriches.
      const user = await db.user.findUnique({
        where: { email: emp.workEmail.toLowerCase() },
      })
      if (!user) {
        // BambooHR has them, Workspace doesn't — probably terminated
        // in Workspace but not in Bamboo, or contractor without an account.
        // Log it and skip.
        console.warn(`Bamboo employee ${emp.workEmail} not in Workspace`)
        continue
      }

      await db.user.update({
        where: { id: user.id },
        data: {
          bambooId: emp.id,
          fullName: emp.preferredName
            ? `${emp.preferredName} ${emp.lastName}`
            : `${emp.firstName} ${emp.lastName}`,
          title: emp.jobTitle ?? user.title,
          department: emp.department,
          location: emp.location,
          supervisor: emp.supervisor,
          hireDate: emp.hireDate ? new Date(emp.hireDate) : null,
          birthday: emp.dateOfBirth ? new Date(emp.dateOfBirth) : null,
          employmentStatus: emp.employmentHistoryStatus,
          entity: emp.customField_5021 ?? user.entity,
        },
      })
      enriched++
    } catch (err) {
      console.error(`Failed to sync ${id}:`, err)
    }
  }

  // Sync time-off for "Out today" widget
  const today = new Date().toISOString().split("T")[0]
  const oneWeek = new Date(Date.now() + 7 * 86400e3).toISOString().split("T")[0]
  const out = await bamboo(`/time_off/whos_out?start=${today}&end=${oneWeek}`)

  await db.timeOff.deleteMany({})
  for (const entry of out) {
    if (entry.type !== "timeOff") continue
    await db.timeOff.create({
      data: {
        bambooEmployeeId: String(entry.employeeId),
        name: entry.name,
        start: new Date(entry.start),
        end: new Date(entry.end),
        type: entry.type,
      },
    })
  }

  return { enriched, lastSync: new Date() }
}
```

---

## 5. The Better Move: Webhooks Instead of Polling

For ~30 employees you could happily poll the `changed` endpoint every hour. But webhooks are nicer, birthdays and anniversaries appear in The Well the moment HR updates Bamboo.

**Two webhook flavors** in BambooHR, pick **Permissioned Webhooks** (created via API, tied to your API key's permissions). Global Webhooks are admin-UI-only and less flexible.

### Setup

```typescript
// /scripts/setup-bamboohr-webhooks.ts
await bamboo("/webhooks", {
  method: "POST",
  body: JSON.stringify({
    name: "The Well Sync",
    url: "https://thewell.bewellkentucky.com/api/webhooks/bamboohr",
    format: "json",
    privateKey: process.env.BAMBOOHR_WEBHOOK_SECRET,
    monitorFields: [
      "firstName", "lastName", "preferredName", "jobTitle",
      "department", "hireDate", "dateOfBirth", "supervisor",
      "location", "customField_5021",
    ],
    postFields: [
      "id", "workEmail", "firstName", "lastName", "preferredName",
      "jobTitle", "department", "hireDate", "dateOfBirth", "supervisor",
      "location", "customField_5021",
    ],
    includeCreated: true,
    includeUpdated: true,
    includeDeleted: false,  // BambooHR rarely hard-deletes
  }),
})
```

### Handler

```typescript
// /app/api/webhooks/bamboohr/route.ts
import crypto from "crypto"

export async function POST(req: Request) {
  const sig = req.headers.get("x-bamboohr-signature")
  const raw = await req.text()
  const expected = crypto
    .createHmac("sha256", process.env.BAMBOOHR_WEBHOOK_SECRET!)
    .update(raw)
    .digest("hex")
  if (sig !== expected) return new Response("Unauthorized", { status: 401 })

  const payload = JSON.parse(raw)
  // payload.employees is keyed by employeeId
  for (const [empId, change] of Object.entries(payload.employees ?? {})) {
    // change.fields has the new values; sync just that record
    await syncSingleBambooEmployee(empId)
  }
  return Response.json({ ok: true })
}
```

---

## 6. Things That Will Bite You

These are real, worth knowing before you ship.

1. **API key is silently scoped to the creator's permissions.** If you generate the key as a user without access to `dateOfBirth`, that field will be **silently omitted** from responses with no error. Always test with a superuser-generated key first; if a field is missing in the response, suspect permissions before logic bugs.

2. **Rate limit is undocumented but real: ~100 req/min.** Hits return **503 Service Unavailable**, not the standard 429. The handler above sleeps 30s on 503 and retries, which is plenty for your scale (you'd only burn through 100 requests if Bamboo had ~100 employees changing simultaneously, which it won't).

3. **Default response is XML.** Forget the `Accept: application/json` header and parsing will look weird. The wrapper above handles this.

4. **Custom field IDs are per-tenant, not stable.** `customField_5021` for Entity in your account is some other number in someone else's. Always look up custom field IDs at runtime via `/v1/meta/fields`, store the mapping in your DB, and refer to fields by **purpose** (Entity) in your code, not by raw ID.

5. **Updates are POST, not PUT or PATCH.** If you ever need to write back (e.g. a "promote to admin" action that updates Bamboo), it's `POST /v1/employees/{id}` with the fields you want to change. Unrecognized fields → 400, no partial success.

6. **Terminated employees stay in BambooHR.** They don't disappear from `/employees/directory`. To exclude them, filter by `employmentHistoryStatus != "Terminated"` or check the employmentStatus table. The merge logic in the sync handles this implicitly because terminated employees usually lose their Workspace account → no match → they fall out of the merged directory naturally.

7. **OAuth migration warning.** BambooHR has been pushing third-party SaaS apps toward OAuth 2.0 since 2025, but for **first-party internal integrations like The Well, API keys remain fully supported**. You don't need OAuth. Don't let the "OAuth migration" headlines spook you into doing unnecessary work.

---

## 7. The Updated Schema

Add these fields to the `User` model in the main plan:

```prisma
model User {
  // ... everything from the main plan stays ...

  // BambooHR enrichment
  bambooId         String?
  supervisor       String?
  location         String?
  employmentStatus String?  // Full-Time, Part-Time, Terminated, etc.
}

model TimeOff {
  id               String   @id @default(cuid())
  bambooEmployeeId String
  name             String
  start            DateTime
  end              DateTime
  type             String   // "timeOff" | "holiday"

  @@index([start, end])
}

model IntegrationSync {
  id        String   @id @default(cuid())
  source    String   // "workspace" | "bamboohr"
  lastRunAt DateTime @default(now())
  recordsProcessed Int
  errors    Int      @default(0)
  notes     String?
}
```

The `IntegrationSync` table is the breadcrumb for incremental sync, when you call `/employees/changed`, you pass `since = lastRunAt` for the `source = "bamboohr"` row.

---

## 8. Cron Schedule

In `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/sync-workspace", "schedule": "0 */6 * * *" },
    { "path": "/api/cron/sync-bamboo-changed", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/sync-bamboo-timeoff", "schedule": "0 7 * * *" }
  ]
}
```

- Workspace: every 6h (slow-moving, identity-level changes are rare)
- Bamboo changed: every 30 min (catches anything webhooks missed)
- Time-off: daily at 7 AM Eastern (refresh the "Out today" view before the workday starts)

If you set up webhooks, the 30-minute Bamboo poll can drop to once daily as a safety net.

---

## 9. Updated Build Order

The original two-weekend plan grows by ~half a weekend:

**Weekend 1, Foundation (unchanged)**

**Weekend 2, Make it real, now with BambooHR**
1. Wire composer to DB (~2h)
2. Allowance accounting + weekly cron (~1h)
3. **Set up BambooHR API key + write `meta/fields` discovery script** (~1h)
4. **Build the merge-sync script (Workspace then Bamboo)** (~2h)
5. **Configure Bamboo webhook + handler with signature verification** (~1.5h)
6. Rewards catalog + redemption (~2h)
7. Gmail digest (~2h)
8. Deploy to Vercel (~1h)

**Optional polish:**
- Slack webhook for #kudos
- "Out today" widget on the feed (uses the time-off table)
- Auto-prompted celebration cards for birthdays/anniversaries (cron checks the synced data daily)

---

## 10. The Decision That Actually Matters

The one BambooHR setup choice that affects everything else:

**Where does the "Entity" (BWK / LCED / Both) for each employee live?**

Three options:

1. **BambooHR custom field** ("Entity" with values BWK / LCED / Both, set per employee). The Well reads it during sync. ✅ Recommended. HR maintains it where they already maintain everything else.
2. **Domain-derived** (everyone at `bewellkentucky.com` is BWK, everyone at `lcedky.com` is LCED, dual-entity people get flagged as "Both" via a separate list in The Well admin). Works but creates a maintenance burden for the "Both" exceptions.
3. **In The Well only** (admins toggle per user). Drift-prone.

Option 1 is the right answer, and the addendum's sync code assumes it. The setup work is small: log into BambooHR → Settings → Custom Fields → Add → "Entity" (dropdown: BWK, LCED, Both) → bulk-fill it once. Then call `/v1/meta/fields` to find its `customField_NNNN` ID and put that in `BAMBOOHR_ENTITY_FIELD_ID`.

---

That's the whole BambooHR layer. The next concrete step is generating the API key and running `curl https://api.bamboohr.com/api/gateway.php/{your-subdomain}/v1/meta/fields -u "KEY:x" -H "Accept: application/json"` once, that gives you a complete picture of the schema you have to work with, including every custom field your account has accumulated over the years.
