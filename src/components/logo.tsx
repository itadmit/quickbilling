/**
 * QuickCommerce wordmark. Uses the Pacifico cursive face loaded via
 * globals.css. Use the `tone` prop to flip color between dark/light
 * surfaces (defaults to dark — gray-900).
 */
export function Logo({
  size = "md",
  tone = "dark",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  tone?: "dark" | "light";
  className?: string;
}) {
  const sizeClass = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
  }[size];
  const toneClass = tone === "light" ? "text-white" : "";

  return (
    <span
      className={`font-logo ${sizeClass} ${toneClass} ${className}`}
      style={{
        lineHeight: 1.5,
        color: tone === "dark" ? "#033841" : undefined,
      }}
      dir="ltr"
    >
      QuickCommerce
    </span>
  );
}
