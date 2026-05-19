import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { SiteHeader } from "./site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "VFT — Tipovačka MS 2026",
  description: "Tipovací liga přátel pro Mistrovství světa ve fotbale 2026",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read UI preferences from cookies on the server so the <html> element
  // ships with the right data-* attributes from the first byte of HTML.
  // No client-side bootstrap script needed → no FOUC, no hydration mismatch.
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("vft-theme")?.value;
  const layoutCookie = cookieStore.get("vft-predict-layout")?.value;
  const dataTheme =
    themeCookie === "dark" || themeCookie === "light" ? themeCookie : undefined;
  const dataLayout = layoutCookie === "one" ? "one" : undefined;

  return (
    <html
      lang="cs"
      className={`${geistSans.variable} ${geistMono.variable}`}
      data-theme={dataTheme}
      data-layout={dataLayout}
      suppressHydrationWarning
    >
      <body>
        <SiteHeader />
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
