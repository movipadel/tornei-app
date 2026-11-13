export type PartnerLogoAnalysis =
  | { kind: "opaque"; color: string }
  | { kind: "transparent" | "fallback"; color: null };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export function analyzePartnerLogoPixels(pixels: Uint8ClampedArray, width: number, height: number): PartnerLogoAnalysis {
  if (width < 3 || height < 3 || pixels.length !== width * height * 4) return { kind: "fallback", color: null };

  // Any visible alpha is kept intact instead of being flattened against a sampled color.
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 250) return { kind: "transparent", color: null };
  }

  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };
  const samples: number[][] = [];
  for (const fraction of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const x = Math.round(fraction * (width - 1));
    const y = Math.round(fraction * (height - 1));
    samples.push(sample(x, 1), sample(x, height - 2), sample(1, y), sample(width - 2, y));
  }

  const center = [0, 1, 2].map((channel) => median(samples.map((pixel) => pixel[channel])));
  const similar = samples.filter((pixel) => pixel.every((value, channel) => Math.abs(value - center[channel]) <= 40));
  if (similar.length < Math.ceil(samples.length * 0.75)) return { kind: "fallback", color: null };

  const color = [0, 1, 2].map((channel) => Math.round(similar.reduce((sum, pixel) => sum + pixel[channel], 0) / similar.length));
  return { kind: "opaque", color: `rgb(${color.join(", ")})` };
}
