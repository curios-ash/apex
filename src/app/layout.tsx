import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Apex — Your rentals, audited monthly",
  description:
    "Owner-side audit and asset management for small landlords. Every number sourced, every action approved.",
};

function isClerkConfigured(): boolean {
  return Boolean(
    process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const clerk = isClerkConfigured();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {clerk ? <ClerkProvider>{children}</ClerkProvider> : children}
      </body>
    </html>
  );
}
