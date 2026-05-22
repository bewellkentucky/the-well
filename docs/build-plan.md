# The Well, Real Build Plan

A pragmatic architecture for taking the prototype to a working internal tool for Be Well Kentucky and LCED.

---

## 1. The Stack (Recommended)

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) + Tailwind | SSR, easy auth integration, ships with the look you already have |
| **Auth** | Auth.js (formerly NextAuth) with Google provider | Handles OAuth + JWT sessions in ~20 lines; native `hd` domain restriction |
| **Database** | Postgres (Supabase or Neon) | Free tier covers a ~30-person org for a long time; SQL keeps reporting easy |
| **ORM** | Prisma | Type-safe, great migrations |
| **Directory sync** | Google Admin SDK Directory API via a service account, cron'd as a Vercel Cron Job or GitHub Action | Pulls users every 6h; doesn't depend on someone being logged in |
| **Hosting** | Vercel (free tier) | Zero-config deploy from GitHub |
| **File storage** (avatars) | Workspace `thumbnailPhotoUrl` directly, cached in S3/R2 if needed | Free; already exists |

Total monthly cost at your scale: **$0–$5** (Postgres on Supabase free tier, Vercel hobby, Google APIs are free under quota).

If you want simpler, swap Next.js for **Remix + SQLite on Fly.io**, also free, also fine. The Next.js + Vercel + Supabase combo is just the most "off-the-shelf" path.

---

## 2. Google Cloud Setup (one-time, ~30 min)

Two separate Google identities are needed: an **OAuth client** (for sign-in) and a **service account** (for directory sync). They live in the same Google Cloud project.

### Step 1, Create a Google Cloud project
- Console: https://console.cloud.google.com
- New project: "thewell-prod"
- Link it to your **bewellkentucky.com** Workspace organization (so Workspace admin actions are scoped correctly)

### Step 2, Enable APIs
In APIs & Services → Library, enable:
- **Admin SDK API** (for directory sync)
- **Google People API** (optional, for richer profile fields)

### Step 3, OAuth client (for "Sign in with Google")
1. APIs & Services → OAuth consent screen
   - User type: **Internal** (this is the magic, Internal means only your @bewellkentucky.com Workspace users can ever sign in, enforced by Google, no app-verification review needed)
   - App name: "The Well"
   - Support email: justin.wallen@bewellkentucky.com
   - Authorized domain: `bewellkentucky.com` (single domain, both BWK and LCED staff are on it)
   - Scopes: `openid`, `email`, `profile`
2. APIs & Services → Credentials → Create OAuth client ID
   - Type: Web application
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (dev)
     - `https://thewell.bewellkentucky.com/api/auth/callback/google` (prod)
   - Save the **Client ID** and **Client Secret** → env vars

### Step 4, Service account (for directory sync)
1. IAM & Admin → Service Accounts → Create
   - Name: "thewell-directory-sync"
2. Create a JSON key → download → store as env var `GOOGLE_SERVICE_ACCOUNT_JSON`
3. Note the service account's **Client ID** (a long number)

### Step 5, Domain-wide delegation (the GAM equivalent)
This is the step that gives the service account permission to read your directory.

1. Go to **admin.google.com** → Security → API Controls → Domain-wide Delegation
2. Add new → paste the service account's Client ID
3. OAuth scopes: `https://www.googleapis.com/auth/admin.directory.user.readonly`

You now have everything GAM has, but programmatic. Your sync script will impersonate `justin.wallen@bewellkentucky.com` (a super-admin) when calling the API, same trust model as your existing GAM7 setup.

---

## 3. Two Code Pieces You'll Actually Write

### A. The sign-in handler (`/app/api/auth/[...nextauth]/route.ts`)

```typescript
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

const ALLOWED_DOMAINS = ["bewellkentucky.com", "lcedky.com"]

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // hd= restricts the picker to these domains; combined with the
          // signIn callback below, this is defense in depth
          hd: ALLOWED_DOMAINS.join(","),
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const domain = profile?.email?.split("@")[1]
      if (!domain || !ALLOWED_DOMAINS.includes(domain)) return false

      // Reject if not in our synced directory (i.e. they're a Workspace
      // user we haven't onboarded — e.g., shared inboxes, terminated)
      const user = await db.user.findUnique({
        where: { email: profile.email },
      })
      return user?.active === true
    },
    async session({ session, token }) {
      // Attach the database user id to the session so server actions
      // can authorize without re-querying
      const dbUser = await db.user.findUnique({
        where: { email: session.user.email! },
      })
      session.user.id = dbUser?.id
      session.user.entity = dbUser?.entity
      session.user.role = dbUser?.role
      return session
    },
  },
})
```

