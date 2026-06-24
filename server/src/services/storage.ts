// ============================================================
// OBJECT STORAGE SERVICE — Replit Object Storage wrapper
// Handles file upload, download, and deletion for media assets
// ============================================================

import { Client } from '@replit/object-storage';

let storageClient: Client | null = null;

function getClient(): Client {
  if (!storageClient) {
    storageClient = new Client();
  }
  return storageClient;
}

/**
 * Upload a buffer to Object Storage.
 * Returns the storage key on success.
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  try {
    const client = getClient();
    const result = await client.uploadFromBytes(key, buffer);
    if (!result.ok) {
      return { ok: false, error: result.error?.message || 'Upload failed' };
    }
    return { ok: true, key };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Upload failed' };
  }
}

/**
 * Download a file from Object Storage as a Buffer.
 */
export async function downloadFile(
  key: string,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  try {
    const client = getClient();
    const result = await client.downloadAsBytes(key);
    if (!result.ok) {
      return { ok: false, error: result.error?.message || 'Download failed' };
    }
    return { ok: true, buffer: Buffer.concat(result.value) };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Download failed' };
  }
}

/**
 * Delete a file from Object Storage.
 */
export async function deleteFile(key: string): Promise<boolean> {
  try {
    const client = getClient();
    const result = await client.delete(key);
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * Check if a file exists in Object Storage.
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    const client = getClient();
    const result = await client.exists(key);
    return result.ok && result.value === true;
  } catch {
    return false;
  }
}
