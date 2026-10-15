// path: app/opengraph-image.tsx
import { ImageResponse } from "next/og";

import { siteConfig } from "@/lib/config/site";
import { strings } from "@/lib/i18n/strings/en";

export const alt = strings.metadata.openGraphAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default Open Graph card rendered at the edge from brand tokens. */
export default function OpenGraphImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        background: "linear-gradient(135deg, #1d4ed8 0%, #7c3aed 55%, #be185d 100%)",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "88px",
            height: "88px",
            borderRadius: "20px",
            backgroundColor: "rgba(255, 255, 255, 0.16)",
            fontSize: "44px",
            fontWeight: 700,
          }}
        >
          KD
        </div>
        <div style={{ fontSize: "44px", fontWeight: 700 }}>{siteConfig.name}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ fontSize: "56px", fontWeight: 700, lineHeight: 1.15, maxWidth: "900px" }}>
          {siteConfig.tagline}
        </div>
        <div style={{ fontSize: "28px", opacity: 0.85 }}>{strings.home.eyebrow}</div>
      </div>
    </div>,
    { ...size },
  );
}
