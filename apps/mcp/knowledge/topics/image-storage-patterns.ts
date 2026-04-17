/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 */
import type { Topic } from '../base.js';
import { BASE_SYSTEM, appendFacts } from '../base.js';

const topic: Topic = {
  name: 'image-storage-patterns',
  description: 'Image upload and display — base64-in-SQL vs R2-hosted trade-off, ImageUploadInput component, uploadImageFile utility, and URL resolution.',
  tags: ["cloudflare","frontend","images","react","storage","ui"],
  sources: [
    'apps/client/src/utils/image-upload.ts',
    'apps/client/src/components/image-upload-input.tsx',
  ],
  systemPrompt: BASE_SYSTEM,
  manualFacts: [
    'There are 3 image storage methods: (1) base64 — WebP data URI stored directly in the SQLite column (small images < 1 MB); (2) r2 — uploaded to Cloudflare R2 bucket via POST /v1/images and stored as a URL; (3) url — external URL stored as-is.',
    'ALL uploaded images are converted to WebP (max 1200 px, quality 0.8) before storage. Thumbnails are generated separately at 300 px.',
    'Storage method is chosen automatically by uploadImageFile(): base64 if file < 1 MB after conversion, r2 otherwise. Pass forceR2=true to always use R2.',
    'The 1 MB base64 threshold (BASE64_SIZE_LIMIT) and 5 MB upload limit (FILE_SIZE_LIMIT) are constants in image-upload.ts.',
    'ImageUploadInput is the canonical admin UI for image fields. Props: value (current URL/data-URI), onChange(url), onThumbnailChange(url), apiBaseUrl, disabled, forceR2. postForm can be injected or is picked from useSecuredApi() by default.',
    'isValidImageUrl(url) only allows http(s): and data:image/ protocols. Use it to guard any URL that comes from user input before passing to <img src>.',
    'The R2 upload endpoint POST /v1/images requires admin:store permission and returns { url, key }.',
    'Images served from R2 go through the KV CDN cache layer — DELETE /v1/images/:key purges both R2 and the CDN cache entry.',
  ],
  buildPrompt: (src) => appendFacts(`
Below are the image-upload.ts utility and the ImageUploadInput component.

${src}

Task: Write an "Image Storage Patterns" reference.
Include:
1. The 3 storage methods: base64, r2, external URL — when each is used.
2. The automatic size-based selection logic (thresholds, forceR2 flag).
3. WebP conversion: why it is always applied, quality and max-size parameters.
4. uploadImageFile() signature and usage example (with useSecuredApi().postForm).
5. ImageUploadInput component: props table, complete usage example in an admin form.
6. isValidImageUrl() security guard: what it accepts, when to call it.
7. The R2 backend endpoints (upload, delete, cache purge) and their required permission.
8. How CDN caching interacts with R2 objects and when to purge.
`, topic.manualFacts),
};

export default topic;
