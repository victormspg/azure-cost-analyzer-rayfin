/** Formatting helpers for the CFO dashboard (USD, %, quantities). */

export function fmtUsd(n: number, dp = 0): string {
  return (
    "$" +
    Number(n).toLocaleString(undefined, {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    })
  );
}

/** Compact currency: $1.2K, $3.4M. */
export function fmtUsdCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtPct(ratio: number, dp = 1): string {
  return `${(ratio * 100).toFixed(dp)}%`;
}

export function fmtNum(n: number): string {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
