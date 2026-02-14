import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "MoviTorneoFacile",
  description: "Iscriviti ai tornei MoviTorneoFacile",

  applicationName: "MoviTorneoFacile",

  themeColor: "#4f46e5",

  appleWebApp: {
    capable: true,
    title: "MoviTorneoFacile",
    statusBarStyle: "default",
  },

  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={geistSans.variable}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <Toaster position="top-center" richColors />
        {children}
      </body>
    </html>
  );
}
