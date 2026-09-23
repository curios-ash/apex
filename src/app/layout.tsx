import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";

import { isClerkConfigured } from "@/lib/auth/configured";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apex — Deal #1",
  description:
    "Score a small rental against your Deal #1 line. $19 a month, cancel any time. The first address is free.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const clerk = isClerkConfigured();
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {clerk && publishableKey ? (
          <ClerkProvider
            dynamic
            publishableKey={publishableKey}
            signInUrl="/sign-in"
            signUpUrl="/sign-in"
            signInFallbackRedirectUrl="/deals"
            signUpFallbackRedirectUrl="/deals"
            afterSignOutUrl="/sign-in"
          >
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
