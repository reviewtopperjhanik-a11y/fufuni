/**
 * Image upload utility supporting 3 storage methods:
 * 1. Base64 local: Small images stored directly in database
 * 2. R2 remote: Large images uploaded to Cloudflare R2 bucket
 * 3. External URL: Direct URL references (Cloudinary, etc.)
 */

export type ImageStorageMethod = "base64" | "r2" | "url";

export interface ImageUploadResult {
  url: string;
  method: ImageStorageMethod;
  key?: string; // R2 key if applicable
}

type PostFormFunction = (url: string, formData: FormData) => Promise<any>;

const BASE64_SIZE_LIMIT = 1024 * 1024; // 1MB for base64 local storage
const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB for file uploads

/**
 * Determines if a file should be stored as base64 or uploaded to R2
 * @param fileSize - Size of the file in bytes
 * @param forceR2 - If true, always use R2 regardless of file size
 */
function getOptimalStorageMethod(
  fileSize: number,
  forceR2 = false,
): ImageStorageMethod {
  if (forceR2) return "r2";

  return fileSize <= BASE64_SIZE_LIMIT ? "base64" : "r2";
}

/**
 * Uploads an image file using the optimal storage method
 * @param file - Image file to upload
 * @param apiBaseUrl - API base URL for R2 uploads
 * @param postForm - Secured API POST function from useSecuredApi() (handles Auth headers)
 * @param forceR2 - If true, always upload to R2 regardless of file size (default: false)
 * @returns Upload result with URL and storage method
 */
export async function uploadImageFile(
  file: File,
  apiBaseUrl: string,
  postForm: PostFormFunction,
  forceR2 = false,
): Promise<ImageUploadResult> {
  // Validate file
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("File must be jpeg, png, webp, or gif");
  }

  if (file.size > FILE_SIZE_LIMIT) {
    throw new Error("File must be under 5MB");
  }

  // Choose storage method based on file size (unless forceR2 is set)
  const method = getOptimalStorageMethod(file.size, forceR2);

  if (method === "base64") {
    return uploadAsBase64(file);
  } else {
    return uploadToR2(file, apiBaseUrl, postForm);
  }
}

/**
 * Uploads image as base64 data URL (for small images < 1MB)
 */
async function uploadAsBase64(file: File): Promise<ImageUploadResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = reader.result as string;

      resolve({
        url: dataUrl,
        method: "base64",
      });
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Uploads image to R2 bucket (for larger images or images that need CDN)
 * Uses secured API function which includes proper Auth headers
 */
async function uploadToR2(
  file: File,
  apiBaseUrl: string,
  postForm: PostFormFunction,
): Promise<ImageUploadResult> {
  const formData = new FormData();

  formData.append("file", file);

  const result = await postForm(`${apiBaseUrl}/v1/images`, formData);

  return {
    url: result.url || `${apiBaseUrl}/v1/images/${result.key}`,
    method: "r2",
    key: result.key,
  };
}

/**
 * Converts a file to base64 for preview/preview purposes
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Validates that a URL is a valid image URL
 */
export function isValidImageUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);

    return (
      urlObj.protocol === "http:" ||
      urlObj.protocol === "https:" ||
      url.startsWith("data:image/")
    );
  } catch {
    return url.startsWith("data:image/");
  }
}

/**
 * Detects image storage method from URL
 */
export function detectImageMethod(url: string): ImageStorageMethod {
  if (url.startsWith("data:image/")) {
    return "base64";
  }
  if (url.includes("/v1/images/")) {
    return "r2";
  }

  return "url";
}

/**
 * Gets size estimate for base64 image
 */
export function estimateBase64Size(dataUrl: string): number {
  // Remove data URL prefix and estimate size
  const base64 = dataUrl.split(",")[1];

  if (!base64) return 0;

  // Account for base64 encoding overhead (~1.33x)
  return Math.ceil((base64.length * 3) / 4);
}
