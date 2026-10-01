import type { Metadata } from "next";
import { Nunito, Inter } from "next/font/google";
import { AuthHashHandler } from "@/components/AuthHashHandler";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "500", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "IDSS Handbook",
  description:
    "Institucionalni priručnik — P.U. Internationale Deutsche Schule Sarajevo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bs" className={`${nunito.variable} ${inter.variable}`}>
      <body>
        <AuthHashHandler />
        {children}
      </body>
    </html>
  );
}
