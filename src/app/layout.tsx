import type { Metadata } from "next";
import { Geist, Geist_Mono, Blaka_Hollow } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import CustomCursor from "@/components/jakob/custom-cursor";
import SiteDisguise from "@/components/jakob/site-disguise";
import PanicKey from "@/components/jakob/panic-key";
import ThemeInitializer from "@/components/jakob/theme-initializer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Blaka Hollow — display font used for the "jakob 52" hero title.
// Loaded via next/font so it self-hosts (no external CSS @import ordering issues).
const blakaHollow = Blaka_Hollow({
  variable: "--font-blaka-hollow",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Z.ai Code Scaffold - AI-Powered Development",
  description: "Modern Next.js scaffold optimized for AI-powered development with Z.ai. Built with TypeScript, Tailwind CSS, and shadcn/ui.",
  keywords: ["Z.ai", "Next.js", "TypeScript", "Tailwind CSS", "shadcn/ui", "AI development", "React"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Z.ai Code Scaffold",
    description: "AI-powered development with modern React stack",
    url: "https://chat.z.ai",
    siteName: "Z.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Z.ai Code Scaffold",
    description: "AI-powered development with modern React stack",
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
        className={`${geistSans.variable} ${geistMono.variable} ${blakaHollow.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <ThemeInitializer />
        <CustomCursor />
        <SiteDisguise />
        <PanicKey />
      </body>
    </html>
  );
}
