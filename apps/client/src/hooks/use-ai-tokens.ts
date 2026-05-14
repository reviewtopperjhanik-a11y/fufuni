/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * Hook for managing the customer's AI token balance and linked API key.
 */

import { useState, useEffect, useCallback } from "react";

import { useAuth } from "@/authentication";
import { getApiBase } from "@/lib/api-base";

export interface AiTokenBalance {
  customer_id: string;
  api_key_masked: string | null;
  balance: number;
  updated_at: string | null;
}

export function useAiTokens() {
  const auth = useAuth() as any;
  const apiBase = getApiBase();

  const [balance, setBalance] = useState<AiTokenBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!auth?.getJson) return;
    setLoading(true);
    setError(null);
    try {
      const data = await auth.getJson(`${apiBase}/v1/me/ai-tokens/balance`);
      setBalance(data);
    } catch {
      setError("load-failed");
    } finally {
      setLoading(false);
    }
  }, [auth, apiBase]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const linkApiKey = useCallback(
    async (apiKey: string): Promise<boolean> => {
      if (!auth?.postJson) return false;
      try {
        await auth.postJson(`${apiBase}/v1/me/ai-tokens/link`, { api_key: apiKey });
        await fetchBalance();
        return true;
      } catch {
        return false;
      }
    },
    [auth, apiBase, fetchBalance],
  );

  const unlinkApiKey = useCallback(async (): Promise<boolean> => {
    if (!auth?.patchJson) return false;
    try {
      await auth.patchJson(`${apiBase}/v1/me/profile`, { ai_proxy_api_key: null });
      await fetchBalance();
      return true;
    } catch {
      return false;
    }
  }, [auth, apiBase, fetchBalance]);

  return { balance, loading, error, linkApiKey, unlinkApiKey, refetch: fetchBalance };
}
