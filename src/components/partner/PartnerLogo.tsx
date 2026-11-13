"use client";
/* eslint-disable @next/next/no-img-element -- Partner logos use signed storage URLs. */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { analyzePartnerLogoPixels } from "@/lib/partnerLogoColor";
import styles from "./PartnerLogo.module.css";

const sampledColors = new Map<string, Promise<string | null>>();

function sampleLogoBackground(src: string): Promise<string | null> {
  const cached = sampledColors.get(src);
  if (cached) return cached;

  const result = new Promise<string | null>((resolve) => {
    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(probe, 0, 0, 32, 32);
        const pixels = context.getImageData(0, 0, 32, 32).data;
        resolve(analyzePartnerLogoPixels(pixels, 32, 32).color);
      } catch {
        // A storage URL without canvas CORS access still displays normally below.
        resolve(null);
      }
    };
    probe.onerror = () => resolve(null);
    probe.src = src;
  });
  sampledColors.set(src, result);
  return result;
}

export function PartnerLogo({ src, alt, variant = "badge", style }: { src: string; alt: string; variant?: "badge" | "hero" | "directory" | "editor"; style?: CSSProperties }) {
  const [sample, setSample] = useState<{ src: string; color: string | null } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const color = sample?.src === src ? sample.color : null;
  const applyBackground = useCallback(() => {
    void sampleLogoBackground(src).then((nextColor) => setSample({ src, color: nextColor }));
  }, [src]);

  // Cached images may finish loading before React attaches the onLoad handler.
  useEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) applyBackground();
  }, [applyBackground]);

  return <div className={`${styles.frame} ${styles[variant]}`} style={{ ...style, backgroundColor: color ?? undefined }}>
    <img ref={imageRef} src={src} alt={alt} loading="lazy" onLoad={applyBackground} />
  </div>;
}
