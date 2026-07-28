import { useEffect, useMemo, useRef, useState } from "react";

import { execKpiMonthsDax, topServicesMonthsDax, topCategoriesMonthsDax, topRegionsMonthsDax, monthlyTrendDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { monthLabel } from "@/lib/period";
import { cn } from "@/lib/utils";
import { fmtUsd, fmtPct } from "@/lib/format";

import { ViewHeader, Loading, ErrorState } from "./AppShell";

function Kpi({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border border-t-2 border-t-primary bg-card px-xl py-l shadow-sm">
      <p className="text-200 font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-s font-numeric font-semibold text-[length:var(--text-hero-800)] leading-hero-800",
          tone ?? "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-xxs truncate text-100 text-muted-foreground" title={caption}>
        {caption}
      </p>
    </div>
  );
}

function MiniBars({
  title,
  rows,
  max,
  accent,
}: {
  title: string;
  rows: { label: string; cost: number }[];
  max: number;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-xl">
      <h3 className="mb-l text-300 font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-100 text-muted-foreground">No data.</p>
      ) : (
        <div className="flex flex-col gap-m">
          {rows.map((r, i) => (
            <div key={r.label} className="flex flex-col gap-xxs">
              <div className="flex items-baseline justify-between gap-s">
                <span className="truncate text-200 text-foreground" title={r.label}>
                  {r.label}
                </span>
                <span className="shrink-0 font-numeric text-200 text-muted-foreground">
                  {fmtUsd(r.cost, 0)}
                </span>
              </div>
              <div className="h-2 rounded bg-secondary">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${(r.cost / max) * 100}%`,
                    background: i === 0 ? accent : "color-mix(in srgb, " + accent + " 55%, transparent)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExecutiveSummary() {
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const initRef = useRef(false);

  const trendQuery = useMemo(() => monthlyTrendDax(selectedService), [selectedService]);
  const trendQ = useSemanticModelQuery({ connection: "aca", query: trendQuery });

  const nowYm = new Date().toISOString().slice(0, 7);
  const trend = useMemo(
    () =>
      trendQ.data?.status === "success"
        ? (trendQ.data.table.rows as unknown as [string, number][]).map(([ym, c]) => ({
            ym,
            cost: c ?? 0,
            partial: ym >= nowYm,
          }))
        : [],
    [trendQ.data, nowYm]
  );
  const complete = useMemo(() => trend.filter((t) => !t.partial), [trend]);

  // Default the selection to the latest complete month, once.
  useEffect(() => {
    if (initRef.current || complete.length === 0) return;
    setSelected([complete[complete.length - 1].ym]);
    initRef.current = true;
  }, [complete]);

  const kpiQuery = useMemo(
    () => execKpiMonthsDax(selected, selectedService),
    [selected, selectedService]
  );
  const kpiQ = useSemanticModelQuery({ connection: "aca", query: kpiQuery });
  const svcQuery = useMemo(() => topServicesMonthsDax(selected), [selected]);
  const svcQ = useSemanticModelQuery({ connection: "aca", query: svcQuery });
  const catQuery = useMemo(() => topCategoriesMonthsDax(selected), [selected]);
  const catQ = useSemanticModelQuery({ connection: "aca", query: catQuery });
  const regQuery = useMemo(() => topRegionsMonthsDax(selected), [selected]);
  const regQ = useSemanticModelQuery({ connection: "aca", query: regQuery });

  const header = <ViewHeader title="Executive Summary" subtitle="Your Azure cost posture at a glance" />;

  if (trendQ.isLoading || kpiQ.isLoading)
    return (
      <>
        {header}
        <Loading />
      </>
    );
  if (kpiQ.error || kpiQ.data?.status === "error")
    return (
      <>
        {header}
        <ErrorState
          message={kpiQ.data?.status === "error" ? kpiQ.data.error.message : kpiQ.error?.message}
        />
      </>
    );
  if (kpiQ.data?.status !== "success") return null;

  // --- KPI values ---
  const cols = kpiQ.data.table.columns.map((c) => c.name);
  const row0 = kpiQ.data.table.rows[0] ?? [];
  const val = (raw: string) => {
    const i = cols.indexOf(raw);
    return i >= 0 ? Number(row0[i]) : NaN;
  };
  const totalCost = val("[TotalEffectiveCost]");
  const untaggedPct = val("[UntaggedPct]");
  const savingsPct = val("[SavingsPct]");

  const count = selected.length || trend.length;
  const avg = count ? totalCost / count : 0;

  // --- Month-over-month for the latest month in the selection ---
  const latestYm =
    (selected.length ? [...selected].sort()[selected.length - 1] : complete[complete.length - 1]?.ym) ?? "";
  const idx = trend.findIndex((t) => t.ym === latestYm);
  const prevPoint = idx > 0 ? trend[idx - 1] : undefined;
  const momPct = prevPoint && prevPoint.cost ? (trend[idx].cost - prevPoint.cost) / prevPoint.cost : 0;
  const momUp = momPct >= 0;

  const selectionLabel =
    selected.length === 0
      ? "All periods"
      : [...selected]
          .sort()
          .map((m) => monthLabel(m))
          .join(", ");

  const trendMax = Math.max(1, ...trend.map((t) => t.cost));
  const isSelected = (ym: string) => selected.length === 0 || selected.includes(ym);
  const toggleMonth = (ym: string) =>
    setSelected((s) => (s.includes(ym) ? s.filter((x) => x !== ym) : [...s, ym]));

  // --- Top services (selection-aware) ---
  const services =
    svcQ.data?.status === "success"
      ? (svcQ.data.table.rows as unknown as [string, number][])
          .map(([label, c]) => ({ label, cost: c ?? 0 }))
          .slice(0, 6)
      : [];
  const svcMax = Math.max(1, ...services.map((s) => s.cost));

  const categories =
    catQ.data?.status === "success"
      ? (catQ.data.table.rows as unknown as [string, number][]).map(([label, c]) => ({
          label,
          cost: c ?? 0,
        }))
      : [];
  const catMax = Math.max(1, ...categories.map((c) => c.cost));
  const regions =
    regQ.data?.status === "success"
      ? (regQ.data.table.rows as unknown as [string, number][]).map(([label, c]) => ({
          label,
          cost: c ?? 0,
        }))
      : [];
  const regMax = Math.max(1, ...regions.map((r) => r.cost));

  return (
    <>
      {header}

      <div className="mb-m flex flex-wrap items-center gap-s text-200 text-muted-foreground">
        <span className="font-semibold text-foreground">Showing:</span>
        <span>{selectionLabel}</span>
        {selectedService ? (
          <button
            type="button"
            onClick={() => setSelectedService(null)}
            className="flex items-center gap-xs rounded-full border border-primary/40 bg-primary/10 px-m py-xs text-100 font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <span className="text-muted-foreground">Service:</span> {selectedService}
            <span aria-hidden>×</span>
          </button>
        ) : null}
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-100 font-medium underline-offset-2 hover:text-primary hover:underline"
          >
            Clear months
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-l sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Selected Spend" value={fmtUsd(totalCost, 0)} caption={selectionLabel} />
        <Kpi
          label="Avg / Month"
          value={fmtUsd(avg, 0)}
          caption={`Across ${count} month${count === 1 ? "" : "s"}`}
        />
        <Kpi
          label="Month over Month"
          value={`${momUp ? "+" : "−"}${fmtPct(Math.abs(momPct))}`}
          caption={
            prevPoint && latestYm
              ? `${monthLabel(latestYm)} vs ${monthLabel(prevPoint.ym)}`
              : "Change vs prior month"
          }
          tone={momUp ? "text-destructive" : "text-success"}
        />
        <Kpi
          label="Untagged"
          value={fmtPct(untaggedPct)}
          caption="Cost without tags"
          tone={untaggedPct > 0.1 ? "text-warning" : "text-success"}
        />
        <Kpi
          label="Savings Rate"
          value={fmtPct(savingsPct)}
          caption="Effective vs list price"
          tone={savingsPct > 0 ? "text-success" : undefined}
        />
      </div>

      <div className="mt-l grid grid-cols-1 gap-l lg:grid-cols-3">
        {/* Spend trend — click bars to filter */}
        <div className="rounded-lg border border-border bg-card p-xl lg:col-span-2">
          <div className="mb-l flex items-baseline justify-between">
            <h3 className="text-300 font-semibold text-foreground">Spend by month</h3>
            <span className="text-100 text-muted-foreground">Click bars to filter →</span>
          </div>
          <div className="flex items-end gap-m" style={{ height: 216 }}>
            {trend.map((t) => {
              const barPx = Math.max(4, Math.round((t.cost / trendMax) * 168));
              const sel = isSelected(t.ym);
              return (
                <button
                  key={t.ym}
                  type="button"
                  onClick={() => toggleMonth(t.ym)}
                  className="flex h-full flex-1 cursor-pointer flex-col items-center justify-end gap-s"
                >
                  <span
                    className={cn(
                      "font-numeric text-100 font-medium",
                      sel ? "text-foreground" : "text-muted-foreground/60"
                    )}
                  >
                    {fmtUsd(t.cost, 0)}
                  </span>
                  <div
                    className="w-full max-w-[72px] rounded-t transition-all"
                    style={{
                      height: barPx,
                      background: sel
                        ? "var(--color-primary)"
                        : "color-mix(in srgb, var(--color-primary) 22%, transparent)",
                    }}
                    title={`${monthLabel(t.ym)}: ${fmtUsd(t.cost, 0)}`}
                  />
                  <span
                    className={cn(
                      "whitespace-nowrap text-100",
                      selected.includes(t.ym)
                        ? "font-semibold text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {monthLabel(t.ym)}
                    {t.partial ? " *" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          {trend.some((t) => t.partial) ? (
            <p className="mt-m text-100 text-muted-foreground">* Current month in progress.</p>
          ) : null}
        </div>

        {/* Top services (click to focus KPIs & trend) */}
        <div className="rounded-lg border border-border bg-card p-xl">
          <h3 className="mb-xxs text-300 font-semibold text-foreground">Top services</h3>
          <p className="mb-l text-100 text-muted-foreground">Click a service to focus KPIs & trend</p>
          <div className="flex flex-col gap-xs">
            {services.map((s, i) => {
              const isSel = selectedService === s.label;
              const dimmed = selectedService !== null && !isSel;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setSelectedService(isSel ? null : s.label)}
                  className={cn(
                    "flex flex-col gap-xxs rounded-md px-s py-xs text-left transition-colors",
                    isSel ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-secondary"
                  )}
                  style={{ opacity: dimmed ? 0.5 : 1 }}
                >
                  <div className="flex items-baseline justify-between gap-s">
                    <span className="truncate text-200 text-foreground" title={s.label}>
                      {s.label}
                    </span>
                    <span className="shrink-0 font-numeric text-200 text-muted-foreground">
                      {fmtUsd(s.cost, 0)}
                    </span>
                  </div>
                  <div className="h-2 rounded bg-secondary">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${(s.cost / svcMax) * 100}%`,
                        background:
                          i === 0
                            ? "var(--color-primary)"
                            : "color-mix(in srgb, var(--color-primary) 55%, transparent)",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-l grid grid-cols-1 gap-l lg:grid-cols-2">
        <MiniBars title="Cost by service category" rows={categories} max={catMax} accent="#8764b8" />
        <MiniBars title="Cost by region" rows={regions} max={regMax} accent="#0f7b0f" />
      </div>
    </>
  );
}
