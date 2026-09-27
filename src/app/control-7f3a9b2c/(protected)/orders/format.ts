export type Tone = "success" | "neutral" | "danger" | "warning";

export function paymentTone(state: string): Tone {
  if (state === "paid") return "success";
  if (state === "failed" || state === "refunded") return "danger";
  if (state === "pending" || state === "partially_refunded") return "warning";
  return "neutral";
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const min = Math.floor((Date.now() - then) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
