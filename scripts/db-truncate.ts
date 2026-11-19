import * as dotenv from "dotenv"
dotenv.config({ path: process.env.SPOTLIGHT_ENV_FILE ?? ".env.development.local", quiet: true })
import { truncateAllTables } from "../lib/devTruncate"

truncateAllTables()
  .then((n) => { console.log(`Emptied ${n} tables.`); process.exit(0) })
  .catch((e) => { console.error(e.message); process.exit(1) })
