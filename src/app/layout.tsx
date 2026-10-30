import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { CareerChiveLayout } from "../entries/frame";
import {
  careerchiveMetadata,
  careerchiveViewport,
} from "../entries/metadata";
import "./globals.css";

export const metadata: Metadata = {
  ...careerchiveMetadata,
  icons: {
    icon: { url: "/favicon-light.svg", type: "image/svg+xml" },
  },
};

export const viewport: Viewport = careerchiveViewport;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className="min-h-full">
        <CareerChiveLayout>{children}</CareerChiveLayout>
      </body>
    </html>
  );
}
