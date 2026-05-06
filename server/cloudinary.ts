import { v2 as cloudinary } from "cloudinary";

export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_SIGNATURES: Record<string, string> = {
  "ffd8ff": "image/jpeg",
  "89504e47": "image/png",
  "52494646": "image/webp", // RIFF header (WebP)
};

function detectMimeType(buffer: Buffer): string | null {
  const hex = buffer.subarray(0, 4).toString("hex");
  for (const [sig, mime] of Object.entries(ALLOWED_IMAGE_SIGNATURES)) {
    if (hex.startsWith(sig)) return mime;
  }
  return null;
}

export async function uploadToCloudinary(
  buffer: Buffer,
  folder = "deluxe-trailers"
): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.");
  }
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`File too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`);
  }
  if (!detectMimeType(buffer)) {
    throw new Error("Unsupported file type. Only JPEG, PNG, and WebP images are allowed.");
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: "image" }, (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("No result from Cloudinary"));
        resolve(result.secure_url);
      })
      .end(buffer);
  });
}

export async function uploadRawToCloudinary(
  buffer: Buffer,
  folder = "deluxe-agreements",
  publicId?: string
): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured.");
  }
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder, resource_type: "raw", ...(publicId ? { public_id: publicId } : {}) },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error("No result from Cloudinary"));
          resolve(result.secure_url);
        }
      )
      .end(buffer);
  });
}

export async function deleteFromCloudinary(url: string): Promise<void> {
  if (!isCloudinaryConfigured()) return;
  try {
    // Extract public_id from URL (everything after upload/ and before extension)
    const match = url.match(/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    if (match) {
      await cloudinary.uploader.destroy(match[1]);
    }
  } catch (err) {
    console.error("[cloudinary] Failed to delete:", url, err instanceof Error ? err.message : err);
  }
}
