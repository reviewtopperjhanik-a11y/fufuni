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

import { Link } from "react-router-dom";

import type { Category } from "@/hooks/use-categories";
import { resolveTitle } from "@/utils/description";
import { useTranslation } from "react-i18next";

interface CategoryBentoGridProps {
  categories: Category[];
}

export function CategoryBentoGrid({ categories }: CategoryBentoGridProps) {
  const { i18n } = useTranslation();
  const active = categories.filter((c) => c.status === "active").slice(0, 5);

  if (active.length < 2) return null;

  const [first, second, third, fourth, fifth] = active;
  const placeholder = (seed: string) =>
    `https://placehold.co/800x600/1a1a1a/555?text=${encodeURIComponent(seed)}`;

  const BentoItem = ({
    cat,
    className,
    textSize = "text-3xl",
  }: {
    cat: Category;
    className?: string;
    textSize?: string;
  }) => (
    <Link
      className={`relative group overflow-hidden block ${className}`}
      to={`/?category=${cat.handle}`}
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
        style={{
          backgroundImage: `url(${cat.image_url ?? placeholder(resolveTitle(cat.name, i18n.language))})`,
        }}
      />
      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
      <div className="absolute bottom-8 left-8 text-white">
        <h3 className={`font-serif ${textSize} mb-2`}>
          {resolveTitle(cat.name, i18n.language)}
        </h3>
        <span className="font-sans uppercase text-xs tracking-widest border-b border-white pb-1">
          Découvrir
        </span>
      </div>
    </Link>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto px-4 py-12">
      {/* Large featured category — spans 2 columns */}
      <BentoItem cat={first} className="h-125 md:col-span-2" textSize="text-3xl" />

      {/* Stacked smaller categories */}
      <div className="flex flex-col gap-4">
        <BentoItem cat={second} className="h-60" textSize="text-xl" />
        {third && (
          <BentoItem cat={third} className="h-60" textSize="text-xl" />
        )}
      </div>

      {/* Optional 4th and 5th */}
      {fourth && (
        <BentoItem cat={fourth} className="h-70" textSize="text-xl" />
      )}
      {fifth && (
        <BentoItem cat={fifth} className="h-70" textSize="text-xl" />
      )}
    </div>
  );
}