That's the whole login flow. Auth.js handles tokens, cookies, refresh, and CSRF.

### B. The directory sync job (`/scripts/sync-directory.ts`)

```typescript
import { google } from "googleapis"

const SCOPES = ["https://www.googleapis.com/auth/admin.directory.user.readonly"]
const DOMAINS = ["bewellkentucky.com", "lcedky.com"]
const IMPERSONATE = "justin@bewellkentucky.com"  // must be a super-admin

async function getDirectoryClient() {
  const auth = new google.auth.JWT({
    email: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!).client_email,
    key: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!).private_key,
    scopes: SCOPES,
    subject: IMPERSONATE,  // domain-wide delegation magic
  })
  return google.admin({ version: "directory_v1", auth })
}

export async function syncDirectory() {
  const admin = await getDirectoryClient()
  let totalUpserted = 0

  for (const domain of DOMAINS) {
    let pageToken: string | undefined
    do {
      const { data } = await admin.users.list({
        domain,
        maxResults: 500,
        pageToken,
        projection: "full",  // includes customSchemas, organizations, etc.
      })

      for (const u of data.users ?? []) {
        if (u.suspended || u.archived) continue
        if (u.kind !== "admin#directory#user") continue

        await db.user.upsert({
          where: { email: u.primaryEmail! },
          create: {
            email: u.primaryEmail!,
            fullName: u.name?.fullName ?? "",
            title: u.organizations?.[0]?.title ?? null,
            department: u.organizations?.[0]?.department ?? null,
            domain,
            entity: domain === "lcedky.com" ? "LCED" : "BWK",
            googleId: u.id!,
            thumbnailUrl: u.thumbnailPhotoUrl ?? null,
            hireDate: u.customSchemas?.thewell?.hire_date ?? null,
            birthday:  u.customSchemas?.thewell?.birthday ?? null,
            active: true,
          },
          update: {
            fullName: u.name?.fullName ?? "",
            title: u.organizations?.[0]?.title ?? null,
            department: u.organizations?.[0]?.department ?? null,
            thumbnailUrl: u.thumbnailPhotoUrl ?? null,
            hireDate: u.customSchemas?.thewell?.hire_date ?? null,
            birthday:  u.customSchemas?.thewell?.birthday ?? null,
            active: true,
          },
        })
        totalUpserted++
      }
      pageToken = data.nextPageToken ?? undefined
    } while (pageToken)
  }

  // Deactivate anyone we didn't see this sync (terminated employees)
  await db.user.updateMany({
    where: { updatedAt: { lt: new Date(Date.now() - 60_000) } },
    data: { active: false },
  })

  return { synced: totalUpserted, at: new Date() }
}
```

Run this on a cron:

```typescript
// /app/api/cron/sync/route.ts
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const result = await syncDirectory()
  return Response.json(result)
}
```

Add to `vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/sync", "schedule": "0 */6 * * *" }] }
```

---

