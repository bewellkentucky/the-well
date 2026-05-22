import TopNav from "./TopNav"
import BottomNav from "./BottomNav"

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <TopNav />
      {children}
      <BottomNav />
    </div>
  )
}
