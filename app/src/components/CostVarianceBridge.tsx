import { useMemo, useState, type ReactNode } from "react";

import { bridgeDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { usePeriod, monthLabel } from "@/lib/period";
import { cn } from "@/lib/utils";
import { fmtUsd, fmtPct } from "@/lib/format";

import { Loading, ErrorState, Chevron } from "./AppShell";
import { PeriodPicker } from "./PeriodPicker";
import { CategoryDrill } from "./CategoryDrill";

function Frame({
  prev,
  cur,
  children,
}: {
  prev: string;
  cur: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="mb-xl flex flex-wrap items-end justify-between gap-m">
        <div>
          <h1 className="font-heading text-[length:var(--text-hero-700)] font-semibold leading-hero-700 text-foreground">
            Cost Bridge
          </h1>
          <p className="mt-xxs text-300 text-muted-foreground">
            What changed and why — {prev} vs {cur}
          </p>
        </div>
        <PeriodPicker />
      </header>
      {children}
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down";
}) {
  const toneClass =
    tone === "up" ? "text-destructive" : tone === "down" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-xl py-l">
      <p className="text-200 text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-xs font-numeric font-semibold text-[length:var(--text-hero-700)] leading-hero-700",
          toneClass
        )}
      >
        {value}
      </p>
      {sub ? <p className={cn("mt-xxs text-100 font-medium", toneClass)}>{sub}</p> : null}
    </div>
  );
}

export function CostVarianceBridge() {
  const { prevYm, currYm, ready } = usePeriod();
  const query = useMemo(
    () => (ready ? bridgeDax(prevYm, currYm) : ""),
    [prevYm, currYm, ready]
  );
  const { data, isLoading, error } = useSemanticModelQuery({ connection: "aca", query });
  const [expanded, setExpanded] = useState<string | null>(null);

  const prevLabel = ready ? monthLabel(prevYm) : "";
  const curLabel = ready ? monthLabel(currYm) : "";

  if (!ready || isLoading)
    return (
      <Frame prev={prevLabel} cur={curLabel}>
        <Loading />
      </Frame>
    );
  if (error || data?.status === "error")
    return (
      <Frame prev={prevLabel} cur={curLabel}>
        <ErrorState message={data?.status === "error" ? data.error.message : error?.message} />
      </Frame>
    );
  if (data?.status !== "success") return null;

  const rows = (data.table.rows as unknown as [string, number, number][]).map(
    ([cat, prev, curr]) => ({
      cat,
      prev: prev ?? 0,
      curr: curr ?? 0,
      delta: (curr ?? 0) - (prev ?? 0),
    })
  );
  const prevTotal = rows.reduce((s, r) => s + r.prev, 0);
  const currTotal = rows.reduce((s, r) => s + r.curr, 0);
  const totalDelta = currTotal - prevTotal;
  const momPct = prevTotal ? totalDelta / prevTotal : 0;

  const sorted = [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = sorted.slice(0, 6);
  const otherDelta = sorted.slice(6).reduce((s, r) => s + r.delta, 0);
  const steps = top.map((r) => ({ label: r.cat, delta: r.delta, drill: true }));
  if (Math.abs(otherDelta) > 0.01)
    steps.push({ label: "Other", delta: otherDelta, drill: false });

  type Seg = {
    label: string;
    from: number;
    to: number;
    kind: "start" | "step" | "end";
    delta?: number;
    drill?: boolean;
  };
  const segs: Seg[] = [{ label: prevLabel, from: 0, to: prevTotal, kind: "start" }];
  let run = prevTotal;
  for (const s of steps) {
    const to = run + s.delta;
    segs.push({
      label: s.label,
      from: Math.min(run, to),
      to: Math.max(run, to),
      kind: "step",
      delta: s.delta,
      drill: s.drill,
    });
    run = to;
  }
  segs.push({ label: curLabel, from: 0, to: currTotal, kind: "end" });
  const scale = Math.max(prevTotal, currTotal, ...segs.map((s) => s.to)) || 1;

  return (
    <Frame prev={prevLabel} cur={curLabel}>
      <div className="mb-xl grid grid-cols-1 gap-l sm:grid-cols-3">
        <Kpi label={`${prevLabel} spend`} value={fmtUsd(prevTotal)} />
        <Kpi label={`${curLabel} spend`} value={fmtUsd(currTotal)} />
        <Kpi
          label="Change"
          value={`${totalDelta >= 0 ? "+" : "−"}${fmtUsd(Math.abs(totalDelta))}`}
          sub={`${totalDelta >= 0 ? "▲" : "▼"} ${fmtPct(Math.abs(momPct))}`}
          tone={totalDelta >= 0 ? "up" : "down"}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-xl">
        <div className="flex flex-col gap-xs">
          {segs.map((s, i) => {
            const color =
              s.kind === "step"
                ? s.delta! >= 0
                  ? "var(--color-destructive)"
                  : "var(--color-success)"
                : "var(--color-primary)";
            const val =
              s.kind === "step"
                ? `${s.delta! >= 0 ? "+" : "−"}${fmtUsd(Math.abs(s.delta!))}`
                : fmtUsd(s.to);
            const isOpen = expanded === s.label;
            const canDrill = s.kind === "step" && s.drill;
            return (
              <div key={i} className="flex flex-col">
                <button
                  type="button"
                  disabled={!canDrill}
                  onClick={() => canDrill && setExpanded(isOpen ? null : s.label)}
                  className={cn(
                    "flex items-center gap-m rounded px-xs py-s text-left",
                    canDrill ? "cursor-pointer hover:bg-secondary" : "cursor-default"
                  )}
                >
                  <span
                    className={cn(
                      "flex w-40 shrink-0 items-center gap-xs truncate text-200",
                      s.kind === "step" ? "text-foreground" : "font-semibold text-foreground"
                    )}
                  >
                    {canDrill ? (
                      <span className="inline-flex w-3 justify-center text-muted-foreground">
                        <Chevron open={isOpen} />
                      </span>
                    ) : (
                      <span aria-hidden className="inline-block w-3" />
                    )}
                    <span className="truncate">{s.label}</span>
                  </span>
                  <div className="relative h-6 flex-1 rounded bg-secondary">
                    <div
                      className="absolute top-0 h-full rounded"
                      style={{
                        left: `${(s.from / scale) * 100}%`,
                        width: `${((s.to - s.from) / scale) * 100}%`,
                        background: color,
                      }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right font-numeric text-200 text-foreground">
                    {val}
                  </span>
                </button>

                {isOpen && canDrill ? (
                  <div className="mb-s ml-6 mt-xs mr-24">
                    <CategoryDrill
                      prevYm={prevYm}
                      currYm={currYm}
                      category={s.label}
                      mode="delta"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-l text-200 text-muted-foreground">
        Click any category to see the services behind it.
      </p>
    </Frame>
  );
}
