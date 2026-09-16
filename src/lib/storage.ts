import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Private file storage for statements, leases, and other sensitive documents.
// Uses Vercel Blob (private store) when BLOB_READ_WRITE_TOKEN is set, otherwise
// falls back to local disk so dev, tests, and CI need no cloud accounts.
//
// documents.storage_key records which backend wrote the file via prefix:
//   "blob:<pathname>"  — Vercel Blob private store
//   "disk:<abs path>"  — local disk fallback

export interface FileStorage {
  readonly backend: "blob" | "disk";
  put(key: string, data: Uint8Array, contentType: string): Promise<string>;
  get(storageKey: string): Promise<Uint8Array | null>;
}

const MAX_FILENAME_LENGTH = 120;

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (cleaned.length === 0) return "file";
  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned;
  // Keep the extension when truncating.
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 ? cleaned.slice(dot) : "";
  if (ext.length > 0 && ext.length <= 10) {
    return cleaned.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
  }
  return cleaned.slice(0, MAX_FILENAME_LENGTH);
}

export function buildStorageKey(workspaceId: string, id: string, filename: string): string {
  return `documents/${workspaceId}/${id}-${sanitizeFilename(filename)}`;
}

function diskRoot(): string {
  return process.env.APEX_STORAGE_DIR ?? path.join(process.cwd(), ".data", "files");
}

const diskStorage: FileStorage = {
  backend: "disk",
  async put(key, data) {
    const abs = path.join(diskRoot(), key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data);
    return `disk:${abs}`;
  },
  async get(storageKey) {
    if (!storageKey.startsWith("disk:")) return null;
    const abs = storageKey.slice("disk:".length);
    // Guard against path escape if a key was ever hand-edited. Paths are
    // runtime-dynamic by design (local fallback storage).
    if (
      !path.resolve(/* turbopackIgnore: true */ abs).startsWith(
        path.resolve(/* turbopackIgnore: true */ diskRoot()),
      )
    ) {
      return null;
    }
    try {
      return new Uint8Array(await readFile(abs));
    } catch {
      return null;
    }
  },
};

const blobStorage: FileStorage = {
  backend: "blob",
  async put(key, data, contentType) {
    const { put } = await import("@vercel/blob");
    const blob = await put(key, Buffer.from(data), {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return `blob:${blob.pathname}`;
  },
  async get(storageKey) {
    if (!storageKey.startsWith("blob:")) return null;
    const { get } = await import("@vercel/blob");
    const result = await get(storageKey.slice("blob:".length), { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  },
};

export function getStorage(): FileStorage {
  return process.env.BLOB_READ_WRITE_TOKEN ? blobStorage : diskStorage;
}

// Reads a stored file regardless of which backend wrote it.
export async function readStoredFile(storageKey: string): Promise<Uint8Array | null> {
  if (storageKey.startsWith("blob:")) return blobStorage.get(storageKey);
  if (storageKey.startsWith("disk:")) return diskStorage.get(storageKey);
  return null;
}
