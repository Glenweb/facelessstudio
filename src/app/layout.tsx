import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Faceless Video Studio",
    template: "%s · Faceless Video Studio",
  },
  description:
    "Turn a prompt or a script into a narrated faceless video. Pick a niche style and a voice, edit the scenes, render in 16:9 and 9:16, and publish straight to YouTube.",
  applicationName: "Faceless Video Studio",
  authors: [{ name: "GMK Media Ltd" }],
  openGraph: {
    title: "Faceless Video Studio",
    description:
      "Prompt to narrated faceless video. Niche style templates, word-accurate captions, long-form and Shorts from one render.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07080c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
