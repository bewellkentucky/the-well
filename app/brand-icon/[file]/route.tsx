// App icons drawn from the requesting company's palette (signed-in person's
// company, else the company whose address matches the host, else Spotlight's
// default). No secrets involved: only validated palette colors are used.
import { ImageResponse } from "next/og"
import { getRequestBrand } from "@/lib/brandContext"
import { themeOrDefault } from "@/lib/theme"
import { iconSvg } from "@/lib/iconSvg"

const PNG: Record<string, { size: number; maskable?: boolean }> = {
  "icon-16.png": { size: 16 },
  "icon-32.png": { size: 32 },
  "icon-48.png": { size: 48 },
  "apple-touch-icon.png": { size: 180, maskable: true }, // iOS rounds corners itself
  "icon-192.png": { size: 192 },
  "icon-512.png": { size: 512 },
  "icon-512-maskable.png": { size: 512, maskable: true },
}

const HEADERS = { "Cache-Control": "private, max-age=3600", Vary: "Cookie, Host" }

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const brand = await getRequestBrand()
  const theme = themeOrDefault(brand?.theme)

  if (file === "icon.svg") {
    return new Response(iconSvg(theme), { headers: { ...HEADERS, "Content-Type": "image/svg+xml" } })
  }
  const spec = PNG[file]
  if (!spec) return new Response("Not found", { status: 404 })
  const src = `data:image/svg+xml;base64,${Buffer.from(iconSvg(theme, { maskable: spec.maskable })).toString("base64")}`
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={src} width={spec.size} height={spec.size} />,
    { width: spec.size, height: spec.size, headers: HEADERS },
  )
}
