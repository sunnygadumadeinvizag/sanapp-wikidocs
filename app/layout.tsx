import type { Metadata } from "next";
import "iipe-common-ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "IIPE Academic ERP",
  description: "Independent IIPE application #1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
