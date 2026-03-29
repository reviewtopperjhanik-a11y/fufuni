/**
 * ImageUploadInput — Reusable component for managing image uploads
 * Supports 3 storage methods: base64 local, R2 remote, external URL
 */

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Chip } from '@heroui/react';
import { Upload, X, AlertCircle } from 'lucide-react';
import {
  uploadImageFile,
  isValidImageUrl,
  detectImageMethod,
  estimateBase64Size,
} from '@/utils/image-upload';
import { convertToWebp, blobToBase64, IMAGE_SIZE_THRESHOLD } from '@/utils/image-utils';
import { useSecuredApi } from '@/authentication';

export interface ImageUploadInputProps {
  value: string | null;
  onChange: (url: string | null) => void;
  onThumbnailChange?: (url: string | null) => void;
  disabled?: boolean;
  apiBaseUrl: string;
  forceR2?: boolean;
  postForm?: (url: string, formData: FormData) => Promise<any>;
}

export function ImageUploadInput({
  value,
  onChange,
  onThumbnailChange,
  disabled = false,
  apiBaseUrl,
  forceR2 = false,
  postForm: postFormProp,
}: ImageUploadInputProps) {
  const { t } = useTranslation();
  const { postForm: postFormFromHook } = useSecuredApi();
  const postForm = postFormProp || postFormFromHook;
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualUrlMode, setManualUrlMode] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [useR2, setUseR2] = useState(forceR2);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storageMethod = value ? detectImageMethod(value) : null;
  const isBase64 = storageMethod === 'base64';
  const sizeEstimate = isBase64 ? estimateBase64Size(value || '') : 0;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);

    try {
      // Convert to WebP (1200px max) and apply storage rule
      const webpBlob = await convertToWebp(file, 1200, 0.8);
      const webpFile = new File(
        [webpBlob],
        file.name.replace(/\.[^.]+$/, '.webp'),
        { type: 'image/webp' },
      );
      const result = await uploadImageFile(
        webpFile,
        apiBaseUrl,
        postForm,
        useR2 || webpBlob.size >= IMAGE_SIZE_THRESHOLD,
      );
      onChange(result.url);

      // Generate thumbnail (300px WebP — always fits in base64)
      if (onThumbnailChange) {
        const thumbBlob = await convertToWebp(file, 300, 0.8);
        onThumbnailChange(await blobToBase64(thumbBlob));
      }

      setManualUrlMode(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to upload image';
      setError(message);
      console.error('Image upload error:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleManualUrl = () => {
    if (!manualUrl.trim()) {
      return;
    }

    if (!isValidImageUrl(manualUrl)) {
      setError('Invalid image URL. Must be http(s) or data URL');
      return;
    }

    onChange(manualUrl.trim());
    setManualUrl('');
    setManualUrlMode(false);
    setError(null);
  };

  const handleRemove = () => {
    onChange(null);
    setError(null);
    setManualUrl('');
    setManualUrlMode(false);
  };

  const getStorageLabel = (): string => {
    switch (storageMethod) {
      case 'base64':
        return `Local (${Math.round(sizeEstimate / 1024)}KB)`;
      case 'r2':
        return 'R2 Cloud';
      case 'url':
        return 'External URL';
      default:
        return 'No image';
    }
  };

  return (
    <div className="space-y-3">
      {/* Image preview */}
      {value && (
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <img
              src={value}
              alt="Preview"
              className="w-24 h-24 object-cover rounded border border-default-200"
            />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Chip
                size="sm"
                variant="soft"
                color={
                  storageMethod === 'base64'
                    ? 'accent'
                    : storageMethod === 'r2'
                      ? 'success'
                      : 'default'
                }
              >
                {getStorageLabel()}
              </Chip>
            </div>
            <p className="text-xs text-default-500 mb-2">
              {storageMethod === 'base64'
                ? t('admin-image-storage-local')
                : storageMethod === 'r2'
                  ? t('admin-image-storage-r2')
                  : t('admin-image-storage-url')}
            </p>
            <Button
              size="sm"
              isIconOnly
              variant="ghost"
              className="text-red-600"
              onPress={handleRemove}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 rounded border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Upload controls */}
      <div className="space-y-2">
        {!manualUrlMode ? (
          <>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={isUploading || disabled}
                  className="hidden"
                />
                <Button
                  className="w-full"
                  variant="outline"
                  isDisabled={isUploading || disabled}
                  onPress={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                  {isUploading
                    ? t('admin-image-uploading')
                    : t('admin-image-upload-btn')}
                </Button>
              </div>
              <Button
                variant="outline"
                isDisabled={disabled}
                onPress={() => setManualUrlMode(true)}
              >
                {t('admin-image-url-btn')}
              </Button>
            </div>

            {/* R2 Storage Toggle - Only show if not forced to R2 */}
            {!forceR2 && (
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-default-100">
                <input
                  type="checkbox"
                  checked={useR2}
                  onChange={(e) => setUseR2(e.target.checked)}
                  disabled={disabled}
                  className="w-4 h-4 rounded"
                />
                <span className="text-xs text-default-600">
                  {t('admin-image-force-r2')}
                </span>
              </label>
            )}

            <p className="text-xs text-default-500">
              {t('admin-image-upload-hint')}
            </p>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                placeholder={t('admin-image-url-placeholder')}
                value={manualUrl}
                onChange={(e) => {
                  setManualUrl(e.target.value);
                  setError(null);
                }}
                disabled={disabled}
              />
              <Button
                variant="primary"
                isDisabled={!manualUrl.trim() || disabled}
                onPress={handleManualUrl}
              >
                {t('save')}
              </Button>
              <Button
                variant="outline"
                isDisabled={disabled}
                onPress={() => {
                  setManualUrlMode(false);
                  setManualUrl('');
                  setError(null);
                }}
              >
                {t('cancel')}
              </Button>
            </div>
            <p className="text-xs text-default-500">
              {t('admin-image-url-hint')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
