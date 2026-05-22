# The Well

Internal employee recognition app for Be Well Kentucky & LCED.

## What's in this folder

```
the-well/
├── CLAUDE.md                  ← project context, read automatically by Claude Code
├── README.md                  ← this file
├── SETUP-CLAUDE-CODE.md       ← how to install Claude Code and start building
├── .env.local.template        ← env var template (copy to .env.local, fill in)
├── .gitignore
├── brand-icon.png             ← BWK logo (mountain + lake)
├── docs/
│   ├── build-plan.md          ← the master spec: stack, setup, build order
│   ├── bamboohr-integration.md
│   ├── chat-integration.md
│   └── fulfillment-integration.md
└── prototype/
    └── the-well-prototype.html ← the working prototype (source of truth for behavior + design)
```

## Status

Design + prototype: **complete.** Real build: **just starting.**
Google OAuth credentials created. Next step: scaffold the Next.js app (see build-plan.md §3).

## Quick start (once you're building)

1. Open this folder in your terminal.
2. Start Claude Code here (see `SETUP-CLAUDE-CODE.md`). It reads `CLAUDE.md` automatically.
3. Ask it to scaffold the Next.js app per `docs/build-plan.md`.
4. Copy `.env.local.template` → `.env.local`, fill in the Google + database values.
5. `npm install && npm run dev`, open http://localhost:3000.

## The prototype

Open `prototype/the-well-prototype.html` in any browser to see the full intended product —
all features, mock data, admin portal. It's the reference for how the real app should behave
and look.
