import { createHash } from 'node:crypto';
import sharp from 'sharp';
// Native Node TypeScript stripping needs the explicit extension in local tests.
// @ts-expect-error The application TypeScript config disallows extension imports.
import { imageExtension } from './padelleria.ts';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const VARIANT_WIDTHS = [480, 960, 1600] as const;
export const IMAGE_PROFILES = {
  photo: { encoding: 'lossy', quality: 82 },
  poster: { encoding: 'lossy', quality: 90 },
  logo: { encoding: 'lossless', quality: 90 },
} as const;
export type ImageProfile = keyof typeof IMAGE_PROFILES;
export function imageProfileForPadelleriaRole(role: string): ImageProfile {
  if (role === 'cover') return 'poster';
  if (role === 'gallery') return 'photo';
  throw new Error('Ruolo immagine non valido');
}

export type ImageVariant = {
  width: number;
  height: number;
  bytes: number;
  format: 'webp';
  encoding: 'lossy' | 'lossless';
  buffer: Buffer;
};

export type ProcessedImage = {
  extension: 'jpg' | 'png' | 'webp';
  profile: ImageProfile;
  sha256: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceBytes: number;
  variants: ImageVariant[];
};

export async function processPadelleriaImage(
  input: Uint8Array,
  declaredMime: string,
  options: { profile?: ImageProfile; quality?: number; encoding?: 'auto' | 'lossy' | 'lossless'; signal?: AbortSignal } = {},
): Promise<ProcessedImage> {
  if (options.signal?.aborted) throw new Error('Elaborazione immagine interrotta');
  const extension = imageExtension(input, declaredMime);
  const profile = options.profile ?? 'photo';
  if (!Object.hasOwn(IMAGE_PROFILES, profile)) throw new Error('Profilo immagine non valido');
  const quality = options.quality ?? IMAGE_PROFILES[profile].quality;
  if (!Number.isInteger(quality) || quality < 60 || quality > 95) throw new Error('Qualità WebP non valida');
  if (options.encoding && !['auto', 'lossy', 'lossless'].includes(options.encoding)) throw new Error('Codifica WebP non valida');

  let source: sharp.Metadata;
  try {
    source = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' }).metadata();
  } catch {
    throw new Error('Immagine danneggiata o troppo grande');
  }
  if (source.format !== (extension === 'jpg' ? 'jpeg' : extension) || !source.width || !source.height ||
      source.width * source.height > MAX_IMAGE_PIXELS || Math.max(source.width, source.height) > 10_000 ||
      (source.pages ?? 1) !== 1) {
    throw new Error('Formato, dimensioni o animazione immagine non supportati');
  }

  const rotated = [5, 6, 7, 8].includes(source.orientation ?? 1);
  const orientedWidth = rotated ? source.height : source.width;
  // Alpha stays lossless regardless of the filename or content role.
  const requestedEncoding = options.encoding && options.encoding !== 'auto'
    ? options.encoding : IMAGE_PROFILES[profile].encoding;
  const encoding = source.hasAlpha ? 'lossless' : requestedEncoding;
  const variants: ImageVariant[] = [];
  for (const width of [...new Set(VARIANT_WIDTHS.map(target => Math.min(target, orientedWidth)))]) {
    if (options.signal?.aborted) throw new Error('Elaborazione immagine interrotta');
    try {
      const { data, info } = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
        .rotate()
        .resize({ width, withoutEnlargement: true, fit: 'inside' })
        .webp(encoding === 'lossless' ? { lossless: true } : { quality })
        .toBuffer({ resolveWithObject: true });
      if (data.length > MAX_IMAGE_BYTES || info.width > orientedWidth) throw new Error('Variante troppo grande');
      // Keep the original when re-encoding would transfer as many bytes or more.
      if (data.length < input.length) {
        variants.push({ width: info.width, height: info.height, bytes: data.length, format: 'webp', encoding, buffer: data });
      }
      if (options.signal?.aborted) throw new Error('Elaborazione immagine interrotta');
    } catch {
      throw new Error('Elaborazione immagine non riuscita');
    }
  }
  return {
    extension,
    profile,
    sha256: createHash('sha256').update(input).digest('hex'),
    sourceWidth: source.width,
    sourceHeight: source.height,
    sourceBytes: input.length,
    variants,
  };
}
