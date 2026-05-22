import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { db } from "@/lib/db"

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "bewellkentucky.com"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          hd: ALLOWED_DOMAIN,
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email
      const domain = email?.split("@")[1]
      if (domain !== ALLOWED_DOMAIN || !email) return false

      // Upsert the user on every sign-in so profile changes (name, photo)
      // stay in sync with Google Workspace without a separate sync job.
      await db.user.upsert({
        where: { email },
        create: {
          email,
          googleId: profile.sub,
          fullName: profile.name ?? email,
          thumbnailUrl: profile.picture ?? null,
          domain: ALLOWED_DOMAIN,
        },
        update: {
          fullName: profile.name ?? undefined,
          thumbnailUrl: profile.picture ?? undefined,
          googleId: profile.sub ?? undefined,
        },
      })

      return true
    },
    async session({ session, token }) {
      if (session.user?.email) {
        const user = await db.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, role: true, entity: true, active: true },
        })
        if (!user?.active) return session
        session.user.id = user.id
        session.user.role = user.role
        session.user.entity = user.entity
      }
      return session
    },
  },
})
