import type { MetadataRoute } from "next"
import { getRequestBrand } from "@/lib/brandContext"
import { themeOrDefault } from "@/lib/theme"

// Per-company: colors and icons follow the requesting company's palette.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getRequestBrand()
  const theme = themeOrDefault(brand?.theme)
  return {
    name:             "Spotlight",
    short_name:       "Spotlight",
    description:      "Peer recognition for your team",
    start_url:        "/",
    display:          "standalone",
    theme_color:      theme.primary,
    background_color: theme.page,
    icons: [
      { src: "/brand-icon/icon-192.png",          sizes: "192x192", type: "image/png" },
      { src: "/brand-icon/icon-512.png",          sizes: "512x512", type: "image/png" },
      { src: "/brand-icon/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
