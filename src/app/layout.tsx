import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegistrar } from "@/components/SwRegistrar";
import { ThemeSync } from "@/components/ThemeSync";

export const metadata: Metadata = {
  metadataBase: new URL("https://honestreps.ifleon.com"),
  title: "Honest Reps — Honest Effort Gym & Cardio Tracker",
  description:
    "Track strength and cardio effort against your own history. 50 means your usual. Compare fairly with friends.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48 32x32 16x16", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-touch-icon-precomposed.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Honest Reps",
  },
  openGraph: {
    type: "website",
    url: "https://honestreps.ifleon.com/",
    siteName: "Honest Reps",
    title: "Honest Reps — Honest Effort Gym & Cardio Tracker",
    description:
      "Track strength and cardio effort against your own history. 50 means your usual. Compare fairly with friends.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Honest Reps — Honest Effort Gym & Cardio Tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Honest Reps — Honest Effort Gym & Cardio Tracker",
    description:
      "Track strength and cardio effort against your own history. 50 means your usual.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark bg-black">
      <body className="antialiased selection:bg-[#10e760]/30">
        <ThemeSync />
        <SwRegistrar />
        {children}
      </body>
    </html>
  );
}
