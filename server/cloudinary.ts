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

export async function uploadToCloudinary(
  buffer: Buffer,
  folder = "deluxe-trailers"
): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.");
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
  } catch {
    // Non-fatal: log but don't throw
    console.warn("Failed to delete from Cloudinary:", url);
  }
}
