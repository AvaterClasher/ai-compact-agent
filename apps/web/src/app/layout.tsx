import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salvador - Coding Agent",
  description: "Context-compacting coding agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <meta name="theme-color" content="#000000" />
      </head>
      <body className="min-h-screen antialiased">
        <div className="flex h-screen overflow-hidden">{children}</div>
      </body>
    </html>
  );
}
