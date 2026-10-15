import type { Metadata } from "next";
import "flag-icons/css/flag-icons.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SouthWatch — lunar mission control",
  description:
    "Scrub through time and see, from real terrain and real orbital math, where the sun shines on the Moon, when Earth is in view and how long a signal takes to reach home.",
  icons: { icon: "/logo/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body>{children}</body>
    </html>
  );
}
