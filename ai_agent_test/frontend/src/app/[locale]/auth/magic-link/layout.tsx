import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#F7F9FC",
};

export default function MagicLinkVerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
