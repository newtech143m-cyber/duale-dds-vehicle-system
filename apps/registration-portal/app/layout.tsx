import type { Metadata, Viewport } from "next";
import { getI18n } from "@dds/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DDS Vehicle Registration", template: "%s · DDS Vehicle Registration" },
  description: "Vehicle registration, ownership and annual tax management — authorized staff only.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0b1b36", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getI18n();
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
