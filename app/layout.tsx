import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TitleBar } from "./components/TitleBar";
import { Providers } from "./providers";
import UpdateGate from "./components/UpdateGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vylos IDE",
  description: "AI-Powered Programming Environment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col h-screen overflow-hidden bg-[var(--vylos-black)] text-white`}
      >
        <Providers>
          <TitleBar />
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
          {/* Blocks the whole app — sign-in included — while an update is pending */}
          <UpdateGate />
        </Providers>
      </body>
    </html>
  );
}
