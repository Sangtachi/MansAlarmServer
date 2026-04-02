import type { Metadata } from 'next';
import { Bebas_Neue, Noto_Sans_KR } from 'next/font/google';
import './globals.css';

const display = Bebas_Neue({
  variable: '--font-display',
  weight: '400',
  subsets: ['latin'],
});

const body = Noto_Sans_KR({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'MansAlarm Server',
  description: 'MansAlarm admin operations console',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
