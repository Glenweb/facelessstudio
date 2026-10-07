"use client";

import { clsx } from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-600 disabled:bg-ink-700 disabled:text-ink-400",
  secondary:
    "bg-ink-800 text-ink-100 hover:bg-ink-700 border border-ink-600 disabled:text-ink-500 disabled:bg-ink-850",
  ghost: "text-ink-300 hover:text-ink-100 hover:bg-ink-800 disabled:text-ink-600",
  danger: "bg-bad-500 text-white hover:bg-bad-400 disabled:bg-ink-700 disabled:text-ink-400",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-200">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[12px] text-bad-400">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] text-ink-400">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  "w-full rounded-lg bg-ink-850 border border-ink-600 px-3 text-sm text-ink-100 placeholder:text-ink-500 transition-colors hover:border-ink-500 focus:border-brand-400";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={clsx(CONTROL, "h-10", className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={clsx(CONTROL, "py-2.5 leading-relaxed", className)} />;
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "good" | "warn" | "bad" | "brand";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-ink-800 text-ink-300 border-ink-600",
    good: "bg-good-500/12 text-good-400 border-good-500/30",
    warn: "bg-warn-400/12 text-warn-400 border-warn-400/30",
    bad: "bg-bad-500/12 text-bad-400 border-bad-500/30",
    brand: "bg-brand-500/15 text-brand-300 border-brand-500/35",
  } as const;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = "bad",
  title,
  children,
  action,
}: {
  tone?: "bad" | "warn" | "good" | "info";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    bad: "border-bad-500/35 bg-bad-500/10 text-bad-400",
    warn: "border-warn-400/35 bg-warn-400/10 text-warn-400",
    good: "border-good-500/35 bg-good-500/10 text-good-400",
    info: "border-brand-500/35 bg-brand-500/10 text-brand-300",
  } as const;
  return (
    <div className={clsx("rounded-lg border px-3.5 py-3 text-[13px]", tones[tone])} role="alert">
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-ink-200">{children}</div>
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={clsx("h-2 w-full overflow-hidden rounded-full bg-ink-800", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300 transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel aurora flex flex-col items-center gap-3 px-6 py-14 text-center">
      <h3 className="text-base font-semibold text-ink-100">{title}</h3>
      <p className="max-w-md text-sm text-ink-400">{body}</p>
      {action}
    </div>
  );
}
