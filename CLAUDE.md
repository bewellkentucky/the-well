# The Well — Project Context for Claude Code

This file is read automatically by Claude Code. It captures everything about the
project so any session starts with full context. Keep it updated as decisions change.

## What this is

**The Well** is an internal employee recognition app for **Be Well Kentucky (BWK)**,
a behavioral health practice owned by Justin Wallen. Be Well Kentucky and **Louisville
Center for Eating Disorders (LCED)** are two related organizations that share one
Google Workspace domain (`@bewellkentucky.com`). ~28 staff total.

Staff give each other **kudos** (peer recognition) tied to company values. Kudos carry
**drops** (the in-app currency, symbol `d`), which staff redeem for rewards (swag, gift
cards, gifted PTO). Staff also earn drops through **incentives** (specific actions like
getting a Google review or a flu shot). It's like Bonusly/Nectar, but built specifically
for a small behavioral-health practice.

## Current state

There is a complete, working **HTML/JS prototype** at `prototype/the-well-prototype.html`
(~6000 lines, single file, mock data). It demonstrates every feature and is the source of
truth for product behavior and visual design. The real build does not exist yet — the next
job is turning the prototype into a real Next.js app.

**We are at the very start of the real build.** Google OAuth credentials have been created
(Internal consent screen + Web OAuth client). Nothing else is built yet.

## The build, in order

See `docs/build-plan.md` for the full spec. Summary of the intended path:

1. **Google auth** (DONE in console — OAuth client created, Internal consent screen).
   Credentials go in `.env.local` (see `.env.local.template`).
2. **Next.js app scaffold** + Auth.js (NextAuth v5) Google sign-in, domain-locked to
   `@bewellkentucky.com`. THIS IS THE NEXT CODING STEP.
3. **Postgres database** (Supabase) + Prisma schema. Users created on first login.
4. **Directory sync** (optional) — Google Workspace service account to pre-populate users.
5. **BambooHR integration** — HR enrichment (hire date, birthday, supervisor, entity,
   time-off). See `docs/bamboohr-integration.md`.
6. **Google Chat integration** — kudos posted to #kudos space + DMs. See `docs/chat-integration.md`.
7. **Reward fulfillment** — Tremendous (gift cards), Printful (swag), internal (PTO/CEU).
   See `docs/fulfillment-integration.md`.

## Tech stack (decided)

- **Next.js 15** (App Router) + TypeScript
- **Auth.js / NextAuth v5** with Google provider, `hd` + domain check locking to bewellkentucky.com
- **Postgres** on **Supabase** (free/Pro tier)
- **Prisma** ORM
- **Vercel** hosting (free/near-free at 28 users)
- **Resend** for the ~5 transactional emails (Chat handles most notifications)
- Production URL: **thewell.bewellkentucky.com**
- Local dev: localhost:3000

## Key product decisions (don't relitigate without reason)

- **Identity = Google Workspace. HR enrichment = BambooHR.** Join key: Bamboo `workEmail`
  = Google `primaryEmail`. Google CREATES users; Bamboo only UPDATES them (use `undefined`
  not `null` for missing Bamboo fields so data isn't wiped). Deactivate, never delete.
- **Currency is "drops" (symbol `d`).** NOT nectar, NOT a bee. The signature reaction emoji
  is the water droplet 💧 (ties to the well/drops metaphor). The product was briefly called
  "Honeycomb" with "nectar" — all of that is gone. Do not reintroduce bee/honey/nectar in
  user-facing text. (Note: internal CSS color variables are still named `--honey`/`--honey-deep`
  — those are just the sage-green palette names, never user-visible, fine to leave.)
- **Public/private kudo toggle.** Public (default) posts to #kudos + the feed. Private goes
  only to the recipient's DM, visible to sender + recipient + Owner only.
- **Entity field (BWK/LCED/Both) is back-office only.** Removed from the Feed and Team
  directory because staff overlap so much the distinction is meaningless for recognition.
  KEPT in Admin → Reports for cost attribution (which org's books a reward cost lands on).
- **Incentives** have two verification modes: self-attest (instant credit) and admin-verify
  (goes to an approvals queue; supports link + screenshot proof upload).
- **Reactions are NOT synced between the app and Google Chat** (v1). Two separate pools.
  See `docs/chat-integration.md` for the reasoning.
- **No app store.** It's a PWA — people add it to their home screen. App name "The Well".
- **HIPAA posture:** The Well is not a PHI system, but staff could write patient details into
  a kudo. Composer carries a "no patient details" notice; never log message content in
  plaintext to error trackers. Vercel/Supabase free tiers have no BAA; Google Cloud Run +
  Cloud SQL is the documented fallback if formal BAA coverage is ever needed.

## Brand

- **Name:** The Well. Tagline context: "by Be Well Kentucky".
- **Logo:** the BWK mountain-with-lake mark (`brand-icon.png`). Navy mountain, lighter-blue
  lake, two birds. (Source file was a JPEG with a black background; the version here has
  transparency. For production, get a proper SVG from BWK's brand assets.)
- **Palette:** slate `#2a3441`, sage `#7a9b7e`, terracotta `#c97b5c`, warm cream `#f4f1ec`,
  plum `#6b5b73` (used for the private-kudo accent).
- **Type:** Lora (serif) for headings, Inter for body, JetBrains Mono for numbers/labels.
- **Voice:** warm, calm, human. No em dashes in user-facing text (use commas, colons,
  periods, or parentheses). No emoji spam.

## The roster (real names — used in prototype mock data)

Admins/Owner:
- **Justin Wallen** — Owner, Business Manager — justin.wallen@bewellkentucky.com
- **Alecia Williams** — Admin — alecia.williams@bewellkentucky.com
- **Callie Ernspiker** — Admin, Practice Administrator — callie.ernspiker@bewellkentucky.com
- **Megan Abrams** — Admin — megan.abrams@bewellkentucky.com
- **Brenda Arellano** — Admin, Employee Engagement Lead — brenda.arellano@bewellkentucky.com

Other staff referenced in mock data: Melissa Gibson (Clinical Director), Hayley Meadows
(Associate Director), Tom Bivona (Therapist), Bryn Krivashei (Therapist), Emily Swartz
(new LCED hire). (Skyler Mitchell was removed from all data.)

## Conventions

- Email format: `firstname.lastname@bewellkentucky.com`
- Don't commit `.env.local`. Copy `.env.local.template` → `.env.local` and fill in.
- When in doubt about a feature's intended behavior, open the prototype and match it.

## How to help

When asked to build, prefer matching the prototype's behavior and the decisions above.
Read the relevant doc in `docs/` before implementing an integration. Ask before
introducing a new dependency or changing a decided architecture choice.
