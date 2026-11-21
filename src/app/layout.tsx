import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = (process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "MyGSTBook — GST billing & accounting", template: "%s · MyGSTBook" },
  description: "GST invoices, purchases, payments and GSTR-1/GSTR-3B for Indian businesses, with your whole team.",
  applicationName: "MyGSTBook",
  openGraph: { type: "website", siteName: "MyGSTBook", locale: "en_IN" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans text-sm">{children}</body>
    </html>
  );
}
