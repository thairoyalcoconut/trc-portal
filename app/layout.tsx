import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TRC Portal",
  description: "Internal portal — Thai Royal Coconut Co., Ltd.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
