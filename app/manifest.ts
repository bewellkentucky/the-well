import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "The Well",
    short_name:       "The Well",
    description:      "Employee recognition by Be Well Kentucky",
    start_url:        "/",
    display:          "standalone",
    theme_color:      "#2a3441",
    background_color: "#f4f1ec",
    icons: [
      { src: "/icon-192.png",          sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png",          sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
