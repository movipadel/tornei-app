import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Tornei",
  description: "Gestione tornei e iscrizioni",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={geistSans.variable}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {/* Base44-style toaster */}
        <Toaster position="top-center" richColors />

        {children}
      </body>
    </html>
  );
}

