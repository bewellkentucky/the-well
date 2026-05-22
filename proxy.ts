import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/", req.url))
  }
})

export const config = {
  // Protect everything except the home page (sign-in) and auth API routes
  matcher: ["/dashboard/:path*"],
}
