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

import { useState } from "react";
import { Button, Description, Dropdown, Label } from "@heroui/react";
import { Palette } from "lucide-react";

type ThemeKey = "light" | "luxury";

const THEMES: { id: ThemeKey; label: string; description: string }[] = [
  {
    id: "light",
    label: "Fufuni Classic",
    description: "Moderne, coins arrondis",
  },
  {
    id: "luxury",
    label: "Thème Luxe",
    description: "Minimaliste, bordures droites, polices Serif",
  },
];

export function ThemeSwitcher() {
  const [current, setCurrent] = useState<ThemeKey>(() => {
    return (
      (document.documentElement.getAttribute("data-theme") as ThemeKey) ??
      "light"
    );
  });

  const applyTheme = (key: ThemeKey) => {
    setCurrent(key);
    document.documentElement.setAttribute("data-theme", key);
    localStorage.setItem("ui-theme", key);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Dropdown>
        <Dropdown.Trigger>
          <Button
            isIconOnly
            aria-label="Changer de thème"
            className="w-12 h-12 rounded-full shadow-lg"
            variant="secondary"
          >
            <Palette size={20} />
          </Button>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="top end">
          <Dropdown.Menu
            aria-label="Thèmes disponibles"
            selectedKeys={new Set([current])}
            selectionMode="single"
            onAction={(id) => applyTheme(id as ThemeKey)}
          >
            {THEMES.map((t) => (
              <Dropdown.Item key={t.id} id={t.id} textValue={t.label}>
                <Dropdown.ItemIndicator />
                <Label>{t.label}</Label>
                <Description>{t.description}</Description>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}
