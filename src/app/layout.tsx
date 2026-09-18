import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { publicEnv } from "@/lib/env/public";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: `${publicEnv.NEXT_PUBLIC_SITE_NAME} — Original DAW projects, stems & sample packs`,
    template: `%s — ${publicEnv.NEXT_PUBLIC_SITE_NAME}`,
  },
  description:
    "A worldwide digital-product store for music producers: original DAW project files, legally cleared educational remakes, original stems, and original sample packs. (Foundation build — storefront in progress.)",
  robots: { index: false, follow: false }, // Step 1 placeholder; index only once real content ships.
  openGraph: {
    title: publicEnv.NEXT_PUBLIC_SITE_NAME,
    description:
      "Original DAW projects, stems & sample packs for music producers. (Foundation build.)",
    url: publicEnv.NEXT_PUBLIC_SITE_URL,
    siteName: publicEnv.NEXT_PUBLIC_SITE_NAME,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
