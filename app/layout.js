import "./globals.css";

export const metadata = {
  title: "Jezički trener",
  description: "Diktat, slušanje i lični rečnik za engleski",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#16231D",
};

export default function RootLayout({ children }) {
  return (
    <html lang="sr">
      <body>{children}</body>
    </html>
  );
}
