/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: MIT
 *
 * CategoryAdmin — Admin panel for category CRUD operations
 * Uses HeroUI v3 components with compound API patterns
 * Supports multilingual names and descriptions using JSON storage
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Modal,
  Input,
  Select,
  Label,
  ListBox,
  Header,
  Chip,
  Spinner,
  AlertDialog,
  ListBoxItemIndicator,
} from '@heroui/react';
import { useCategories, type Category } from '@/hooks/useCategories';
import { useSecuredApi } from '@/authentication';
import {
  resolveTitle,
  mergeTitleLocale,
  getTitleForLocale,
  mergeLocale,
  getEditorContent,
  parseTitle,
} from '@/utils/description';
import { availableLanguages } from '@/i18n';
import { translateWithAi, type AiParams } from '@/utils/ai-client';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? '/v1';

/**
 * Category delete confirmation dialog
 */
function DeleteCategoryDialog({
  category,
  open,
  onClose,
  onConfirm,
  isLoading,
}: {
  category: Category | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  const { t, i18n } = useTranslation();

  if (!category) return null;

  const displayName = resolveTitle(category.name, i18n.language);

  return (
    <AlertDialog isOpen={open} onOpenChange={onClose}>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="max-w-96">
            <AlertDialog.Header>
              <AlertDialog.Heading>{t('confirm-delete')}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-sm">
                {t('confirm-delete-category', { name: displayName })}
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                slot="close"
                variant="secondary"
                isDisabled={isLoading}
                onPress={onClose}
              >
                {t('cancel')}
              </Button>
              <Button
                slot="close"
                className="bg-red-600 text-white hover:bg-red-700"
                onPress={onConfirm}
                isDisabled={isLoading}
              >
                {t('delete')}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

/**
 * Category create/edit form modal with multilingual support
 */
function CategoryFormModal({
  isOpen,
  onOpenChange,
  category,
  allCategories,
  onSubmit,
  isLoading,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  allCategories: Category[];
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { getJson, hasPermission } = useSecuredApi();
  const [canUseAi, setCanUseAi] = useState(false);
  const [isTranslatingName, setIsTranslatingName] = useState(false);
  const [isTranslatingDesc, setIsTranslatingDesc] = useState(false);
  
  const defaultLocale =
    availableLanguages.find((l) => l.isDefault)?.code ?? "en-US";
  const [selectedLocale, setSelectedLocale] = useState<string>(() => {
    const current = i18n.language;
    return availableLanguages.some((l) => l.code === current)
      ? current
      : defaultLocale;
  });

  // Check AI permission on mount
  useEffect(() => {
    const aiPermission = (import.meta as any).env?.AI_PERMISSION ?? 'ai:api';
    hasPermission(aiPermission)
      .then(setCanUseAi)
      .catch(() => setCanUseAi(false));
  }, [hasPermission]);

  const [formData, setFormData] = useState(() =>
    category
      ? {
          handle: category.handle,
          name: category.name,
          nameValue: getTitleForLocale(category.name, selectedLocale),
          description: category.description || '',
          descriptionValue: getEditorContent(category.description || '', selectedLocale),
          parent_id: category.parent_id || '',
          image_url: category.image_url || '',
          position: String(category.position || 0),
          status: category.status,
        }
      : {
          handle: '',
          name: '',
          nameValue: '',
          description: '',
          descriptionValue: '',
          parent_id: '',
          image_url: '',
          position: '0',
          status: 'active',
        }
  );

  // Sync display values when locale changes
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      nameValue: getTitleForLocale(prev.name, selectedLocale),
      descriptionValue: getEditorContent(prev.description, selectedLocale),
    }));
  }, [selectedLocale]);

  const handleNameChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      nameValue: value,
    }));
  };

  const handleNameBlur = () => {
    const merged = mergeTitleLocale(formData.name, selectedLocale, formData.nameValue);
    setFormData((prev) => ({
      ...prev,
      name: merged,
    }));
  };

  const handleDescriptionChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      descriptionValue: value,
    }));
  };

  const handleDescriptionBlur = () => {
    const merged = mergeLocale(formData.description, selectedLocale, formData.descriptionValue);
    setFormData((prev) => ({
      ...prev,
      description: merged,
    }));
  };

  const handleTranslateName = async () => {
    setIsTranslatingName(true);
    try {
      // 1. Fetch AI configuration
      const params = await getJson(`${(import.meta as any).env?.API_BASE_URL}/v1/ai/parameters`) as AiParams;

      // 2. Find best source to translate from
      const FALLBACK = ['en-US', 'fr-FR', 'es-ES', 'zh-CN', 'ar-SA', 'he-IL'];
      const parsed = parseTitle(formData.name);

      let sourceText = '';
      if (typeof parsed === 'string') {
        sourceText = parsed;
      } else {
        const sourceLang = FALLBACK.find((l) => l !== selectedLocale && !!parsed[l]);
        sourceText = sourceLang ? parsed[sourceLang] : '';
      }

      if (!sourceText) {
        alert(t('admin-products-ai-no-source'));
        return;
      }

      // 3. Target language name
      const targetLangName =
        availableLanguages.find((l) => l.code === selectedLocale)?.nativeName ?? selectedLocale;

      // 4. Translate
      const result = await translateWithAi(sourceText, targetLangName, params, false);
      if (!result.success) throw new Error(result.error ?? 'Translation failed');

      if (result.content) {
        const translated = result.content.trim();
        setFormData((prev) => ({
          ...prev,
          nameValue: translated,
        }));
        const updated = mergeTitleLocale(formData.name, selectedLocale, translated);
        setFormData((prev) => ({
          ...prev,
          name: updated,
        }));
      }
    } catch (err) {
      console.error('AI name translation failed', err);
      alert(t('admin-products-ai-error'));
    } finally {
      setIsTranslatingName(false);
    }
  };

  const handleTranslateDescription = async () => {
    setIsTranslatingDesc(true);
    try {
      // 1. Fetch AI configuration
      const params = await getJson(`${(import.meta as any).env?.API_BASE_URL }/v1/ai/parameters`) as AiParams;

      // 2. Find best source to translate from
      const FALLBACK = ['en-US', 'fr-FR', 'es-ES', 'zh-CN', 'ar-SA', 'he-IL'];
      const currentDesc = formData.description || '';
      const parsed = parseTitle(currentDesc); // parseTitle works for both titles and descriptions structured in the same way

      let sourceText = '';
      if (typeof parsed === 'string') {
        sourceText = parsed;
      } else {
        const sourceLang = FALLBACK.find(
          (l) => l !== selectedLocale && !!parsed[l]
        );
        sourceText = sourceLang ? parsed[sourceLang] : '';
      }

      if (!sourceText) {
        alert(t('admin-products-ai-no-source'));
        return;
      }

      // 3. Target language name
      const targetLangName =
        availableLanguages.find((l) => l.code === selectedLocale)?.nativeName ?? selectedLocale;

      // 4. Translate HTML content
      const result = await translateWithAi(sourceText, targetLangName, params, true);
      if (!result.success) throw new Error(result.error ?? 'Translation failed');

      if (result.content) {
        const translated = result.content.trim();
        setFormData((prev) => ({
          ...prev,
          descriptionValue: translated,
        }));
        const updated = mergeLocale(formData.description, selectedLocale, translated);
        setFormData((prev) => ({
          ...prev,
          description: updated,
        }));
      }
    } catch (err) {
      console.error('AI description translation failed', err);
      alert(t('admin-products-ai-error'));
    } finally {
      setIsTranslatingDesc(false);
    }
  };

  const handleSubmit = () => {
    // Ensure current locale changes are merged before submitting
    const mergedName = mergeTitleLocale(formData.name, selectedLocale, formData.nameValue);
    const mergedDesc = mergeLocale(formData.description, selectedLocale, formData.descriptionValue);
    
    onSubmit({
      handle: formData.handle,
      name: mergedName,
      description: mergedDesc === '' ? undefined : mergedDesc,
      position: parseInt(formData.position, 10),
      parent_id: formData.parent_id === '' ? undefined : formData.parent_id,
      image_url: formData.image_url === '' ? undefined : formData.image_url,
      status: formData.status,
    });
  };

  const parentCategoryOptions = allCategories.filter(
    (c) => c.id !== category?.id
  );

  const isFormValid = formData.handle !== '' && formData.nameValue !== '';

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="max-w-2xl">
            <Modal.Header className="flex flex-col gap-1">
              <Modal.Heading>
                {category ? t('edit-category') : t('create-category')}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="gap-4">
              {/* Locale selector */}
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                <Select
                  key="locale_select"
                  selectedKey={selectedLocale || null}
                  onSelectionChange={(key) =>
                    setSelectedLocale(key ? String(key) : defaultLocale)
                  }
                  isDisabled={isLoading}
                  className="w-48"
                >
                  <Label>{t('language')}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {availableLanguages.map((lang) => (
                        <ListBox.Item
                          id={lang.code}
                          key={lang.code}
                          textValue={lang.nativeName}
                        >
                          {lang.nativeName}
                          <ListBoxItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{t('handle')}</label>
                <Input
                  placeholder="t-shirts"
                  value={formData.handle}
                  onChange={(e) =>
                    setFormData({ ...formData, handle: e.target.value })
                  }
                  disabled={isLoading || !!category}
                />
                <p className="text-xs text-gray-500">
                  {t('category-handle-help')}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    {t('name')} <span className="text-red-500">*</span>
                  </label>
                  {canUseAi && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="tertiary"
                      isDisabled={isLoading || isTranslatingName}
                      isPending={isTranslatingName}
                      onPress={handleTranslateName}
                    >
                      <Wand2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="T-Shirts"
                  value={formData.nameValue}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onBlur={handleNameBlur}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{t('description')}</label>
                  {canUseAi && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="tertiary"
                      isDisabled={isLoading || isTranslatingDesc}
                      isPending={isTranslatingDesc}
                      onPress={handleTranslateDescription}
                    >
                      <Wand2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <textarea
                  placeholder="Collection of classic t-shirts"
                  value={formData.descriptionValue}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  onBlur={handleDescriptionBlur}
                  disabled={isLoading}
                  className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                  rows={3}
                />
              </div>

              {parentCategoryOptions.length > 0 && (
                <div className="space-y-2">
                  <Select
                    key="parent_select"
                    selectedKey={formData.parent_id || null}
                    onSelectionChange={(key) =>
                      setFormData({
                        ...formData,
                        parent_id: key ? String(key) : '',
                      })
                    }
                    isDisabled={isLoading}
                    className="w-full"
                    placeholder={t('none')}
                  >
                    <Label>{t('parent-category')}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="none" key="" textValue={t('none')}>
                          {t('none')}
                          <ListBoxItemIndicator />
                        </ListBox.Item>
                        {parentCategoryOptions.length > 0 && (
                          <ListBox.Section>
                            <Header>{t('categories')}</Header>
                            {parentCategoryOptions.map((cat) => (
                              <ListBox.Item
                                id={cat.id}
                                key={cat.id}
                                textValue={resolveTitle(cat.name, i18n.language)}
                              >
                                {resolveTitle(cat.name, i18n.language)}
                                <ListBoxItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox.Section>
                        )}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium">{t('image-url')}</label>
                <Input
                  type="url"
                  placeholder="https://example.com/category.jpg"
                  value={formData.image_url}
                  onChange={(e) =>
                    setFormData({ ...formData, image_url: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{t('position')}</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.position}
                  onChange={(e) =>
                    setFormData({ ...formData, position: e.target.value })
                  }
                  disabled={isLoading}
                />
              </div>

              {category && (
                <div className="space-y-2">
                  <Select
                    key="status_select"
                    selectedKey={formData.status || null}
                    onSelectionChange={(key) =>
                      setFormData({
                        ...formData,
                        status: key ? String(key) : 'active',
                      })
                    }
                    isDisabled={isLoading}
                    className="w-full"
                  >
                    <Label>{t('status')}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item
                          id="active"
                          key="active"
                          textValue={t('active')}
                        >
                          {t('active')}
                          <ListBoxItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item
                          id="inactive"
                          key="inactive"
                          textValue={t('inactive')}
                        >
                          {t('inactive')}
                          <ListBoxItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer>
              <Button
                variant="secondary"
                onPress={() => onOpenChange(false)}
                isDisabled={isLoading}
              >
                {t('cancel')}
              </Button>
              <Button
                className="bg-blue-600 text-white hover:bg-blue-700"
                onPress={handleSubmit}
                isDisabled={!isFormValid || isLoading}
              >
                {category ? t('update') : t('create')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/**
 * CategoryAdmin — Main admin component for managing categories
 */
export function CategoryAdmin() {
  const { t, i18n } = useTranslation();
  const { data: categories = [], isLoading } = useCategories();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const [deleteCategory, setDeleteCategory] = useState<Category | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const queryClient = useQueryClient();
  const { postJson, patchJson, deleteJson } = useSecuredApi();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      if (selectedCategory) {
        return patchJson(`${API_BASE}/categories/${selectedCategory.id}`, data);
      } else {
        return postJson(`${API_BASE}/categories`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsModalOpen(false);
      setSelectedCategory(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteJson(`${API_BASE}/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsDeleteOpen(false);
      setDeleteCategory(null);
    },
  });

  const handleCreate = () => {
    setSelectedCategory(null);
    setIsModalOpen(true);
  };

  const handleEdit = (category: Category) => {
    setSelectedCategory(category);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (category: Category) => {
    setDeleteCategory(category);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (deleteCategory) {
      await deleteMutation.mutateAsync(deleteCategory.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t('categories')}</h2>
        <Button
          className="bg-blue-600 text-white hover:bg-blue-700"
          onPress={handleCreate}
          isDisabled={isLoading}
        >
          {t('create-category')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {t('categories-empty')}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableColumn>{t('name')}</TableColumn>
            <TableColumn>{t('handle')}</TableColumn>
            <TableColumn>{t('parent-category')}</TableColumn>
            <TableColumn>{t('status')}</TableColumn>
            <TableColumn className="text-center">{t('actions')}</TableColumn>
          </TableHeader>
          <TableBody>
            {categories.map((category) => {
              const parent = categories.find((c) => c.id === category.parent_id);
              const displayName = resolveTitle(category.name, i18n.language);
              const parentDisplayName = parent
                ? resolveTitle(parent.name, i18n.language)
                : '—';

              return (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{displayName}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {category.handle}
                    </code>
                  </TableCell>
                  <TableCell>{parentDisplayName}</TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      className={
                        category.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-orange-100 text-orange-700'
                      }
                    >
                      {t(category.status)}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => handleEdit(category)}
                        className="text-sm px-2 py-1 hover:bg-gray-100 rounded"
                        title={t('edit')}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteClick(category)}
                        className="text-sm px-2 py-1 hover:bg-red-100 rounded text-red-600"
                        title={t('delete')}
                      >
                        🗑️
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <CategoryFormModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        category={selectedCategory}
        allCategories={categories}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      />

      <DeleteCategoryDialog
        category={deleteCategory}
        open={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirm}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
