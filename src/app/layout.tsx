import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quick Commerce Billing Hub",
  description: "ניהול מנויים מרכזי לכל מוצרי Quick Commerce",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full bg-neutral-50 text-neutral-900 font-sans">
        {children}
      </body>
    </html>
  );
}
