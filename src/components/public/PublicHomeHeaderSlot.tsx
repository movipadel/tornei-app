"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function PublicHomeHeaderSlot({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTarget(document.getElementById("public-home-header-slot"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return target ? createPortal(children, target) : null;
}
