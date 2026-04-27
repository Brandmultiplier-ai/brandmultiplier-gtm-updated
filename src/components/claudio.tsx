/**
 * Claudio — BrandMultiplier GTM mascot.
 * Pixel-art character; accents use the brand gold palette.
 * Pure SVG + CSS animations, colors driven by design tokens.
 *
 * Modes:
 *   - "idle"     (default) → static
 *   - "bounce"   → gentle vertical bounce, like breathing
 *   - "blink"    → eyes close periodically
 *   - "wave"     → tilts head left/right
 *   - "scan"     → eye-glow pulse, "looking around"
 *   - "thinking" → bounce + blink combo (for loading / working states)
 */

export type ClaudioMood = "idle" | "bounce" | "blink" | "wave" | "scan" | "thinking";

export function Claudio({
  size = 64,
  className = "",
  title = "Claudio",
  mood = "idle",
}: {
  size?: number;
  className?: string;
  title?: string;
  mood?: ClaudioMood;
}) {
  const wrapperClass =
    mood === "bounce" || mood === "thinking"
      ? "claudio-bounce"
      : mood === "wave"
      ? "claudio-wave"
      : mood === "scan"
      ? "claudio-scan"
      : "";

  const eyeClass = mood === "blink" || mood === "thinking" ? "claudio-blink" : "";
  const eyeFill = mood === "scan" ? "var(--brand-primary)" : "var(--near-black)";

  return (
    <span
      className={`inline-block ${wrapperClass} ${className}`}
      style={{ width: size, height: size, lineHeight: 0 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        shapeRendering="crispEdges"
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        {/* Top of head — slightly inset */}
        <rect x="6" y="4" width="20" height="2" fill="var(--brand-primary)" />
        {/* Body bulk */}
        <rect x="4" y="6" width="24" height="16" fill="var(--brand-primary)" />
        {/* Bottom inset */}
        <rect x="6" y="22" width="20" height="2" fill="var(--brand-primary)" />
        {/* Eyes — square pixels */}
        <rect className={eyeClass} x="9" y="11" width="4" height="4" fill={eyeFill} />
        <rect className={eyeClass} x="19" y="11" width="4" height="4" fill={eyeFill} />
        {/* Legs — 4 stubby */}
        <rect x="6" y="24" width="3" height="4" fill="var(--brand-primary)" />
        <rect x="11" y="24" width="3" height="4" fill="var(--brand-primary)" />
        <rect x="18" y="24" width="3" height="4" fill="var(--brand-primary)" />
        <rect x="23" y="24" width="3" height="4" fill="var(--brand-primary)" />
      </svg>
    </span>
  );
}

/**
 * ClaudioGreeting — Claudio + label, drop-in welcome element.
 */
export function ClaudioGreeting({
  name = "Claudio",
  size = 96,
  className = "",
  mood = "wave",
}: {
  name?: string;
  size?: number;
  className?: string;
  mood?: ClaudioMood;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <Claudio size={size} mood={mood} />
      <p className="text-sm font-medium text-foreground">
        Welcome, <span className="text-brand">{name}</span>
      </p>
    </div>
  );
}
