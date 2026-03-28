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

// apps/client/src/components/LocalizedTitleInput.tsx
import { Input, Button, Select, Label, ListBox, Tooltip } from '@heroui/react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { availableLanguages } from '@/i18n';
import {
  getTitleForLocale,
  mergeTitleLocale,
  parseTitle,
} from '@/utils/description';
import { useLocalizedTextInput } from '@/hooks/use-localized-text-input';

interface LocalizedTitleInputProps {
  /** Raw value from the DB: plain string (legacy) or LocalizedDesc JSON */
  value: string;
  /** Called every time the content changes */
  onChange: (newValue: string) => void;
  /** Whether the field is required */
  required?: boolean;
  /** Optional controlled locale (if provided, hides the internal selector) */
  locale?: string;
  /** Optional callback to change locale (used by parent) */
  onLocaleChange?: (locale: string) => void;
}

export function LocalizedTitleInput({
  value,
  onChange,
  required = false,
  locale,
}: LocalizedTitleInputProps) {
  const { t } = useTranslation();

  const defaultLocale =
    availableLanguages.find((l) => l.isDefault)?.code ?? 'en-US';
  const selectedLocale = locale ?? defaultLocale;

  const { inputValue, isTranslating, canUseAi, isRTL, handleInputChange, handleAiTranslate } =
    useLocalizedTextInput({
      value,
      onChange,
      selectedLocale,
      parseFn: parseTitle,
      mergeFn: mergeTitleLocale,
      getFn: getTitleForLocale,
    });

  return (
    <div className="flex items-center gap-2" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Language selector (hidden when controlled by parent) */}
      {!locale && (
        <Select
          className="w-36 shrink-0"
          aria-label={t('admin-products-title-locale')}
          value={selectedLocale}
        >
          <Label>{t('admin-products-title-locale')}</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {availableLanguages.map((lang) => (
                <ListBox.Item key={lang.code} id={lang.code} textValue={lang.nativeName}>
                  {lang.nativeName}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}

      {/* Title input */}
      <Input
        className="flex-1"
        required={required}
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={t('admin-products-title-placeholder')}
        dir={isRTL ? 'rtl' : 'ltr'}
      />

      {/* AI translate — only shown if user has the AI permission */}
      {canUseAi && (
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              isPending={isTranslating}
              onPress={handleAiTranslate}
            >
              {!isTranslating && <Sparkles size={14} />}
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            {t('admin-products-title-ai')}
          </Tooltip.Content>
        </Tooltip>
      )}
    </div>
  );
}
