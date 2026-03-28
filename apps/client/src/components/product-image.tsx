/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

const FALLBACK_IMG = "https://placehold.co/400x400/1a1a1a/666?text=No+Image";

interface ProductImageProps {
  src?: string | null;
  alt: string;
  /** When > 1, renders an "N options" badge. */
  variantCount?: number;
  /** Optional click handler — adds cursor-pointer + role/tabIndex accessibility. */
  onClick?: () => void;
}

/**
 * Square product image with hover-zoom animation, a fallback placeholder on error,
 * and an optional "N options" badge when multiple variants exist.
 */
export function ProductImage({ src, alt, variantCount, onClick }: ProductImageProps) {
  const interactive = onClick !== undefined;
  return (
    <div
      className={`aspect-square bg-default-100 rounded-xl overflow-hidden mb-4 relative${interactive ? " cursor-pointer" : ""}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
      <img
        src={src || FALLBACK_IMG}
        alt={alt}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        onError={(e) => {
          (e.target as HTMLImageElement).src = FALLBACK_IMG;
        }}
      />
      {variantCount !== undefined && variantCount > 1 && (
        <span className="absolute top-3 left-3 bg-black/70 text-white text-xs px-2 py-1 rounded">
          {variantCount} options
        </span>
      )}
    </div>
  );
}
