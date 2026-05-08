import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { OutletProvider } from "@/lib/contexts/outlet-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SigmaERP | F&B Management",
  description: "Advanced ERP system for Restaurant and Café management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased`}>
        <OutletProvider>
          {children}
          <Toaster position="top-right" richColors theme="dark" />
        </OutletProvider>
      </body>
    </html>
  );
}
