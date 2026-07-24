import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
]

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
})

export function formatPrice(
  amount: number | null | undefined,
  currency = "USD",
) {
  if (amount == null) return "Price on request";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    // Unknown currency code — fall back to a plain number + code.
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function formatRelativeTime(date: string | Date) {
  const diff = new Date(date).getTime() - Date.now()

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) {
      return relativeTimeFormatter.format(Math.round(diff / ms), unit)
    }
  }

  return "just now"
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}
