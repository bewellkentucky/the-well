import { vi } from "vitest"
import { loadTestEnv } from "./loadTestEnv"

loadTestEnv()

// The signed-in person for server actions under test. Set via setActor().
export const session: { userId: string | null } = { userId: null }

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
