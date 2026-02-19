"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** opzionale: className extra sul content */
  contentClassName?: string;
};

/**
 * Mobile: sheet full-height (app-like) con header/footer sticky e body scrollabile
 * Desktop (sm+): dialog centrato classico
 */
export default function ResponsiveSheetDialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
  contentClassName,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={[
          // Desktop: dialog standard
          "sm:max-w-lg sm:rounded-2xl",
          // Mobile: sheet full screen
          "p-0",
          "w-[100vw] max-w-none",
          "h-[100dvh] sm:h-auto",
          "rounded-none sm:rounded-2xl",
          // evita scroll esterno
          "overflow-hidden",
          contentClassName ?? "",
        ].join(" ")}
      >
        {/* Header sticky */}
        <div className="sticky top-0 z-10 bg-white border-b">
          <DialogHeader className="px-5 py-4">
            <DialogTitle className="text-xl font-extrabold">{title}</DialogTitle>
          </DialogHeader>
        </div>

        {/* Body scrollabile */}
        <div
          className="px-5 py-5"
          style={{
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            // prende tutto lo spazio tra header e footer
            flex: 1,
          }}
        >
          {/* wrapper flex: se vuoi, puoi mettere children con sezioni */}
          <div className="flex flex-col gap-4">{children}</div>
        </div>

        {/* Footer sticky (opzionale) */}
        {footer ? (
          <div className="sticky bottom-0 z-10 bg-white border-t px-4 py-4">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
