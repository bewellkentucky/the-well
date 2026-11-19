import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      /** Identity only. Company, role and active are re-read from the DB (lib/tenant.ts). */
      id: string
    } & DefaultSession["user"]
  }
}
