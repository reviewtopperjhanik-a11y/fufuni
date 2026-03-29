/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

/**
 * use-localized-text-input.ts
 *
 * Shared logic for plain-text localized input fields (title, tax name, etc.).
 * Handles:
 *  - Controlled input value synced to the raw localized JSON/string
 *  - Auto-migration from legacy plain text to JSON on locale switch
 *  - AI translation via the /v1/ai/parameters endpoint + translateWithAi
 *  - AI permission check (canUseAi)
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { availableLanguages } from "@/i18n";
import { useSecuredApi } from "@/authentication";
import { type LocalizedDesc } from "@/utils/description";
import { translateWithAi, type AiParams } from "@/utils/ai-client";

/**
 * Options accepted by the {@link useLocalizedTextInput} hook.
 * The three function parameters decouple the hook from any specific
 * localized-string format (title, tax name, description, …).
 */
export interface UseLocalizedTextInputOptions {
  /** Raw value from the DB (plain string legacy or LocalizedDesc JSON) */
  value: string;
  /** Called whenever the raw value changes */
  onChange: (newValue: string) => void;
  /** Resolved locale (locale prop ?? internal locale state) */
  selectedLocale: string;
  /** Parses raw DB string into LocalizedDesc or plain string */
  parseFn: (raw: string) => LocalizedDesc | string;
  /** Merges a new text value for a locale into the raw string */
  mergeFn: (raw: string, locale: string, text: string) => string;
  /** Extracts the display value for a locale from the raw string */
  getFn: (raw: string, locale: string) => string;
}

/**
 * Values returned by the {@link useLocalizedTextInput} hook.
 */
export interface UseLocalizedTextInputResult {
  /** Current display value in the input */
  inputValue: string;
  /** Whether AI translation is in progress */
  isTranslating: boolean;
  /** Whether the user has the AI permission */
  canUseAi: boolean;
  /** Whether the current locale is RTL */
  isRTL: boolean;
  /** Call on input change */
  handleInputChange: (text: string) => void;
  /** Trigger AI translation for the current locale */
  handleAiTranslate: () => Promise<void>;
}

/**
 * Shared hook for plain-text localized input fields.
 *
 * Manages the controlled input display value, auto-migrates legacy plain-text
 * values to the JSON localized format on locale switch, checks whether the
 * current user may invoke the AI translation feature, and exposes a
 * `handleAiTranslate` callback that calls the `/v1/ai/parameters` endpoint
 * and {@link translateWithAi} under the hood.
 *
 * @param options - Configuration including the raw value, onChange callback,
 *   the active locale, and three format-specific helpers (parseFn, mergeFn,
 *   getFn).
 * @returns Stable callbacks and derived state for rendering the input UI.
 *
 * @example
 * ```tsx
 * const { inputValue, isTranslating, canUseAi, isRTL, handleInputChange, handleAiTranslate } =
 *   useLocalizedTextInput({
 *     value: rawDbString,
 *     onChange: setRawDbString,
 *     selectedLocale: 'fr-FR',
 *     parseFn: parseTitle,
 *     mergeFn: mergeTitleLocale,
 *     getFn: getTitleForLocale,
 *   });
 * ```
 */
export function useLocalizedTextInput({
  value,
  onChange,
  selectedLocale,
  parseFn,
  mergeFn,
  getFn,
}: UseLocalizedTextInputOptions): UseLocalizedTextInputResult {
  const { t } = useTranslation();
  const { getJson, hasPermission } = useSecuredApi();

  const [inputValue, setInputValue] = useState(() =>
    getFn(value, selectedLocale),
  );
  const [isTranslating, setIsTranslating] = useState(false);
  const [canUseAi, setCanUseAi] = useState(false);

  // Stable refs to avoid stale closures in callbacks
  const valueRef = useRef(value);
  const localeRef = useRef(selectedLocale);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    localeRef.current = selectedLocale;
  }, [selectedLocale]);

  // Sync input display value when the raw value or locale changes
  useEffect(() => {
    setInputValue(getFn(value, selectedLocale));
  }, [value, selectedLocale, getFn]);

  // Auto-migrate from plain text to JSON when locale switches
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;

      return;
    }
    const parsed = parseFn(value);

    if (typeof parsed === "string" && inputValue.trim()) {
      onChange(mergeFn(value, selectedLocale, inputValue));
    }
  }, [selectedLocale]);

  // Check AI permission on mount
  const aiPermission = (import.meta as any).env?.AI_PERMISSION ?? "ai:api";

  useEffect(() => {
    hasPermission(aiPermission)
      .then(setCanUseAi)
      .catch(() => setCanUseAi(false));
  }, [hasPermission, aiPermission]);

  const isRTL =
    availableLanguages.find((l) => l.code === selectedLocale)?.isRTL ?? false;

  const handleInputChange = useCallback(
    (text: string) => {
      setInputValue(text);
      onChange(mergeFn(valueRef.current, localeRef.current, text));
    },
    [onChange, mergeFn],
  );

  const handleAiTranslate = useCallback(async () => {
    setIsTranslating(true);
    try {
      const params = (await getJson(
        `${import.meta.env.API_BASE_URL}/v1/ai/parameters`,
      )) as AiParams;

      const FALLBACK = ["en-US", "fr-FR", "es-ES", "zh-CN", "ar-SA", "he-IL"];
      const currentValue = valueRef.current;
      const parsed = parseFn(currentValue);

      let sourceText = "";

      if (typeof parsed === "string") {
        sourceText = parsed;
      } else {
        const sourceLang = FALLBACK.find(
          (l) => l !== localeRef.current && !!parsed[l],
        );

        sourceText = sourceLang ? parsed[sourceLang] : "";
      }

      if (!sourceText) {
        alert(t("admin-products-ai-no-source"));

        return;
      }

      const targetLangName =
        availableLanguages.find((l) => l.code === localeRef.current)
          ?.nativeName ?? localeRef.current;

      const result = await translateWithAi(
        sourceText,
        targetLangName,
        params,
        false,
      );

      if (!result.success)
        throw new Error(result.error ?? "Translation failed");

      if (result.content) {
        const translated = result.content.trim();

        setInputValue(translated);
        onChange(mergeFn(valueRef.current, localeRef.current, translated));
      }
    } catch (err) {
      console.error("AI text translation failed", err);
      alert(t("admin-products-ai-error"));
    } finally {
      setIsTranslating(false);
    }
  }, [getJson, onChange, parseFn, mergeFn, t]);

  return {
    inputValue,
    isTranslating,
    canUseAi,
    isRTL,
    handleInputChange,
    handleAiTranslate,
  };
}
