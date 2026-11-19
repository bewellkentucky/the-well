import type { Metadata, Viewport } from "next"
import { Inter, Lora, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { getRequestBrand } from "@/lib/brandContext"
import { themeCss, themeOrDefault } from "@/lib/theme"

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

// Icons and theme color follow the requesting company's palette. The ?v= is a
// hash of the palette, so a palette change gets fresh icons.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getRequestBrand()
  const v = paletteVersion(brand?.theme)
  const i = (f: string) => `/brand-icon/${f}?v=${v}`
  return {
    title: "Spotlight",
    description: "Peer recognition for your team",
    icons: {
      icon: [
        { url: i("icon.svg"),    type: "image/svg+xml" },
        { url: i("icon-16.png"), sizes: "16x16", type: "image/png" },
        { url: i("icon-32.png"), sizes: "32x32", type: "image/png" },
        { url: i("icon-48.png"), sizes: "48x48", type: "image/png" },
      ],
      apple: [{ url: i("apple-touch-icon.png"), sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: "Spotlight",
      statusBarStyle: "default",
    },
  }
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await getRequestBrand()
  return { themeColor: themeOrDefault(brand?.theme).primary, viewportFit: "cover" }
}

function paletteVersion(stored: unknown): string {
  const css = themeCss(stored)
  let h = 5381
  for (let k = 0; k < css.length; k++) h = ((h << 5) + h + css.charCodeAt(k)) | 0
  return (h >>> 0).toString(36)
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const brand = await getRequestBrand()
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lora.variable} ${jetbrainsMono.variable} h-full`}
    >
      <head>
        {/* Company palette (validated #rrggbb values only; see lib/theme.ts). */}
        <style id="company-theme">{themeCss(brand?.theme)}</style>
      </head>
      <body className="h-full font-[family-name:var(--font-inter)] antialiased">
        {children}
      </body>
    </html>
  )
}
