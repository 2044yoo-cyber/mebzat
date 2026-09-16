import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, Noto_Sans_Ethiopic } from "next/font/google";
import { Suspense } from "react";

import { FontPreference } from "@/components/layout/font-preference";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { LegacyTranslationBridge } from "@/components/i18n/legacy-translation-bridge";
import { HomePanel } from "@/components/home/home-panel";
import { AppShell } from "@/components/shell/app-shell";
import { TouchPress } from "@/components/shell/touch-press";
import { Toaster } from "@/components/ui/sonner";
import { getUnreadCount as getUnreadMessages } from "@/lib/data/messages";
import { getUnreadCount as getUnreadNotifications } from "@/lib/data/notifications";
import { getNavProfile } from "@/lib/nav-profile";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";
import { normalizeLanguage } from "@/lib/i18n/translations";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Fidel, loaded rather than hoped for.
 *
 * Every local Ethiopic font is somebody else's operating system — Nyala on
 * Windows, Kefa on Apple's, Noto on Android — and a machine with none of them
 * showed boxes where the Amharic was. `display: "swap"` because Latin is
 * already drawn from Geist while this arrives: the alternative is holding the
 * whole page back for a script most of it is not written in.
 */
const notoEthiopic = Noto_Sans_Ethiopic({
  variable: "--font-noto-ethiopic",
  subsets: ["ethiopic"],
  display: "swap",
});

/**
 * The viewport, which was missing entirely.
 *
 * Without it a phone assumes the page was written for a desktop, renders it at
 * roughly 980px and scales the result down — so every one of the 118 files
 * written with mobile breakpoints was being shown its desktop layout, shrunk.
 * The responsive work was already done; nothing was telling the browser to use
 * it.
 *
 * `maximum-scale` is deliberately not set. Locking zoom makes an app feel
 * native and takes a real accessibility tool away from anyone who needs to
 * enlarge text.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  // Makes every relative canonical and Open Graph URL resolve against the
  // real origin rather than the request host.
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Medosha — The construction industry, connected",
    template: "%s · Medosha",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Medosha — The construction industry, connected",
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_ET",
  },
  twitter: {
    card: "summary_large_image",
    title: "Medosha — The construction industry, connected",
    description: SITE_DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The shell is mounted here, once, so navigation replaces only the workspace
  // inside it. That is what keeps the map's camera, the AI conversation and
  // the sidebar's scroll position alive from one page to the next.
  const profile = await getNavProfile();
  const language = normalizeLanguage((await cookies()).get("medosha_language")?.value);

  // Signed out there is nothing to count, and both calls would be a wasted
  // round trip on every cold render.
  const [messages, notifications] = profile
    ? await Promise.all([getUnreadMessages(), getUnreadNotifications()])
    : [0, 0];

  return (
    <html
      lang={language}
      suppressHydrationWarning
      /* Rendered on the server from the signed-in profile so the page does not
         arrive in one face and repaint in another. `FontPreference` covers the
         signed-out reader, whose choice is only in their browser. */
      data-font={profile?.font ?? undefined}
      className={`${geistSans.variable} ${geistMono.variable} ${notoEthiopic.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <FontPreference serverChoice={profile?.font ?? null} />
        <LanguageProvider initialLanguage={language}>
          <LegacyTranslationBridge />
          <ThemeProvider
            attribute="class"
            // The workspace is designed dark first — that is what a tool people
            // sit in front of all day should be. The toggle still works, and a
            // returning visitor keeps whatever they last chose.
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            {/* The shell reads the query string, which a statically rendered
                route may not do outside a boundary. */}
            <Suspense fallback={<div className="min-h-screen">{children}</div>}>
              <AppShell
                profile={profile}
                counts={{ messages, notifications }}
                // The context panel is the homepage's right sidebar. Passed as
                // a slot because the panel is a client component and this is
                // not; Suspense keeps its queries off the critical path of
                // every route.
                homeWidget={
                  <Suspense fallback={null}>
                    <HomePanel />
                  </Suspense>
                }
              >
                {children}
              </AppShell>
            </Suspense>
            <Toaster />
            {/* Not a control and renders nothing. See the component: without a
                touch listener on the document, Safari never applies `:active`
                to anything that is not an anchor. */}
            <TouchPress />
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
