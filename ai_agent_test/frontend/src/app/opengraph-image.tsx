import { ImageResponse } from "next/og";

import { SITE } from "@/lib/seo";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

/** Default Open Graph image. Light background, oversized brand title with a
 *  brand highlight on a key word, plus eyebrow + tagline. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 80px",
        backgroundColor: "#F7F9FC",
        backgroundImage:
          "radial-gradient(ellipse 80% 60% at 80% 0%, rgba(99,102,241,0.16), transparent 60%)",
        color: "#182033",
        fontFamily: "sans-serif",
      }}
    >
      {/* Top eyebrow + brand */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 9999,
              background: "#6366F1",
            }}
          />
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {SITE.name}
          </span>
        </div>
        <span
          style={{
            fontSize: 18,
            opacity: 0.72,
            fontFamily: "monospace",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {SITE.tagline}
        </span>
      </div>

      {/* Headline */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontSize: 110,
            fontWeight: 800,
            lineHeight: 1.0,
            letterSpacing: "-0.035em",
            display: "flex",
            flexWrap: "wrap",
          }}
        >
          <span>AI&nbsp;that&nbsp;</span>
          <span
            style={{
              background:
                "linear-gradient(transparent 50%, #C7D2FE 50%, #C7D2FE 90%, transparent 90%)",
              paddingLeft: 8,
              paddingRight: 8,
            }}
          >
            knows
          </span>
          <span>&nbsp;your work.</span>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 28, opacity: 0.78, maxWidth: 720, lineHeight: 1.4 }}>
          {SITE.description}
        </span>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            padding: "14px 28px",
            borderRadius: 9999,
            background: "#182033",
            color: "#F7F9FC",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          Get started →
        </div>
      </div>
    </div>,
    { ...size },
  );
}
