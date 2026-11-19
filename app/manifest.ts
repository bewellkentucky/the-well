import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "Spotlight",
    short_name:       "Spotlight",
    description:      "Peer recognition for your team",
    start_url:        "/",
    display:          "standalone",
    theme_color:      "#1f2633",
    background_color: "#f7f5f2",
    icons: [
      { src: "/icon-192.png",          sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png",          sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
