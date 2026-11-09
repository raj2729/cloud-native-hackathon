import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/top-nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Converge — your conference, your interests, your people",
  description:
    "An AI-powered conference companion that connects people to the right talks, the right attendees, and the right opportunities in real time.",
};

// Typed explicitly rather than with Next's generated `LayoutProps`, which only
// exists after a build — a fresh clone must typecheck before anything is built.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TopNav />
        <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-5 pb-20">
          {children}
        </main>
      </body>
    </html>
  );
}
