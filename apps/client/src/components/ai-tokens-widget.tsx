/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * Widget displaying the customer's AI token balance and API key management.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Button, Separator, Input, Chip, Label, TextField } from "@heroui/react";

import { useAiTokens } from "@/hooks/use-ai-tokens";

export function AiTokensWidget() {
  const { t } = useTranslation();
  const { balance, loading, linkApiKey, unlinkApiKey } = useAiTokens();

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleLink = async () => {
    if (!apiKeyInput.trim()) return;
    setWorking(true);
    setStatusMsg(null);
    const ok = await linkApiKey(apiKeyInput.trim());
    setStatusMsg(ok ? t("ai-tokens-link-success") : t("ai-tokens-link-error"));
    if (ok) setApiKeyInput("");
    setWorking(false);
  };

  const handleUnlink = async () => {
    setWorking(true);
    setStatusMsg(null);
    const ok = await unlinkApiKey();
    setStatusMsg(ok ? t("ai-tokens-unlink-success") : t("ai-tokens-link-error"));
    setWorking(false);
  };

  return (
    <Card>
      <Card.Header>
        <h2 className="text-lg font-semibold">{t("ai-tokens-balance")}</h2>
      </Card.Header>
      <Separator />
      <Card.Content className="gap-4">
        {loading ? (
          <p className="text-sm text-gray-500">{t("ai-tokens-loading")}</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Chip color="success" variant="tertiary">
                {t("ai-tokens-balance-units", { count: balance?.balance ?? 0 })}
              </Chip>
              {balance?.api_key_masked ? (
                <span className="text-sm text-gray-500 font-mono">
                  {balance.api_key_masked}
                </span>
              ) : (
                <span className="text-sm text-gray-400">
                  {t("ai-tokens-no-key")}
                </span>
              )}
            </div>

            {balance?.api_key_masked && (
              <Button
                isDisabled={working}
                variant="ghost"
                onPress={handleUnlink}
              >
                {t("ai-tokens-unlink-button")}
              </Button>
            )}

            {!balance?.api_key_masked && (
              <div className="flex gap-2 items-end">
                <TextField
                  className="flex-1"
                  value={apiKeyInput}
                  onChange={setApiKeyInput}
                >
                  <Label>{t("ai-tokens-api-key-label")}</Label>
                  <Input />
                </TextField>
                <Button
                  isDisabled={working || !apiKeyInput.trim()}
                  onPress={handleLink}
                >
                  {t("ai-tokens-link-button")}
                </Button>
              </div>
            )}

            {statusMsg && (
              <p className="text-sm text-gray-600">{statusMsg}</p>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
}
