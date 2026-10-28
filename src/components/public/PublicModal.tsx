"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import styles from "./PublicUI.module.css";

type PublicModalProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: React.ComponentPropsWithoutRef<typeof Dialog.Content>["onCloseAutoFocus"];
  contentClassName?: string;
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
};

export function PublicModal({ open, onOpenChange, onCloseAutoFocus, contentClassName = "", trigger, title, description, children }: PublicModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className={styles.modalOverlay} />
        <Dialog.Content className={`${styles.modalContent} ${contentClassName}`} onCloseAutoFocus={onCloseAutoFocus}>
          <div className={styles.modalHead}>
            <div>
              <Dialog.Title className={styles.modalTitle}>{title}</Dialog.Title>
              {description ? <Dialog.Description className={styles.modalDescription}>{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className={styles.iconButton} aria-label="Chiudi finestra">
              <X size={20} aria-hidden />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
