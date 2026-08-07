import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = (() => {
  const title = "WASH//LAB — автомойка нового поколения";
  const description = "Бережная мойка автомобиля без очередей. Онлайн-запись за 30 секунд.";
  return {
    title, description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
})();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
