import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatIDR(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `Rp ${(amount / 1_000_000_000).toLocaleString("id-ID", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })} M`;
  }
  if (amount >= 1_000_000) {
    return `Rp ${(amount / 1_000_000).toLocaleString("id-ID", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    })} Jt`;
  }
  if (amount >= 100_000) {
    return `Rp ${(amount / 1_000).toLocaleString("id-ID", {
      maximumFractionDigits: 0,
    })} Rb`;
  }
  return `Rp ${amount.toLocaleString("id-ID")}`;
}
