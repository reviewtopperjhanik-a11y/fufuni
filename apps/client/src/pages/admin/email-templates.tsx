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

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button, Card, Switch } from "@heroui/react";
import { TextField, Label, Input, TextArea, Select, ListBox } from "@heroui/react";
import { CheckCircle, AlertCircle, Mail, SendHorizonal, Sparkles } from "lucide-react";
import { availableLanguages } from "@/i18n";
import { getEditorContent, mergeLocale } from "@/utils/description";
import { translateWithAi, type AiParams } from "@/utils/ai-client";

import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";
import { getApiBase } from "@/lib/api-base";
import { RichHtmlEditor } from "@/components/rich-html-editor";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderEmailEvent =
  | "global"
  | "pending"
  | "paid"
  | "payment_failed"
  | "processing"
  | "shipped"
  | "delivered"
  | "refunded"
  | "canceled";

interface EmailSetting {
  id?: string;
  event: OrderEmailEvent;
  enabled: boolean;
  subject: string;
  html_body: string;
  text_body: string;
}

const ORDER_EMAIL_EVENTS: OrderEmailEvent[] = [
  "global",
  "pending",
  "paid",
  "payment_failed",
  "processing",
  "shipped",
  "delivered",
  "refunded",
  "canceled",
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function EmailTemplatesPage() {
  const { t, i18n } = useTranslation();
  const apiBase = getApiBase();
  const queryClient = useQueryClient();
  const { getJson, putJson, postJson, hasPermission } = useSecuredApi();

  const [selectedEvent, setSelectedEvent] =
    useState<OrderEmailEvent>("global");
  const [savedEvent, setSavedEvent] = useState<OrderEmailEvent | null>(null);

  // ── Mail permission ───────────────────────────────────────────────────
  const [canSendTest, setCanSendTest] = useState(false);
  const mailPermission = (import.meta as any).env?.MAIL_PERMISSION || "mail:api";
  useEffect(() => {
    hasPermission(mailPermission)
      .then(setCanSendTest)
      .catch(() => setCanSendTest(false));
  }, [hasPermission, mailPermission]);

  // ── Locale selector ────────────────────────────────────────────────────
  const defaultLocale = availableLanguages.find((l) => l.isDefault)?.code ?? "en-US";
  const [selectedLocale, setSelectedLocale] = useState<string>(() => {
    const current = i18n.language;
    return availableLanguages.some((l) => l.code === current) ? current : defaultLocale;
  });

  // ── AI permission ─────────────────────────────────────────────────────
  const [canUseAi, setCanUseAi] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const aiPermission = (import.meta as any).env?.AI_PERMISSION || "ai:api";
  useEffect(() => {
    hasPermission(aiPermission)
      .then(setCanUseAi)
      .catch(() => setCanUseAi(false));
  }, [hasPermission, aiPermission]);

  // ── Test email state ──────────────────────────────────────────────────
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [testResult, setTestResult] = useState<"ok" | "error" | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────
  const { data: settingsList, isLoading } = useQuery<EmailSetting[]>({
    queryKey: ["admin-email-settings"],
    queryFn: () =>
      getJson(`${apiBase}/v1/admin/order-email-settings`).then(
        (r: any) => r.settings,
      ),
  });

  // Build a lookup map from loaded data
  const settingsMap = (settingsList ?? []).reduce(
    (acc, s) => {
      acc[s.event] = s;
      return acc;
    },
    {} as Record<OrderEmailEvent, EmailSetting>,
  );

  // Current event's setting (defaults if not set)
  const currentSetting: EmailSetting = settingsMap[selectedEvent] ?? {
    event: selectedEvent,
    enabled: false,
    subject: "",
    html_body: "",
    text_body: "",
  };

  // Local editable state – reset when switching events
  const [form, setForm] = useState<Omit<EmailSetting, "event">>({
    enabled: false,
    subject: "",
    html_body: "",
    text_body: "",
  });

  // Sync form state when selection or remote data changes
  const formKey = `${selectedEvent}-${settingsList ? "loaded" : "loading"}`;
  const [formInitKey, setFormInitKey] = useState(formKey);
  if (formKey !== formInitKey) {
    setFormInitKey(formKey);
    setForm({
      enabled: currentSetting.enabled,
      subject: currentSetting.subject,
      html_body: currentSetting.html_body,
      text_body: currentSetting.text_body,
    });
  }

  // ── Save mutation ────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (payload: EmailSetting) =>
      putJson(`${apiBase}/v1/admin/order-email-settings/${payload.event}`, {
        enabled: payload.enabled,
        subject: payload.subject,
        html_body: payload.html_body,
        text_body: payload.text_body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-email-settings"] });
      setSavedEvent(selectedEvent);
      setTimeout(() => setSavedEvent(null), 3000);
    },
  });

  // ── Send test mutation ───────────────────────────────────────────────────
  const sendTestMutation = useMutation({
    mutationFn: () =>
      postJson(`${apiBase}/v1/mails/send`, {
        to: testEmailAddress,
        subject: getEditorContent(form.subject, selectedLocale) || `[Test] ${selectedEvent} — email template`,
        html: getEditorContent(form.html_body, selectedLocale) || undefined,
        text: getEditorContent(form.text_body, selectedLocale) || undefined,
      }),
    onSuccess: () => {
      setTestResult("ok");
      setTimeout(() => setTestResult(null), 4000);
    },
    onError: () => {
      setTestResult("error");
      setTimeout(() => setTestResult(null), 4000);
    },
  });

  function handleSave() {
    saveMutation.mutate({ event: selectedEvent, ...form });
  }

  function handleSendTest() {
    if (!testEmailAddress.trim()) return;
    setTestResult(null);
    sendTestMutation.mutate();
  }

  // ── AI translation ─────────────────────────────────────────────────────────
  const htmlBodyRef = useRef(form.html_body);
  const selectedLocaleRef = useRef(selectedLocale);
  useEffect(() => { htmlBodyRef.current = form.html_body; }, [form.html_body]);
  useEffect(() => { selectedLocaleRef.current = selectedLocale; }, [selectedLocale]);

  const handleAiTranslate = useCallback(async () => {
    setIsTranslating(true);
    try {
      const params = await getJson(
        `${(import.meta as any).env?.API_BASE_URL}/v1/ai/parameters`,
      ) as AiParams;

      const FALLBACK = ["en-US", "fr-FR", "es-ES", "zh-CN", "ar-SA", "he-IL"];
      const raw = htmlBodyRef.current;
      const currentLocale = selectedLocaleRef.current;

      // Parse the stored value (may be JSON locale map or plain HTML)
      let parsedMap: Record<string, string> | null = null;
      if (raw.trimStart().startsWith("{")) {
        try { parsedMap = JSON.parse(raw) as Record<string, string>; } catch { /* ignore */ }
      }

      // Always translate TO the current locale — find best source in another locale
      let sourceHtml = "";
      if (parsedMap) {
        const sourceLang = FALLBACK.find((l) => l !== currentLocale && !!parsedMap![l]);
        sourceHtml = sourceLang ? parsedMap[sourceLang] : "";
      } else {
        // Plain HTML stored (legacy) — use it as source only if current locale differs from default
        sourceHtml = raw;
      }

      if (!sourceHtml) {
        alert(t("admin-email-templates-ai-no-source"));
        return;
      }

      // Tokenize {{...}} placeholders so the AI preserves them verbatim
      const tokens: Record<string, string> = {};
      let i = 0;
      const tokenized = sourceHtml.replace(/\{\{[^}]+\}\}/g, (m) => {
        const k = `TMPLVAR${i++}`;
        tokens[k] = m;
        return k;
      });

      const targetLangName =
        availableLanguages.find((l) => l.code === currentLocale)?.nativeName ?? currentLocale;

      const result = await translateWithAi(tokenized, targetLangName, params, true, {
        maxTokens: 4096,
        contentType: "email_template",
      });
      if (!result.success) throw new Error(result.error ?? "Translation failed");

      let restored = result.content ?? "";
      for (const [k, v] of Object.entries(tokens)) restored = restored.split(k).join(v);

      setForm((prev) => ({
        ...prev,
        html_body: mergeLocale(prev.html_body, currentLocale, restored),
      }));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      alert(t("admin-email-templates-ai-error", { defaultValue: `Translation failed: ${errorMsg}` }));
    } finally {
      setIsTranslating(false);
    }
  }, [getJson, t]);

  // ── Default templates ────────────────────────────────────────────────────
  function getDefaultTemplate(event: OrderEmailEvent): string {
    const cfg: Record<OrderEmailEvent, { badge: string; badgeBg: string; badgeColor: string; heading: string; body: string }> = {
      global:         { badge: "📦 {{status}}",        badgeBg: "#f5f5f5", badgeColor: "#555",     heading: "An update about your order",            body: "We have an update about your order." },
      pending:        { badge: "🕐 Pending",            badgeBg: "#f9fafb", badgeColor: "#6b7280",  heading: "We've received your order",             body: "Thank you for your purchase! We're getting your order ready." },
      paid:           { badge: "💳 Paid",               badgeBg: "#e0f2fe", badgeColor: "#0369a1",  heading: "Your payment has been confirmed",       body: "Great news — your payment was successfully processed." },
      payment_failed: { badge: "⚠️ Payment Failed",     badgeBg: "#fef2f2", badgeColor: "#b91c1c",  heading: "Payment failed for your order",        body: "Unfortunately, we were unable to process your payment. Please try again." },
      processing:     { badge: "⏳ Processing",          badgeBg: "#fefce8", badgeColor: "#92400e",  heading: "Your order is being processed",        body: "Our team is preparing your order. We'll notify you when it ships." },
      shipped:        { badge: "🚚 Shipped",             badgeBg: "#eff6ff", badgeColor: "#1d4ed8",  heading: "Your order has shipped!",              body: "Good news! Your order is on its way." },
      delivered:      { badge: "✅ Delivered",           badgeBg: "#f0fdf4", badgeColor: "#16a34a",  heading: "Your order has been delivered",        body: "Your order has arrived. We hope you enjoy your purchase!" },
      refunded:       { badge: "↩️ Refunded",            badgeBg: "#f5f3ff", badgeColor: "#7c3aed",  heading: "Your order has been refunded",         body: "Your refund has been processed. It may take a few business days to appear in your account." },
      canceled:       { badge: "❌ Canceled",            badgeBg: "#fef2f2", badgeColor: "#b91c1c",  heading: "Your order has been canceled",         body: "Your order has been canceled. If you have any questions, please contact us." },
    };
    const c = cfg[event];
    const trackingSection = event === "shipped"
      ? `<p style="color:#555;font-size:14px;">Tracking number: <strong>{{trackingNumber}}</strong></p>`
      : "";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${c.heading}</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f5f5; font-family: system-ui, sans-serif; }
    .wrapper { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px;
               padding: 40px 32px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    h1 { font-size: 22px; margin-top: 0; color: #111; }
    .badge { display: inline-block; background: ${c.badgeBg}; color: ${c.badgeColor};
             border-radius: 999px; padding: 4px 14px; font-size: 13px; font-weight: 600; }
    .order-number { font-size: 15px; color: #555; margin-top: 8px; }
    .total { font-size: 18px; font-weight: 700; color: #111; margin: 24px 0 8px; }
    .cta { display: block; text-align: center; background: #111; color: #fff !important;
           text-decoration: none; border-radius: 8px; padding: 14px 24px;
           font-size: 15px; font-weight: 600; margin: 28px 0; }
    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 32px; }
    .footer a { color: #999; }
  </style>
</head>
<body>
  <div class="wrapper">
    <span class="badge">${c.badge}</span>
    <h1>${c.heading}</h1>
    <p style="color:#555;font-size:15px;">Hello <strong>{{customerName}}</strong>,</p>
    <p style="color:#555;font-size:14px;">${c.body}</p>
    <p class="order-number">Order Number: <strong>{{orderNumber}}</strong></p>
    <p class="total">Total: {{total}}</p>
    ${trackingSection}
    <a href="{{orderUrl}}" class="cta">View My Order \u2192</a>
    <p style="color:#999;font-size:12px;text-align:center;">
      If the button doesn't work, copy this link into your browser:<br/>
      <a href="{{orderUrl}}" style="color:#555;word-break:break-all;">{{orderUrl}}</a>
    </p>
    <div class="footer">
      \u2014 The {{storeName}} Team<br/>
      <small>This message was sent to you because you placed an order with us.</small>
    </div>
  </div>
</body>
</html>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function eventLabel(event: OrderEmailEvent): string {
    return t(`admin-email-templates-event-${event}` as any, { defaultValue: event });
  }

  function isEventEnabled(event: OrderEmailEvent): boolean {
    return settingsMap[event]?.enabled ?? false;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <DefaultLayout>
      <div className="max-w-4xl mx-auto space-y-6 py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Mail className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-default-900">
              {t("admin-email-templates-title")}
            </h1>
            <p className="text-sm text-default-500 mt-1">
              {t("admin-email-templates-subtitle")}
            </p>
          </div>
        </div>

        {/* Variables reference card */}
        <Card>
          <Card.Content className="py-3 px-4">
            <p className="text-xs font-semibold text-default-500 uppercase tracking-wide mb-2">
              {t("admin-email-templates-variables-hint")}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "storeName",
                "orderNumber",
                "orderUrl",
                "status",
                "total",
                "customerName",
                "trackingNumber",
                "trackingUrl",
              ].map((v) => (
                <code
                  key={v}
                  className="text-xs bg-default-100 text-default-700 rounded px-2 py-0.5 font-mono"
                >
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          </Card.Content>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Event list */}
          <div className="md:col-span-1">
            <Card>
              <Card.Content className="p-2">
                <nav className="space-y-1">
                  {ORDER_EMAIL_EVENTS.map((event) => (
                    <button
                      key={event}
                      type="button"
                      onClick={() => {
                        setSelectedEvent(event);
                        setSavedEvent(null);
                        const s = settingsMap[event] ?? {
                          event,
                          enabled: false,
                          subject: "",
                          html_body: "",
                          text_body: "",
                        };
                        setForm({
                          enabled: s.enabled,
                          subject: s.subject,
                          html_body: s.html_body,
                          text_body: s.text_body,
                        });
                      }}
                      className={[
                        "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between gap-2",
                        selectedEvent === event
                          ? "bg-primary/10 text-primary"
                          : "text-default-700 hover:bg-default-100",
                      ].join(" ")}
                    >
                      <span>{eventLabel(event)}</span>
                      {isEventEnabled(event) && (
                        <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                      )}
                    </button>
                  ))}
                </nav>
              </Card.Content>
            </Card>
          </div>

          {/* Editor panel */}
          <div className="md:col-span-3">
            {isLoading ? (
              <Card>
                <Card.Content className="p-8 text-center text-default-400">
                  {t("admin-email-templates-loading")}
                </Card.Content>
              </Card>
            ) : (
              <Card>
                <Card.Content className="p-6 space-y-5">
                  {/* Event heading + toggle */}
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-default-900">
                      {eventLabel(selectedEvent)}
                    </h2>
                    <Switch
                      isSelected={form.enabled}
                      onChange={(v: boolean) =>
                        setForm((prev) => ({ ...prev, enabled: v }))
                      }
                    >
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Switch.Content>
                        <Label>
                          {form.enabled
                            ? t("admin-email-templates-enabled-on")
                            : t("admin-email-templates-enabled-off")}
                        </Label>
                      </Switch.Content>
                    </Switch>
                  </div>

                  {/* Locale selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-default-600 shrink-0">
                      {t("admin-email-templates-locale-label")}
                    </span>
                    <Select
                      className="flex-1 max-w-[200px]"
                      value={selectedLocale}
                      onChange={(value) =>
                        setSelectedLocale((value as string) || defaultLocale)
                      }
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {availableLanguages.map((lang) => (
                            <ListBox.Item
                              key={lang.code}
                              id={lang.code}
                              textValue={lang.nativeName}
                            >
                              {lang.nativeName}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>

                  {/* Subject */}
                  <TextField
                    value={getEditorContent(form.subject, selectedLocale)}
                    onChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        subject: mergeLocale(prev.subject, selectedLocale, v),
                      }))
                    }
                  >
                    <Label>{t("admin-email-templates-subject")}</Label>
                    <Input placeholder={t("admin-email-templates-subject-placeholder")} />
                  </TextField>

                  {/* HTML body — TipTap WYSIWYG */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-medium text-default-700">
                        {t("admin-email-templates-html-body")}
                      </p>
                      <div className="flex items-center gap-2">
                        {canUseAi && (
                          <Button
                            isIconOnly
                            isDisabled={isTranslating}
                            isPending={isTranslating}
                            size="sm"
                            variant="tertiary"
                            onPress={handleAiTranslate}
                          >
                            <Sparkles className="w-4 h-4" />
                          </Button>
                        )}
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              html_body: mergeLocale(
                                prev.html_body,
                                selectedLocale,
                                getDefaultTemplate(selectedEvent),
                              ),
                            }))
                          }
                        >
                          {t("admin-email-templates-use-default")}
                        </button>
                      </div>
                    </div>
                    <RichHtmlEditor
                      value={getEditorContent(form.html_body, selectedLocale)}
                      placeholder={t("admin-email-templates-html-body-placeholder")}
                      onChange={(html) =>
                        setForm((prev) => ({
                          ...prev,
                          html_body: mergeLocale(prev.html_body, selectedLocale, html),
                        }))
                      }
                    />
                  </div>

                  {/* Text body */}
                  <TextField
                    value={getEditorContent(form.text_body, selectedLocale)}
                    onChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        text_body: mergeLocale(prev.text_body, selectedLocale, v),
                      }))
                    }
                  >
                    <Label>{t("admin-email-templates-text-body")}</Label>
                    <TextArea
                      className="font-mono text-xs min-h-24"
                      placeholder={t("admin-email-templates-text-body-placeholder")}
                    />
                  </TextField>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      isDisabled={saveMutation.isPending}
                      variant="primary"
                      onPress={handleSave}
                    >
                      {saveMutation.isPending
                        ? t("admin-email-templates-saving")
                        : t("admin-email-templates-save")}
                    </Button>

                    {savedEvent === selectedEvent && (
                      <span className="flex items-center gap-1.5 text-sm text-success">
                        <CheckCircle className="w-4 h-4" />
                        {t("admin-email-templates-saved")}
                      </span>
                    )}

                    {saveMutation.isError && (
                      <span className="flex items-center gap-1.5 text-sm text-danger">
                        <AlertCircle className="w-4 h-4" />
                        {t("admin-email-templates-save-error")}
                      </span>
                    )}
                  </div>

                  {/* Send test email (requires MAIL_PERMISSION) */}
                  {canSendTest && (
                    <div className="border-t pt-4 space-y-3">
                      <p className="text-xs font-semibold text-default-500 uppercase tracking-wide">
                        {t("admin-email-templates-test-title")}
                      </p>
                      <div className="flex items-end gap-2">
                        <TextField
                          className="flex-1"
                          value={testEmailAddress}
                          onChange={setTestEmailAddress}
                          type="email"
                        >
                          <Label>{t("admin-email-templates-test-address")}</Label>
                          <Input
                            placeholder={t("admin-email-templates-test-address-placeholder")}
                          />
                        </TextField>
                        <Button
                          isDisabled={
                            sendTestMutation.isPending ||
                            !testEmailAddress.trim()
                          }
                          variant="secondary"
                          onPress={handleSendTest}
                        >
                          <SendHorizonal className="w-4 h-4 mr-1.5" />
                          {sendTestMutation.isPending
                            ? t("admin-email-templates-test-sending")
                            : t("admin-email-templates-test-send")}
                        </Button>
                      </div>
                      {testResult === "ok" && (
                        <span className="flex items-center gap-1.5 text-sm text-success">
                          <CheckCircle className="w-4 h-4" />
                          {t("admin-email-templates-test-sent")}
                        </span>
                      )}
                      {testResult === "error" && (
                        <span className="flex items-center gap-1.5 text-sm text-danger">
                          <AlertCircle className="w-4 h-4" />
                          {t("admin-email-templates-test-error")}
                        </span>
                      )}
                    </div>
                  )}
                </Card.Content>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DefaultLayout>
  );
}
