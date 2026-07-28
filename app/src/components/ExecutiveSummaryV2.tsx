import { useMemo, useState } from "react";

import { monthlyKpisDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { monthLabel } from "@/lib/period";
import { cn } from "@/lib/utils";
import { fmtUsd, fmtPct, fmtNum } from "@/lib/format";

import { ViewHeader, Loading, ErrorState } from "./AppShell";

type Row = {
  ym: string;
  cost: number;
  untagged: number;
  savings: number;
  savingsAmt: number;
  resources: number;
  momAbs: number;
  momPct: number;
};

type SortCol = "month" | "cost" | "momAbs" | "momPct" | "resources" | "untagged" | "savings";

function Kpi({ label, value, caption, tone }: { label: string; value: string; caption: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border border-t-2 border-t-primary bg-card px-xl py-l shadow-sm">
      <p className="text-200 font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-s font-numeric font-semibold text-[length:var(--text-hero-700)] leading-hero-700", tone ?? "text-foreground")}>
        {value}
      </p>
      <p className="mt-xxs truncate text-100 text-muted-foreground" title={caption}>
        {caption}
      </p>
    </div>
  );
}

export function ExecutiveSummaryV2() {
  const query = useMemo(() => monthlyKpisDax(), []);
  const { data, isLoading, error } = useSemanticModelQuery({ connection: "aca", query });
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "month", dir: "desc" });
  const [hoverYm, setHoverYm] = useState<string | null>(null);

  const header = (
    <ViewHeader title="Executive Summary" subtitle="Trailing 12-month scorecard — spend, growth, tagging and savings by month" />
  );

  if (isLoading)
    return (
      <>
        {header}
        <Loading />
      </>
    );
  if (error || data?.status === "error")
    return (
      <>
        {header}
        <ErrorState message={data?.status === "error" ? data.error.message : error?.message} />
      </>
    );
  if (data?.status !== "success") return null;

  const all = (data.table.rows as unknown as [string, number, number, number, number, number][])
    .map(([ym, cost, untagged, savings, savingsAmt, resources]) => ({
      ym,
      cost: cost ?? 0,
      untagged: untagged ?? 0,
      savings: savings ?? 0,
      savingsAmt: savingsAmt ?? 0,
      resources: resources ?? 0,
    }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  const rows: Row[] = all.map((r, i) => {
    const prev = i > 0 ? all[i - 1].cost : 0;
    return {
      ...r,
      momAbs: i > 0 ? r.cost - prev : 0,
      momPct: i > 0 && prev ? (r.cost - prev) / prev : 0,
    };
  });

  const last12 = rows.slice(-12);
  const totalSpend = last12.reduce((s, r) => s + r.cost, 0);
  const avg = last12.length ? totalSpend / last12.length : 0;
  const nowYm = new Date().toISOString().slice(0, 7);
  const lastComplete = [...last12].reverse().find((r) => r.ym < nowYm) ?? last12[last12.length - 1];
  const latest = last12[last12.length - 1];
  const peak = last12.reduce((m, r) => (r.cost > m.cost ? r : m), last12[0]);

  const dirMul = sort.dir === "asc" ? 1 : -1;
  const sorted = [...last12].sort((a, b) => {
    switch (sort.col) {
      case "month":
        return a.ym.localeCompare(b.ym) * dirMul;
      case "cost":
        return (a.cost - b.cost) * dirMul;
      case "momAbs":
        return (a.momAbs - b.momAbs) * dirMul;
      case "momPct":
        return (a.momPct - b.momPct) * dirMul;
      case "resources":
        return (a.resources - b.resources) * dirMul;
      case "untagged":
        return (a.untagged - b.untagged) * dirMul;
      case "savings":
        return (a.savings - b.savings) * dirMul;
      default:
        return 0;
    }
  });

  const clickSort = (col: SortCol) =>
    setSort((s) => (s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" }));

  const Th = ({ col, label, align = "right" }: { col: SortCol; label: string; align?: "left" | "right" }) => (
    <th className={cn("px-l py-s font-semibold", align === "left" ? "text-left" : "text-right")}>
      <button
        type="button"
        onClick={() => clickSort(col)}
        className={cn("inline-flex items-center gap-xs hover:text-foreground", align === "right" && "flex-row-reverse")}
      >
        {label}
        <span className="text-muted-foreground">{sort.col === col ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <>
      {header}

      <div className="mb-xl grid grid-cols-2 gap-l lg:grid-cols-6">
        <Kpi label={`Spend · ${last12.length} Months`} value={fmtUsd(totalSpend, 0)} caption="Trailing total" />
        <Kpi label="Avg / Month" value={fmtUsd(avg, 0)} caption="Trailing average" />
        <Kpi
          label="Latest MoM"
          value={`${lastComplete.momPct >= 0 ? "+" : "−"}${fmtPct(Math.abs(lastComplete.momPct))}`}
          caption={`${monthLabel(lastComplete.ym)} vs prior`}
          tone={lastComplete.momPct >= 0 ? "text-destructive" : "text-success"}
        />
        <Kpi
          label="Untagged"
          value={fmtPct(latest.untagged)}
          caption={`Current month (${monthLabel(latest.ym)})`}
          tone={latest.untagged > 0.1 ? "text-warning" : "text-success"}
        />
        <Kpi
          label="Resources"
          value={fmtNum(latest.resources)}
          caption={`Current month (${monthLabel(latest.ym)})`}
        />
        <Kpi label="Peak Month" value={fmtUsd(peak.cost, 0)} caption={monthLabel(peak.ym)} tone="text-destructive" />
      </div>

      {(() => {
        const bars = last12;
        const W = 1000, H = 260, padX = 16, padTop = 30, padBottom = 38;
        const maxC = Math.max(1, ...bars.map((b) => b.cost));
        const n = bars.length;
        const slot = (W - 2 * padX) / Math.max(1, n);
        const bw = Math.min(54, slot * 0.6);
        const bx = (i: number) => padX + slot * i + (slot - bw) / 2;
        const bh = (c: number) => (c / maxC) * (H - padTop - padBottom);
        const baseY = H - padBottom;
        const short = (c: number) => `$${Math.round(c / 1000)}k`;
        const hovered = bars.find((b) => b.ym === hoverYm) ?? null;
        // Light gridlines at 25/50/75/100% of the max for a richer, easier-to-read chart.
        const gridVals = [0.25, 0.5, 0.75, 1].map((f) => f * maxC);
        return (
          <div className="mb-xl rounded-lg border border-border bg-card p-l">
            <div className="mb-s flex items-baseline justify-between">
              <h3 className="text-300 font-semibold text-foreground">Monthly spend</h3>
              <span className="text-100 text-muted-foreground">trailing {n} months</span>
            </div>
            <div className="text-foreground">
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="aca-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.55" />
                  </linearGradient>
                </defs>
                {gridVals.map((gv) => {
                  const gy = baseY - bh(gv);
                  return (
                    <g key={gv}>
                      <line x1={padX} y1={gy} x2={W - padX} y2={gy} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
                      <text x={W - padX} y={gy - 3} textAnchor="end" fontSize="9" fill="var(--color-muted-foreground)">{short(gv)}</text>
                    </g>
                  );
                })}
                <line x1={padX} y1={baseY} x2={W - padX} y2={baseY} stroke="var(--color-border)" strokeWidth="1.5" />
                {bars.map((b, i) => {
                  const y = baseY - bh(b.cost);
                  const active = hoverYm === null || hoverYm === b.ym;
                  return (
                    <g
                      key={b.ym}
                      onMouseEnter={() => setHoverYm(b.ym)}
                      onMouseLeave={() => setHoverYm(null)}
                      style={{ cursor: "default" }}
                    >
                      <rect x={bx(i) - 3} y={padTop - 6} width={bw + 6} height={baseY - padTop + 6} fill="transparent" />
                      <rect
                        x={bx(i)}
                        y={y}
                        width={bw}
                        height={bh(b.cost)}
                        rx={4}
                        fill="url(#aca-bar)"
                        opacity={active ? 1 : 0.4}
                        style={{ transition: "opacity 120ms ease" }}
                      />
                      <text x={bx(i) + bw / 2} y={y - 7} textAnchor="middle" fontSize="11" fontWeight={hoverYm === b.ym ? 700 : 500} fill="currentColor">
                        {short(b.cost)}
                      </text>
                      <text x={bx(i) + bw / 2} y={H - 14} textAnchor="middle" fontSize="10" fill="var(--color-muted-foreground)">
                        {monthLabel(b.ym)}
                      </text>
                    </g>
                  );
                })}
                {hovered && (() => {
                  const i = bars.findIndex((b) => b.ym === hovered.ym);
                  const cx = bx(i) + bw / 2;
                  const barY = baseY - bh(hovered.cost);
                  const boxW = 152, boxH = 42;
                  const tx = Math.max(padX, Math.min(cx - boxW / 2, W - padX - boxW));
                  const ty = Math.max(2, barY - boxH - 10);
                  const mom = hovered.momPct;
                  return (
                    <g pointerEvents="none">
                      <rect x={tx} y={ty} width={boxW} height={boxH} rx={6} fill="var(--color-card)" stroke="var(--color-border)" />
                      <text x={tx + 12} y={ty + 17} fontSize="11" fontWeight="700" fill="currentColor">{monthLabel(hovered.ym)}</text>
                      <text x={tx + 12} y={ty + 33} fontSize="11" fill="var(--color-muted-foreground)">
                        {fmtUsd(hovered.cost, 0)}
                        {mom ? `  ·  ${mom >= 0 ? "+" : "−"}${fmtPct(Math.abs(mom))} MoM` : ""}
                      </text>
                    </g>
                  );
                })()}
              </svg>
            </div>
          </div>
        );
      })()}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-secondary/50 px-l py-m">
          <h3 className="text-300 font-semibold text-foreground">Monthly scorecard</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-200">
            <thead>
              <tr className="border-b border-border text-100 uppercase tracking-wide text-muted-foreground">
                <Th col="month" label="Month" align="left" />
                <Th col="cost" label="Spend" />
                <Th col="momAbs" label="MoM Δ" />
                <Th col="momPct" label="MoM %" />
                <Th col="resources" label="Resources" />
                <Th col="untagged" label="Untagged" />
                <Th col="savings" label="Savings" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.ym} className="border-b border-border/60">
                  <td className="px-l py-s font-medium text-foreground">{monthLabel(r.ym)}</td>
                  <td className="px-l py-s text-right font-numeric text-foreground">{fmtUsd(r.cost, 0)}</td>
                  <td className={cn("px-l py-s text-right font-numeric", r.momAbs > 0 ? "text-destructive" : r.momAbs < 0 ? "text-success" : "text-muted-foreground")}>
                    {r.momAbs === 0 ? "—" : `${r.momAbs > 0 ? "+" : "−"}${fmtUsd(Math.abs(r.momAbs), 0)}`}
                  </td>
                  <td className={cn("px-l py-s text-right font-numeric", r.momPct > 0 ? "text-destructive" : r.momPct < 0 ? "text-success" : "text-muted-foreground")}>
                    {r.momAbs === 0 ? "—" : `${r.momPct >= 0 ? "+" : "−"}${fmtPct(Math.abs(r.momPct))}`}
                  </td>
                  <td className="px-l py-s text-right font-numeric text-foreground">{fmtNum(r.resources)}</td>
                  <td className={cn("px-l py-s text-right font-numeric", r.untagged > 0.1 ? "text-warning" : "text-success")}>
                    {fmtPct(r.untagged)}
                  </td>
                  <td className="px-l py-s text-right font-numeric text-foreground">{fmtPct(r.savings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-m text-100 text-muted-foreground">
        Untagged % should trend down as governance improves · Resources shows fleet growth · Savings % = effective vs list price.
      </p>
    </>
  );
}
