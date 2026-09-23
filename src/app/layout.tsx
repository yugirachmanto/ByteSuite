import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/lib/contexts/language-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ByteSuite | F&B Management",
  description: "Advanced ERP system for Restaurant and Café management",
  applicationName: "ByteSuite",
  appleWebApp: { capable: true, title: "ByteSuite", statusBarStyle: "black" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased`}>
        <LanguageProvider>
          {children}
          <Toaster position="top-right" richColors theme="dark" />
        </LanguageProvider>
      </body>
    </html>
  );
}
