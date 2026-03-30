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
import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-brand-900 text-white pt-24 pb-12 mt-auto">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
        {/* Brand */}
        <div className="md:col-span-1">
          <h2 className="font-serif text-2xl mb-6">FUFUNI</h2>
          <p className="text-gray-400 font-sans font-light text-sm leading-relaxed">
            L'élégance à la française, hébergée sur l'Edge. Un framework
            moderne pour des créations intemporelles.
          </p>
        </div>

        {/* Shop */}
        <div>
          <h4 className="font-sans uppercase tracking-widest text-xs font-semibold mb-6">
            Boutique
          </h4>
          <ul className="space-y-4 text-gray-400 font-light text-sm">
            <li>
              <Link className="hover:text-white transition-colors" to="/">
                {t("home", "Accueil")}
              </Link>
            </li>
            <li>
              <Link className="hover:text-white transition-colors" to="/products">
                {t("products-title", "Produits")}
              </Link>
            </li>
            <li>
              <Link className="hover:text-white transition-colors" to="/cart">
                {t("cart", "Panier")}
              </Link>
            </li>
          </ul>
        </div>

        {/* Support */}
        <div>
          <h4 className="font-sans uppercase tracking-widest text-xs font-semibold mb-6">
            Assistance
          </h4>
          <ul className="space-y-4 text-gray-400 font-light text-sm">
            <li>
              <Link className="hover:text-white transition-colors" to="/about">
                À propos
              </Link>
            </li>
            <li>
              <Link className="hover:text-white transition-colors" to="/blog">
                Blog
              </Link>
            </li>
            <li>
              <a
                className="hover:text-white transition-colors"
                href="mailto:hello@fufuni.local"
              >
                Contact
              </a>
            </li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h4 className="font-sans uppercase tracking-widest text-xs font-semibold mb-6">
            Nous Contacter
          </h4>
          <p className="text-gray-400 font-light text-sm leading-relaxed">
            Service client disponible du lundi au vendredi.
            <br />
            <br />
            <a
              className="hover:text-white transition-colors"
              href="mailto:hello@fufuni.local"
            >
              hello@fufuni.local
            </a>
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-24 pt-8 border-t border-gray-800 text-center text-gray-500 text-xs">
        © {new Date().getFullYear()} Fufuni Framework. Open Source E-commerce.
      </div>
    </footer>
  );
}
