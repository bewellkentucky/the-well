import type { Metadata, Viewport } from "next"
import { Inter, Lora, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Spotlight",
  description: "Peer recognition for your team",
  icons: {
    icon: [
      { url: "/favicon.ico",        sizes: "any" },
      { url: "/spotlight-icon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png",  sizes: "16x16",  type: "image/png" },
      { url: "/favicon-32x32.png",  sizes: "32x32",  type: "image/png" },
      { url: "/favicon-48x48.png",  sizes: "48x48",  type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Spotlight",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  themeColor: "#1f2633",
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lora.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="h-full font-[family-name:var(--font-inter)] antialiased">
        {children}
      </body>
    </html>
  )
}
