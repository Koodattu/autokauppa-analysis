import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nettiauto Analytics",
  description: "Public analytics for Nettiauto listing data.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
