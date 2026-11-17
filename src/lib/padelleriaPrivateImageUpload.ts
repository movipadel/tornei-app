type UploadResult = { error: unknown };

export type PrivateImageStorage = {
  uploadOriginal: (path: string, bytes: Uint8Array, mime: string) => Promise<UploadResult>;
  uploadVariant: (path: string, bytes: Uint8Array) => Promise<UploadResult>;
  removeOriginal: (paths: string[]) => Promise<UploadResult>;
  removeVariants: (paths: string[]) => Promise<UploadResult>;
};

export async function storeAndRegisterPrivateImage(input: {
  storage: PrivateImageStorage;
  originalPath: string;
  originalBytes: Uint8Array;
  originalMime: string;
  variants: Array<{ path: string; bytes: Uint8Array }>;
  register: () => Promise<string>;
  mediaId: string;
  signal?: AbortSignal;
}): Promise<{ id: string; created: boolean; cleanupComplete: boolean }> {
  let originalAttempted = false;
  const variantsAttempted: string[] = [];
  const cleanup = async () => {
    let complete = true;
    // Attempt both removals even if one fails. Paths are unique to this request.
    if (variantsAttempted.length) {
      try { if ((await input.storage.removeVariants(variantsAttempted)).error) complete = false; }
      catch { complete = false; }
    }
    if (originalAttempted) {
      try { if ((await input.storage.removeOriginal([input.originalPath])).error) complete = false; }
      catch { complete = false; }
    }
    return complete;
  };

  let registeredId: string;
  try {
    if (input.signal?.aborted) throw new Error('Upload interrotto');
    originalAttempted = true;
    if ((await input.storage.uploadOriginal(input.originalPath, input.originalBytes, input.originalMime)).error)
      throw new Error('Upload originale non riuscito');
    for (const variant of input.variants) {
      if (input.signal?.aborted) throw new Error('Upload interrotto');
      variantsAttempted.push(variant.path);
      if ((await input.storage.uploadVariant(variant.path, variant.bytes)).error)
        throw new Error('Upload variante non riuscito');
    }
    if (input.signal?.aborted) throw new Error('Upload interrotto');
    registeredId = await input.register();
  } catch (error) {
    const complete = await cleanup();
    if (!complete) throw new Error('Upload non completato e pulizia privata incompleta');
    throw error;
  }
  if (registeredId !== input.mediaId) {
    return { id: registeredId, created: false, cleanupComplete: await cleanup() };
  }
  return { id: registeredId, created: true, cleanupComplete: true };
}
