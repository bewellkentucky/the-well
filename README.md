# Spotlight

Peer recognition for teams: kudos tied to company values, stars to give and
earn, incentives and rewards. Multi-tenant; first customer is LCED.

Formerly "The Well" (Be Well Kentucky). `prototype/` and `docs/` describe that
single-tenant app and are kept as history.

## Run it locally

Requires a local Postgres (Homebrew `postgresql@16` works).

```bash
createdb spotlight_dev && createdb spotlight_test
cp .env.local.template .env.development.local   # fill in local values only
cp .env.local.template .env.test.local          # DATABASE_URL -> spotlight_test
npm install
npm run db:reset          # schema + fictional seed data
npm run dev               # http://localhost:3100 (local "sign in as" picker)
npm test                  # vitest against spotlight_test
npm run db:guard:prove    # shows the database guard refusing non-local URLs
```

Everything refuses to run off Vercel unless `DATABASE_URL` points at localhost
`spotlight_dev` / `spotlight_test`. See `CLAUDE.md` for the architecture and
rules, and `reports/` for the Spotlight plan and overnight build report.
