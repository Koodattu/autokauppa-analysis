import type { Metadata } from "next";
import { APP_LOCALE } from "@/lib/format";
import "./globals.css";
import "./public.css";
import { ComparisonTray } from "./saved-workspace";

export const metadata: Metadata = {
  title: {
    default: "Nettiauto Analytics",
    template: "%s · Nettiauto Analytics",
  },
  description: "Price, mileage, and market analysis from observed Nettiauto listings.",
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
    <html lang={APP_LOCALE}>
      <body>{children}<ComparisonTray /></body>
    </html>
  );
}
