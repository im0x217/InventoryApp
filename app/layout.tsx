import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ReactNode } from 'react'; // <--- Added this import

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Inventory Manager',
  description: 'Stock management system for the warehouse',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode; // <--- Changed from 'React.ReactNode' to just 'ReactNode'
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}