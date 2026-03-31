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

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button, Description, Dropdown, Label } from "@heroui/react";
import { Palette } from "lucide-react";

import { useAuth } from "@/authentication";
import {
  useStoreTheme,
  AVAILABLE_THEMES,
  ThemeSlug,
} from "@/providers/theme-provider";

export function ThemeSwitcher() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { theme, setTheme } = useStoreTheme();

  const currentTheme = (theme as ThemeSlug | null) ?? "default";

  const themes = useMemo(
    () =>
      (AVAILABLE_THEMES as readonly ThemeSlug[]).map((id) => ({
        id,
        label: t(`account-theme-${id}`),
        description: t(`account-theme-${id}-description`),
      })),
    [t],
  );

  const handleThemeChange = (id: React.Key) => {
    const slug = String(id) as ThemeSlug;
    const normalized = slug === "default" ? null : slug;

    void setTheme(normalized);

    if (isAuthenticated) {
      // Persisted in /v1/me/preferences by useStoreTheme().
      // Ce log est facultatif, mais rend explicite le comportement requis.
      console.debug(
        "Thème enregistré dans les préférences pour utilisateur authentifié",
        normalized,
      );
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Dropdown>
        <Dropdown.Trigger>
          <Button
            isIconOnly
            aria-label={t("account-theme-switcher-aria")}
            className="w-12 h-12 rounded-full shadow-lg"
            variant="secondary"
          >
            <Palette size={20} />
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="top end">
          <Dropdown.Menu
            aria-label={t("account-theme-switcher-label")}
            selectedKeys={new Set([currentTheme])}
            selectionMode="single"
            onAction={handleThemeChange}
          >
            {themes.map((themeOption) => (
              <Dropdown.Item
                key={themeOption.id}
                id={themeOption.id}
                textValue={themeOption.label}
              >
                <Dropdown.ItemIndicator />
                <Label>{themeOption.label}</Label>
                <Description>{themeOption.description}</Description>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}
