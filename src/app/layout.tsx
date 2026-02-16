import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import type { Viewport } from 'next';

export const viewport: Viewport = {
  themeColor: '#2563eb', // Azul Shineray para a barra do navegador mobile
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // Impede zoom acidental em inputs no mobile (sensação de app nativo)
  userScalable: false,
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SGM - Shineray By Sabel",
  description: "Sistema de Gestão de Montagem",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}