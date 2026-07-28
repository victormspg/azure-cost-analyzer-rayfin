import { useMemo, useState, type ReactNode } from "react";

import { priceVolumeDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { usePeriod, monthLabel } from "@/lib/period";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/format";

import { Loading, ErrorState, Chevron } from "./AppShell";
import { PeriodPicker } from "./PeriodPicker";
import { CategoryDrill } from "./CategoryDrill";

function Frame({ prev, cur, children }: { prev: string; cur: string; children: ReactNode }) {
  return (
    <>
      <header className="mb-xl flex flex-wrap items-end justify-between gap-m">
        <div>
          <h1 className="font-heading text-[length:var(--text-hero-700)] font-semibold leading-hero-700 text-foreground">
            Price vs Volume
          </h1>
          <p className="mt-xxs text-300 text-muted-foreground">
            Was the change driven by usage or by rate? — {prev} vs {cur}
          </p>
        </div>
        <PeriodPicker />
      </header>
      {children}
    </>
  );
}

function EffectBar({ label, value, scale }: { label: string; value: number; scale: number }) {
  const pct = scale > 0 ? (Math.abs(value) / scale) * 100 : 0;
  const color = value >= 0 ? "var(--color-destructive)" : "var(--color-success)";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-100 font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="font-numeric text-200 font-semibold text-foreground">
          {value >= 0 ? "+" : "−"}
          {fmtUsd(Math.abs(value))}
        </span>
      </div>
      <div className="mt-xxs h-2 rounded bg-secondary">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function PriceVolume() {
  const { prevYm, currYm, ready } = usePeriod();
  const query = useMemo(
    () => (ready ? priceVolumeDax(prevYm, currYm) : ""),
    [prevYm, currYm, ready]
  );
  const { data, isLoading, error } = useSemanticModelQuery({ connection: "aca", query });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [show, setShow] = useState<"both" | "usage" | "rate">("both");

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

  const movers = (data.table.rows as unknown as [string, number, number, number, number][])
    .map(([cat, prevCost, currCost, prevQty, currQty]) => {
      const pc = prevCost ?? 0;
      const cc = currCost ?? 0;
      const pq = prevQty ?? 0;
      const cq = currQty ?? 0;
      const prevPrice = pq ? pc / pq : 0;
      const currPrice = cq ? cc / cq : 0;
      const usage = (cq - pq) * prevPrice; // volume effect
      const rate = (currPrice - prevPrice) * cq; // rate effect
      return { cat, delta: cc - pc, usage, rate };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6);

  const totalUsage = movers.reduce((s, m) => s + m.usage, 0);
  const totalRate = movers.reduce((s, m) => s + m.rate, 0);
  const totalDelta = movers.reduce((s, m) => s + m.delta, 0);
  const scale = Math.max(1, ...movers.flatMap((m) => [Math.abs(m.usage), Math.abs(m.rate)]));

  return (
    <Frame prev={prevLabel} cur={curLabel}>
      <div className="mb-l flex items-center gap-s">
        <span className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">Show</span>
        <div className="inline-flex rounded-lg border border-border bg-card p-xxs">
          {([
            ["both", "Both"],
            ["usage", "Usage"],
            ["rate", "Rate"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setShow(k)}
              className={cn(
                "rounded-md px-l py-s-nudge text-200 font-medium transition-colors",
                show === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-xl rounded-lg border border-border bg-card px-xl py-l">
        <p className="text-300 text-foreground">
          Of the{" "}
          <span className="font-semibold">
            {totalDelta >= 0 ? "+" : "−"}
            {fmtUsd(Math.abs(totalDelta))}
          </span>{" "}
          change
          {show !== "rate" ? (
            <>
              ,{" "}
              <span className="font-semibold text-destructive">
                {totalUsage >= 0 ? "+" : "−"}
                {fmtUsd(Math.abs(totalUsage))}
              </span>{" "}
              came from <span className="font-medium">usage</span>
            </>
          ) : null}
          {show === "both" ? " and " : null}
          {show !== "usage" ? (
            <>
              {show === "rate" ? ", " : ""}
              <span className="font-semibold text-destructive">
                {totalRate >= 0 ? "+" : "−"}
                {fmtUsd(Math.abs(totalRate))}
              </span>{" "}
              from <span className="font-medium">rate</span>
            </>
          ) : null}
          .
        </p>
      </div>

      <div className="grid grid-cols-1 gap-l md:grid-cols-2">
        {movers.map((m) => {
          const isOpen = expanded === m.cat;
          return (
            <div key={m.cat} className="rounded-lg border border-border bg-card p-l">
              <div className="flex items-baseline justify-between">
                <span className="text-300 font-semibold text-foreground">{m.cat}</span>
                <span
                  className={cn(
                    "font-numeric text-500 font-semibold",
                    m.delta >= 0 ? "text-destructive" : "text-success"
                  )}
                >
                  {m.delta >= 0 ? "+" : "−"}
                  {fmtUsd(Math.abs(m.delta))}
                </span>
              </div>
              <div className={cn("mt-m grid gap-l", show === "both" ? "grid-cols-2" : "grid-cols-1")}>
                {show !== "rate" ? <EffectBar label="Usage" value={m.usage} scale={scale} /> : null}
                {show !== "usage" ? <EffectBar label="Rate" value={m.rate} scale={scale} /> : null}
              </div>

              {isOpen ? (
                <div className="mt-l">
                  <CategoryDrill
                    prevYm={prevYm}
                    currYm={currYm}
                    category={m.cat}
                    mode="pricevolume"
                  />
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : m.cat)}
                className="mt-m flex w-full items-center justify-center gap-xs rounded-md border border-border py-s-nudge text-100 font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {isOpen ? "Hide services" : "Break down by service"}
                <Chevron open={isOpen} />
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-l text-200 text-muted-foreground">
        Usage = you consumed more or less. Rate = the blended unit price moved (often a shift to
        pricier resources). Red = cost went up, green = cost went down.{" "}
        <span className="text-foreground">Click any service group to break it down.</span>
      </p>
    </Frame>
  );
}
