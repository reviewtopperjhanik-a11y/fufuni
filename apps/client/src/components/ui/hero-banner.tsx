/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { Button } from "@heroui/react";

export interface HeroBannerProps {
  imageUrl: string;
  title: string;
  subtitle?: string;
  ctaText: string;
  onCtaClick: () => void;
  overlayOpacity?: number;
}

export function HeroBanner({
  imageUrl,
  title,
  subtitle,
  ctaText,
  onCtaClick,
  overlayOpacity = 0.3,
}: HeroBannerProps) {
  return (
    <div className="relative w-full h-[70vh] flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
      <div
        className="absolute inset-0 bg-black"
        style={{ opacity: overlayOpacity }}
      />
      <div className="relative z-10 text-center text-white px-4 max-w-4xl flex flex-col items-center gap-6">
        <h1 className="font-serif text-5xl md:text-7xl tracking-wide leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="font-sans text-lg md:text-xl font-light tracking-wider opacity-90">
            {subtitle}
          </p>
        )}
        <Button
          className="mt-4 bg-white text-black hover:bg-gray-200 uppercase tracking-widest font-semibold px-10 rounded-none"
          size="lg"
          onPress={onCtaClick}
        >
          {ctaText}
        </Button>
      </div>
    </div>
  );
}
