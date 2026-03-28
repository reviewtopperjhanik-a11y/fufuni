/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState, useCallback } from 'react';
import { Input, Button, Label, Tooltip } from '@heroui/react';
import { Select, ListBox } from '@heroui/react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { availableLanguages } from '@/i18n';
import {
  getTaxNameForLocale,
  mergeTaxNameLocale,
  parseTaxName,
} from '@/utils/description';
import { useLocalizedTextInput } from '@/hooks/use-localized-text-input';

interface LocalizedTaxNameInputProps {
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

export function LocalizedTaxNameInput({
  value,
  onChange,
  required = false,
  locale,
  onLocaleChange,
}: LocalizedTaxNameInputProps) {
  const { t } = useTranslation();

  // --- Locale state ---------------------------------------------------------
  const defaultLocale =
    availableLanguages.find((l) => l.isDefault)?.code ?? 'en-US';
  const [internalLocale, setInternalLocale] = useState(defaultLocale);
  const selectedLocale = locale ?? internalLocale;

  const { inputValue, isTranslating, canUseAi, isRTL, handleInputChange, handleAiTranslate } =
    useLocalizedTextInput({
      value,
      onChange,
      selectedLocale,
      parseFn: parseTaxName,
      mergeFn: mergeTaxNameLocale,
      getFn: getTaxNameForLocale,
    });

  // --- Locale switch --------------------------------------------------------
  const handleLocaleChange = useCallback((selectedKey: string | number | undefined) => {
    const newLocale = selectedKey ? String(selectedKey) : selectedLocale;
    if (onLocaleChange) {
      onLocaleChange(newLocale);
    } else {
      setInternalLocale(newLocale);
    }
  }, [selectedLocale, onLocaleChange]);

  return (
    <div className="flex items-center gap-2" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Language selector (hidden when controlled by parent) */}
      {!locale && (
        <Select
          className="w-36 shrink-0"
          aria-label={t('admin-common-language')}
          value={selectedLocale}
          onChange={(value) => handleLocaleChange(((value as string) || "") as any)}
        >
          <Label>{t('admin-common-language')}</Label>
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

      <Input
        className="flex-1"
        required={required}
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder="e.g. VAT FR"
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
