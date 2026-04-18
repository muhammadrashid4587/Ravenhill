import { ImageResponse } from "next/og";

export const alt = "Ravenhill — The agent that handles your coordination.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0B0A0C",
          color: "#F5F0E6",
          padding: 80,
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Soft oxblood radial in the bottom-left corner */}
        <div
          style={{
            position: "absolute",
            left: -180,
            bottom: -180,
            width: 720,
            height: 720,
            borderRadius: 720,
            background: "#8B1E2F",
            opacity: 0.35,
            filter: "blur(90px)",
            display: "flex",
          }}
        />

        {/* Subtle top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 3,
            background: "#8B1E2F",
            display: "flex",
          }}
        />

        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            position: "relative",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#8B1E2F",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path d="M16 5L5 16l11 11 11-11L16 5z" fill="#F5F0E6" />
            </svg>
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: -0.5,
              color: "#F5F0E6",
            }}
          >
            Ravenhill
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Hero */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            position: "relative",
            maxWidth: 980,
          }}
        >
          <div
            style={{
              fontSize: 88,
              lineHeight: 1.04,
              letterSpacing: -2.5,
              fontWeight: 500,
              color: "#F5F0E6",
              display: "flex",
              flexWrap: "wrap",
            }}
          >
            The agent that handles your{" "}
            <span
              style={{
                color: "#B23246",
                fontStyle: "italic",
                fontFamily: "serif",
                fontWeight: 400,
                display: "flex",
              }}
            >
              coordination.
            </span>
          </div>
          <div
            style={{
              fontSize: 26,
              color: "#8A8A92",
              lineHeight: 1.4,
              display: "flex",
              maxWidth: 820,
            }}
          >
            Every person at your company gets an AI agent. The agents handle
            the coordination between teams.
          </div>
        </div>

        {/* Footer line */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 56,
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 18,
              color: "#8A8A92",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "#8B1E2F",
                display: "flex",
              }}
            />
            Early access · 2026
          </div>
          <div
            style={{
              fontSize: 18,
              fontFamily: "monospace",
              color: "#4A4A52",
              display: "flex",
            }}
          >
            ravenhill.ai
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
