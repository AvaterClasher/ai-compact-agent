import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salvador - Coding Agent",
  description: "Context-compacting coding agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <div className="flex h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
