"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useId } from "react";
import styles from "./PublicUI.module.css";

export type PublicSelectOption = { value: string; label: string; disabled?: boolean };

export function PublicSelect({ label, value, options, onValueChange, name }: {
  label: string;
  value: string;
  options: PublicSelectOption[];
  onValueChange: (value: string) => void;
  name?: string;
}) {
  const labelId = useId();
  return <div className={styles.publicSelectField}>
    <span id={labelId} className={styles.label}>{label}</span>
    <Select.Root value={value} onValueChange={onValueChange} name={name}>
      <Select.Trigger className={styles.publicSelectTrigger} aria-labelledby={labelId}>
        <Select.Value />
        <Select.Icon className={styles.publicSelectChevron}><ChevronDown size={18} aria-hidden /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className={styles.publicSelectContent} position="popper" sideOffset={6} collisionPadding={12}>
          <Select.ScrollUpButton className={styles.publicSelectScroll}><ChevronUp size={18} aria-hidden /></Select.ScrollUpButton>
          <Select.Viewport className={styles.publicSelectViewport}>
            {options.map((option) => <Select.Item className={styles.publicSelectItem} value={option.value} disabled={option.disabled} key={option.value}>
              <Select.ItemText>{option.label}</Select.ItemText>
              <Select.ItemIndicator className={styles.publicSelectIndicator}><Check size={17} aria-hidden /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.Viewport>
          <Select.ScrollDownButton className={styles.publicSelectScroll}><ChevronDown size={18} aria-hidden /></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </div>;
}
