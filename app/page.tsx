import Image from "next/image"
import { auth, signIn, signOut } from "@/auth"
import { db } from "@/lib/db"
import PageShell from "@/app/components/layout/PageShell"
import ComposerWrapper from "@/app/components/composer/ComposerWrapper"
import Feed from "@/app/components/feed/Feed"
import Leaderboard from "@/app/components/rail/Leaderboard"
import ComingUp from "@/app/components/rail/ComingUp"
import OutToday from "@/app/components/rail/OutToday"

export default async function Home() {
  const session = await auth()

  if (!session?.user?.id) {
    return <SignInPage />
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { givingBalance: true, balance: true },
  })

  return (
    <PageShell>
      <main className="home-layout mx-auto" style={{ maxWidth: 1100, padding: "32px 24px 100px" }}>

        {/* Full-width header row — spans both columns */}
        <div className="feed-title-col">
          <h1 className="feed-topbar-title">Recognize the work.</h1>
          <p className="feed-topbar-subtitle">
            Send kudos, give drops, celebrate your team. Be Well Kentucky.
          </p>
        </div>

        {/* Left column: composer + feed */}
        <div>
          <ComposerWrapper />
          <Feed currentUserId={session.user.id} />
        </div>

        {/* Right column: balance widget → top givers → coming up */}
        <aside className="home-rail">
          <div className="drops-balance rail-section">
            <div className="drops-pool">
              <div className="balance-amount">{user?.givingBalance ?? 0}đ</div>
              <div className="balance-label">To give this month</div>
            </div>
            <div className="drops-balance-h-divider" />
            <div className="drops-pool">
              <div className="balance-amount">{user?.balance ?? 0}đ</div>
              <div className="balance-label" style={{ color: "rgba(244,241,236,0.5)" }}>
                Earned&nbsp;&middot;&nbsp;yours to spend
              </div>
            </div>
          </div>
          <Leaderboard />
          <ComingUp />
          <OutToday />
        </aside>
      </main>
    </PageShell>
  )
}

function SignInPage() {
  return (
    <main className="min-h-full flex items-center justify-center bg-[#2a3441]">
      <div className="w-full max-w-sm mx-4">
        <div className="flex flex-col items-center gap-6 mb-10">
          <Image
            src="/brand-icon.png"
            alt="Be Well Kentucky"
            width={72}
            height={72}
            priority
          />
          <div className="text-center">
            <h1 className="font-[family-name:var(--font-lora)] text-3xl text-[#f4f1ec]">
              The Well
            </h1>
            <p className="text-sm text-[#7a9b7e] mt-1">by Be Well Kentucky</p>
          </div>
        </div>

        <div className="bg-[#f4f1ec] rounded-2xl p-8 shadow-lg">
          <div className="flex flex-col items-center gap-5 text-center">
            <div>
              <h2 className="font-semibold text-[#2a3441]">Welcome back</h2>
              <p className="text-sm text-[#2a3441]/60 mt-1">
                Sign in with your Be Well Kentucky account.
              </p>
            </div>
            <form
              action={async () => {
                "use server"
                await signIn("google", { redirectTo: "/" })
              }}
              className="w-full"
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 bg-[#2a3441] hover:bg-[#3a4a5a] text-[#f4f1ec] rounded-xl px-5 py-3 text-sm font-medium transition-colors"
              >
                <GoogleIcon />
                Sign in with Google
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" />
    </svg>
  )
}