## 4. Database Schema (Prisma)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  googleId     String?  @unique
  fullName     String
  title        String?
  department   String?
  domain       String   // bewellkentucky.com or lcedky.com
  entity       String   // BWK | LCED | Both
  thumbnailUrl String?
  hireDate     DateTime?
  birthday     DateTime?
  active       Boolean  @default(true)
  role         String   @default("member")  // member | admin

  monthlyAllowance Int  @default(100)
  balance          Int  @default(0)  // earned, redeemable
  givingBalance    Int  @default(100) // resets weekly/monthly

  kudosGiven    Kudo[] @relation("from")
  kudosReceived Kudo[] @relation("to")
  redemptions   Redemption[]
  reactions     Reaction[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Kudo {
  id        String   @id @default(cuid())
  fromId    String
  from      User     @relation("from", fields: [fromId], references: [id])
  toId      String
  to        User     @relation("to", fields: [toId], references: [id])
  amount    Int
  message   String
  values    String[] // ["Compassion", "Ownership"]
  entity    String   // for filtering
  createdAt DateTime @default(now())

  reactions Reaction[]

  @@index([toId, createdAt])
  @@index([fromId, createdAt])
}

model Reaction {
  id      String @id @default(cuid())
  kudoId  String
  kudo    Kudo   @relation(fields: [kudoId], references: [id])
  userId  String
  user    User   @relation(fields: [userId], references: [id])
  emoji   String

  @@unique([kudoId, userId, emoji])
}

model Reward {
  id          String  @id @default(cuid())
  title       String
  description String
  cost        Int
  category    String  // Swag | Gift Card | Time | Office | Team | Growth
  imageUrl    String?
  inventory   Int?    // null = unlimited
  active      Boolean @default(true)

  redemptions Redemption[]
}

model Redemption {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  rewardId  String
  reward    Reward   @relation(fields: [rewardId], references: [id])
  cost      Int
  status    String   @default("processing") // processing | shipped | delivered | used
  notes     String?
  createdAt DateTime @default(now())
}

model AllowanceReset {
  id        String   @id @default(cuid())
  userId    String
  amount    Int
  resetAt   DateTime @default(now())
}
```

---

## 5. Notifications (the part that makes it stick)

Recognition apps die when nobody sees the kudos. Three integrations make the difference:

1. **Email digest via Gmail API** (you have Workspace, no SendGrid needed), weekly Monday digest: "Here's what your team celebrated last week." Use the same service account.

2. **Slack-or-equivalent webhook**, if the team has a chat tool, post new kudos to `#kudos` automatically. If not, skip; Gmail digest is enough.

3. **Birthday/anniversary auto-prompts**, a daily cron that checks the directory, finds anyone with a milestone today, and posts a "celebrate Hayley's 3-year anniversary" prompt to the feed so people are reminded to write something.

---

## 6. Build Order (~2 weekends if you're hands-on)

**Weekend 1, Foundation**
1. Set up the Google Cloud project, OAuth, service account, domain-wide delegation (~1h)
2. Spin up Next.js + Postgres + Prisma + Auth.js skeleton (~2h)
3. Get sign-in working with domain restriction (~30 min once #1 and #2 are done)
4. Write and run the directory sync script (~2h)
5. Port the UI from the prototype HTML to React components (~4h, mostly mechanical)

**Weekend 2, Make it real**
1. Wire the composer to actually create kudos in the DB (~2h)
2. Allowance accounting + weekly cron to reset (~1h)
3. Rewards catalog admin + redemption flow (~3h)
4. Gmail-based weekly digest (~2h)
5. Deploy to Vercel, hook up a domain like `thewell.bewellkentucky.com` (~1h)

**Optional polish:**
- Slack webhook for #kudos
- Birthday/anniversary detection cron
- Admin panel for editing values, allowances, rewards inventory
- Export to CSV for end-of-quarter recognition reports

---

## 7. Things to Decide Up Front

- **Who's the super-admin the sync impersonates?** Almost certainly your `justin@bewellkentucky.com`. The service account JSON key effectively becomes a delegated credential, treat it like your GAM7 OAuth file.
- **Where does the birthday data come from?** Three options:
  1. Workspace custom user attributes (clean, but you'd populate them once via GAM: `gam update user X custom_schemas thewell birthday "1985-03-21"`)
  2. The Well-local table that admins edit in-app
  3. Import from Gusto via their API (you have access, could pull `date_of_birth` and `start_date` directly from the employee records you already manage there)
  
  Option 3 is probably the move since Gusto is already your source of truth for HR data.
- **Funding model**: who pays for redeemed swag/gift cards? Be Well, LCED, or split based on the recipient's entity? The schema already supports `entity` on every kudo, so the redemption can be charged to whichever org employs the recipient.
- **What's the URL?** Decided: **`thewell.bewellkentucky.com`**. Matches the product name directly, so the URL and brand stay consistent. Subdomain DNS on the bewellkentucky.com zone, pointed at the host (see Section 9). Access is gated by Google "Internal" auth, so the URL being public is fine: anyone can reach the login screen, only @bewellkentucky.com accounts can get in.

---

## 8. The Honest Risks

- **Workspace API quota**, you're nowhere near it (1M+ calls/day), but worth knowing.
- **Service account key rotation**, Google recommends every 90 days. Set a calendar reminder; it takes 5 minutes.
- **HIPAA**: The Well itself is not a covered system (no PHI in kudos messages), but staff might *write* PHI into a message. Add a notice on the composer and never log message content to error trackers in plaintext.
- **People being weird in kudos messages**, recognition tools can be misused (passive-aggressive notes, in-group exclusion). Worth having an "admin can hide a kudo" action and a clear policy in the SOP doc.

---

That's the whole thing. If you want, I can scaffold the Next.js repo as the next step, the Prisma schema, the auth route, the sync script, and a working `/api/kudos` endpoint, ready to push to GitHub.

---

## 9. Hosting & How People Reach It

### The URL
The app lives at **`thewell.bewellkentucky.com`**. People type that (or pin it to their phone home screen) and sign in with the @bewellkentucky.com Google account they already use for email. No new password.

The URL being publicly reachable is not a security concern. Security is two layers:
1. The URL resolves for anyone, they hit the login screen.
2. Only @bewellkentucky.com Google accounts can authenticate, enforced by Google because the OAuth consent screen is set to "Internal". A random Gmail is refused by Google with zero code on our side.

Never rely on a secret URL. Anyone can find the door; only staff have a key.

### Where it runs (recommended: Vercel + Supabase)
- **Vercel** hosts the Next.js app (frontend + API routes). Push to GitHub, auto-deploys, free SSL, scales to zero. At 28 people you live in/near the free tier.
- **Supabase** hosts Postgres (and can hold incentive-proof screenshot uploads in a storage bucket). Free tier covers the scale; the ~$25/mo Pro tier adds daily backups and no auto-pausing, worth it for something people rely on.
- Combined: **$0-25/month**. Lowest-effort path. This is the default.

### The HIPAA consideration (read before committing)
The Well is not a system of record for PHI, it's employee recognition. But it syncs employee data from BambooHR/Gusto and staff *could* write patient-identifying details into a kudo. Mitigations, in order of importance:
1. **Keep PHI out by design**, the app never ingests patient data from any clinical system. Composer carries a "never include patient names or identifying details" notice.
2. Free-tier Vercel/Supabase do **not** offer a BAA (Business Associate Agreement). Their BAA tiers are enterprise-priced ($599/mo Supabase Team, Vercel Enterprise), overkill here.
3. If formal BAA coverage is wanted without enterprise pricing, the clean alternative is **Google Cloud Run + Cloud SQL**: Google signs a BAA on standard pricing, and everything sits inside the Workspace relationship already managed via GAM7. Tradeoff: more setup, ~$15-40/mo (Cloud SQL has an always-on minimum). Because both paths use Postgres, a later Vercel→Google Cloud migration is real but not painful.
4. **Do NOT self-host** on an office box or generic VPS. You'd own OS patching, SSL renewal, backups, uptime, hardening, a missed patch is a bigger real-world risk than a reputable managed host.

**Recommendation:** start on Vercel + Supabase to get the program adopted fast; migrate to Google Cloud if/when compliance instinct wants the BAA. Before committing, send a two-line note to the malpractice/cyber insurance carrier describing the app and host, some policies have data-residency or BAA language for any staff/patient-adjacent system.

### DNS setup (≈10 min + propagation)
Same kind of work as the SPF/DKIM/DMARC records already done for the email-signature project.
1. In the bewellkentucky.com DNS zone, add a **CNAME**: `thewell` → the host's target (Vercel gives `cname.vercel-dns.com`; Google Cloud gives a load-balancer address).
2. Tell the host the app should answer at `thewell.bewellkentucky.com`, it auto-provisions the SSL cert.
3. Propagation: minutes to a couple hours.
4. Update the OAuth client's authorized redirect URI to `https://thewell.bewellkentucky.com/api/auth/callback/google`.

### Make it feel like an app (PWA, no app store)
No Apple App Store or Google Play needed, this is a web app at a URL, which sidesteps the entire store-review process. To make "Add to Home Screen" polished:
1. Add a **web app manifest** (`/public/manifest.json`): app name "The Well", `display: standalone` (opens full-screen, no browser chrome), theme color = BWK slate, icons using the BWK mountain mark at 192px and 512px.
2. Add the manifest link + iOS meta tags (`apple-touch-icon`, `apple-mobile-web-app-capable`) to the document head.
3. Result: people tap "Add to Home Screen", get a BWK-branded icon, and it launches like a native app.

This is the piece that turns a bookmark people forget into a daily-use icon on their phone. Worth doing before rollout.
