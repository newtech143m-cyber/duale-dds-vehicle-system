"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { animate, motion, useReducedMotion } from "motion/react";
import { Languages, Loader2 } from "lucide-react";
import { LOCALE_COOKIE, LOCALE_LABELS, LOCALES, type Locale } from "@dds/i18n";
import { Alert, Button, cx } from "./primitives";

export type ActionResult = { ok: boolean; message?: string; tone?: "ok" | "bad" | "warn" } | null;

/** Submit button that shows a pending state. */
export function SubmitButton({ children, pendingLabel, variant, className }: { children: ReactNode; pendingLabel?: string; variant?: "primary" | "secondary" | "danger"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending} className={className}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/**
 * Form bound to a server action returning ActionResult. Shows the translated
 * message the server sends back. Optional confirmation prompt.
 */
export function ActionForm({
  action, children, className, confirmText, resetOnSuccess,
}: {
  action: (prev: ActionResult, data: FormData) => Promise<ActionResult>;
  children: ReactNode; className?: string; confirmText?: string; resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      noValidate={false}
    >
      {state?.message && (
        <div className="mb-4">
          <Alert tone={state.tone ?? (state.ok ? "ok" : "bad")}>{state.message}</Alert>
        </div>
      )}
      {children}
    </form>
  );
}

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-navy-800">
      <Languages className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        value={current}
        aria-label={label}
        className="bg-transparent border border-line rounded-md h-8 px-2 text-sm"
        onChange={(e) => {
          document.cookie = `${LOCALE_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }}
      >
        {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}
      </select>
    </label>
  );
}

/** Count-up number for dashboard tiles (instant when reduced motion is preferred). */
export function AnimatedNumber({ value, format }: { value: number; format?: "int" | "money" }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setDisplay(value); return; }
    const controls = animate(0, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setDisplay(v) });
    return () => controls.stop();
  }, [value, reduce]);
  const text = format === "money"
    ? display.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(display).toLocaleString("en-US");
  return <span className="tabular-nums">{text}</span>;
}

/** Staggered entrance for grids of cards. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : "hidden"}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
    >
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } } }}
    >
      {children}
    </motion.div>
  );
}

export function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      {children}
    </motion.div>
  );
}

export function PrintButton({ label }: { label: string }) {
  return <Button variant="secondary" type="button" onClick={() => window.print()} className="no-print">{label}</Button>;
}

export function Collapsible({ summary, children, defaultOpen }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cx("text-sm font-medium text-teal-700 hover:underline")}>{summary}</button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
