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
  title: "The Well",
  description: "Employee recognition by Be Well Kentucky",
  appleWebApp: {
    capable: true,
    title: "The Well",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  themeColor: "#2a3441",
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
