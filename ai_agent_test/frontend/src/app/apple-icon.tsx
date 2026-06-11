import { ImageResponse } from "next/og";

import { SITE } from "@/lib/seo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function AppleIcon() {
  const initial = SITE.name.charAt(0).toUpperCase();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F7F9FC",
        color: "#182033",
        fontSize: 110,
        fontWeight: 800,
        letterSpacing: "-0.04em",
        fontFamily: "sans-serif",
      }}
    >
      {initial}
    </div>,
    { ...size },
  );
}
