import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "InspectVision AI — Real-Time Defect Detection",
  description: "Production-grade industrial defect detection with YOLOv8 + WebSockets"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-industrial-950 font-sans antialiased">{children}</body>
    </html>
  );
}
