import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/layout/theme-provider";
import { JoinPromptProvider } from "@/components/auth/join-prompt";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Medosha — The construction industry, connected",
    template: "%s · Medosha",
  },
  description:
    "Medosha connects every person and company in construction — architects, contractors, suppliers, and developers — in one platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Mounted once, at the root, so any Like or Save button anywhere
              below can raise the join prompt without state being threaded
              through the tree. It renders nothing until something asks. */}
          <JoinPromptProvider>{children}</JoinPromptProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
