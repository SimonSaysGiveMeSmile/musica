import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Musica",
    short_name: "Musica",
    description: "Any song, in your hands. Chords, key, tempo and lyrics analyzed on your phone.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "portrait",
    background_color: "#0b0a09",
    theme_color: "#0b0a09",
    // "Share to Musica" from Files, Voice Memos, etc. (Android; iOS has no share target for web apps)
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { files: [{ name: "audio", accept: ["audio/*", ".m4a", ".mp3", ".wav", ".flac", ".ogg", ".aac"] }] },
    },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
