import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";

import InstallAppPrompt from "@/components/InstallAppPrompt";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.movipadel.it"),

  title: {
    default: "MOVI App",
    template: "%s | MOVI App",
  },

  description:
    "MOVI App • Tornei, MoviBack, Store MOVI e servizi dedicati ai club MOVI Padel.",

  applicationName: "MOVI App",

  manifest: "/manifest.webmanifest",

  themeColor: "#4f46e5",

  appleWebApp: {
    capable: true,
    title: "MOVI App",
    statusBarStyle: "black-translucent",
  },

  openGraph: {
    title: "MOVI App",
    description:
      "Tornei, MoviBack, Store MOVI e servizi dedicati ai club MOVI Padel.",
    url: "https://app.movipadel.it",
    siteName: "MOVI App",
    locale: "it_IT",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "MOVI App",
    description:
      "Tornei, MoviBack, Store MOVI e servizi dedicati ai club MOVI Padel.",
  },

  alternates: {
    canonical: "https://app.movipadel.it",
  },

  icons: {
    icon: [
      {
        url: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],

    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
      },
    ],

    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className={geistSans.variable}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <Toaster position="top-center" richColors />

        {children}

        <InstallAppPrompt />
      </body>
    </html>
  );
}