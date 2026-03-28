/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/react";
import { Input, TextField, Label } from "@heroui/react";
import { Table } from "@heroui/react";
import { Modal } from "@heroui/react";
import { Card } from "@heroui/react";

import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";
import { getApiBase } from "@/lib/api-base";
import { AdminCrudLayout } from "@/shared/ui/admin/admin-crud-layout";
import { RowActions } from "@/shared/ui/admin/row-actions";
import { StatusBadge } from "@/shared/ui/admin/status-badge";
import { useAdminCrud } from "@/hooks/use-admin-crud";
import { LocalizedTaxNameInput } from "@/components/localized-tax-name-input";
import { getTaxNameForLocale } from "@/utils/description";
import { availableLanguages } from "@/i18n";

interface TaxRate {
  id: string;
  display_name: string;
  country_code: string | null;
  tax_code: string | null;
  rate_percentage: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = ["active", "inactive"];

export default function TaxRatesPage() {
  const { t, i18n } = useTranslation();
  const { getJson, postJson, deleteJson, patchJson } = useSecuredApi();

  const apiBase = getApiBase();

  const {
    items: taxRates,
    setItems: setTaxRates,
    displayedItems: displayed,
    globalFilter,
    setGlobalFilter,
    statusFilter,
    setStatusFilter,
    isModalOpen,
    setIsModalOpen,
    isEditMode,
    editingItem: editingTaxRate,
    openCreate,
    openEdit,
  } = useAdminCrud<TaxRate>({
    filterFn: (r, term) =>
      getTaxNameForLocale(r.display_name, i18n.language)
        .toLowerCase()
        .includes(term) ||
      (r.country_code?.toLowerCase() ?? "").includes(term) ||
      (r.tax_code?.toLowerCase() ?? "").includes(term),
  });

  const [formData, setFormData] = useState({
    display_name: "",
    country_code: "" as string | null,
    tax_code: "" as string | null,
    rate_percentage: 0,
    status: "active" as "active" | "inactive",
  });
  const [selectedLocale, setSelectedLocale] = useState(
    availableLanguages.find((l) => l.isDefault)?.code || "en-US",
  );

  const loadData = async () => {
    try {
      const resp = await getJson(`${apiBase}/v1/tax-rates?limit=100`);

      setTaxRates(resp.items || []);
    } catch (err) {
      console.error("Failed to load tax rates", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setFormData({
      display_name: "",
      country_code: "",
      tax_code: "",
      rate_percentage: 0,
      status: "active",
    });
    setSelectedLocale(
      availableLanguages.find((l) => l.isDefault)?.code || "en-US",
    );
    openCreate();
  };

  const handleOpenEdit = (taxRate: TaxRate) => {
    setFormData({
      display_name: taxRate.display_name,
      country_code: taxRate.country_code || "",
      tax_code: taxRate.tax_code || "",
      rate_percentage: taxRate.rate_percentage,
      status: taxRate.status,
    });
    openEdit(taxRate);
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        country_code: formData.country_code?.trim() || null,
        tax_code: formData.tax_code?.trim() || null,
        rate_percentage: Number(formData.rate_percentage),
      };

      if (isEditMode && editingTaxRate) {
        const response = await patchJson(
          `${apiBase}/v1/tax-rates/${editingTaxRate.id}`,
          payload,
        );

        if (response) {
          setTaxRates(
            taxRates.map((r) => (r.id === editingTaxRate.id ? response : r)),
          );
        } else {
          await loadData();
        }
      } else {
        const response = await postJson(`${apiBase}/v1/tax-rates`, payload);

        if (response) {
          setTaxRates([...taxRates, response]);
        } else {
          await loadData();
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error("Failed to save tax rate", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this tax rate?")) {
      try {
        await deleteJson(`${apiBase}/v1/tax-rates/${id}`);
        setTaxRates(taxRates.filter((r) => r.id !== id));
      } catch (err) {
        console.error("Failed to delete tax rate", err);
      }
    }
  };

  return (
    <DefaultLayout>
      <AdminCrudLayout
        addLabel={t("admin-tax-rates-add")}
        filterPlaceholder={t("admin-tax-rates-filter-placeholder")}
        globalFilter={globalFilter}
        statusFilter={statusFilter || ""}
        title={t("admin-tax-rates-title")}
        onAdd={handleOpenCreate}
        onGlobalFilterChange={setGlobalFilter}
        onStatusFilterChange={(v) => setStatusFilter(v || "")}
      >
        <Card>
          <Card.Content>
            <Table aria-label="Tax Rates Table">
              <Table.Content>
                <Table.Header>
                  <Table.Column isRowHeader>
                    {t("admin-common-name")}
                  </Table.Column>
                  <Table.Column>
                    {t("admin-tax-rates-country-code")}
                  </Table.Column>
                  <Table.Column>{t("admin-tax-rates-tax-code")}</Table.Column>
                  <Table.Column>{t("admin-tax-rates-rate")}</Table.Column>
                  <Table.Column>{t("admin-common-status")}</Table.Column>
                  <Table.Column width={100}>
                    {t("admin-common-actions")}
                  </Table.Column>
                </Table.Header>
                <Table.Body renderEmptyState={() => t("admin-common-empty")}>
                  {displayed.map((item) => (
                    <Table.Row key={item.id} className="odd:bg-default-50">
                      <Table.Cell>
                        {getTaxNameForLocale(item.display_name, i18n.language)}
                      </Table.Cell>
                      <Table.Cell>
                        {item.country_code || (
                          <span className="text-gray-400 italic">
                            {t("admin-tax-rates-fallback")}
                          </span>
                        )}
                      </Table.Cell>
                      <Table.Cell>{item.tax_code || "-"}</Table.Cell>
                      <Table.Cell>{item.rate_percentage}%</Table.Cell>
                      <Table.Cell>
                        <StatusBadge status={item.status} />
                      </Table.Cell>
                      <Table.Cell>
                        <RowActions
                          onDelete={() => handleDelete(item.id)}
                          onEdit={() => handleOpenEdit(item)}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table>
          </Card.Content>
        </Card>

        <Modal isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
          <Modal.Backdrop>
            <Modal.Container size="lg">
              <Modal.Dialog>
                {({ close }) => (
                  <>
                    <Modal.CloseTrigger onPress={close} />
                    <Modal.Header>
                      {isEditMode
                        ? t("admin-tax-rates-edit")
                        : t("admin-tax-rates-create")}
                    </Modal.Header>
                    <Modal.Body>
                      <div className="space-y-4">
                        {/* Locale selector */}
                        <div className="flex flex-col gap-1">
                          <Label>{t("admin-products-title-locale")}</Label>
                          <select
                            className="px-3 py-2 rounded-lg bg-default-100 border border-default-300 text-sm focus:outline-none focus:ring-2"
                            value={selectedLocale}
                            onChange={(e) =>
                              setSelectedLocale(e.target.value || "en-US")
                            }
                          >
                            {availableLanguages.map((lang) => (
                              <option key={lang.code} value={lang.code}>
                                {lang.nativeName}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Tax name */}
                        <div>
                          <Label>{t("admin-common-name")}</Label>
                          <div className="mt-1">
                            <LocalizedTaxNameInput
                              required
                              locale={selectedLocale}
                              value={formData.display_name}
                              onChange={(val) =>
                                setFormData({ ...formData, display_name: val })
                              }
                              onLocaleChange={setSelectedLocale}
                            />
                          </div>
                        </div>

                        {/* Country and Tax code */}
                        <div className="grid grid-cols-2 gap-4">
                          <TextField>
                            <Label>{t("admin-tax-rates-country-code")}</Label>
                            <Input
                              maxLength={2}
                              placeholder="FR"
                              value={formData.country_code || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  country_code: e.target.value.toUpperCase(),
                                })
                              }
                            />
                          </TextField>
                          <TextField>
                            <Label>{t("admin-tax-rates-tax-code")}</Label>
                            <Input
                              placeholder="txcd_99999999"
                              value={formData.tax_code || ""}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  tax_code: e.target.value,
                                })
                              }
                            />
                          </TextField>
                        </div>

                        {/* Tax rate percentage */}
                        <TextField>
                          <Label>{t("admin-tax-rates-rate")}</Label>
                          <Input
                            placeholder="20.0"
                            type="number"
                            value={formData.rate_percentage.toString()}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                rate_percentage: Number(e.target.value),
                              })
                            }
                          />
                        </TextField>

                        {/* Status */}
                        <div className="flex flex-col gap-1">
                          <Label>{t("admin-common-status")}</Label>
                          <select
                            className="px-3 py-2 rounded-lg bg-default-100 border border-default-300 text-sm focus:outline-none focus:ring-2"
                            value={formData.status}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                status: e.target.value as "active" | "inactive",
                              })
                            }
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </Modal.Body>
                    <Modal.Footer>
                      <Button variant="tertiary" onPress={close}>
                        {t("admin-common-cancel")}
                      </Button>
                      <Button
                        isDisabled={!formData.display_name}
                        variant="primary"
                        onPress={handleSave}
                      >
                        {t("admin-common-save")}
                      </Button>
                    </Modal.Footer>
                  </>
                )}
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </AdminCrudLayout>
    </DefaultLayout>
  );
}
