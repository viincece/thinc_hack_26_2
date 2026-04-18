import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

export function imageUrl(relPath?: string | null) {
  if (!relPath) return null;
  const base =
    process.env.NEXT_PUBLIC_MANEX_IMAGE_BASE ?? "http://34.89.205.150:9000";
  return `${base}${relPath.startsWith("/") ? "" : "/"}${relPath}`;
}
