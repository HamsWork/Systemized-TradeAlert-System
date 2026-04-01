import { formatDistanceToNow } from "date-fns";

export const APP_TIMEZONE = "America/Chicago";

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDateTime(date: string | Date | null | undefined, style: "full" | "short" | "time" = "full"): string {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";

  if (style === "time") {
    return d.toLocaleTimeString("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true });
  }
  if (style === "short") {
    return d.toLocaleString("en-US", { timeZone: APP_TIMEZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  }
  return d.toLocaleString("en-US", { timeZone: APP_TIMEZONE, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatDateTimeFull(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", { timeZone: APP_TIMEZONE });
}
