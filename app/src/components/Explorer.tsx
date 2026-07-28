import { useMemo, useState } from "react";

import {
  explorerDimDax,
  explorerMonthsDax,
  explorerResourcesDax,
  explorerTotalDax,
  explorerChangeDax,
  explorerRangeDeltaDax,
  explorerItemByMonthDax,
  type ExpDim,
  type ExpSel,
} from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { monthLabel } from "@/lib/period";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/format";

import { ViewHeader, Loading, ErrorState, Chevron } from "./AppShell";

type Row = { label: string; cost: number };

function toRows(data: ReturnType<typeof useSemanticModelQuery>["data"]): Row[] {
  if (data?.status !== "success") return [];
  return (data.table.rows as unknown as [string, number][]).map(([label, cost]) => ({
    label,
    cost: cost ?? 0,
  }));
}

/** A multi-select dropdown filter with checkbox options. */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  fmt,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  fmt?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? fmt
          ? fmt(selected[0])
          : selected[0]
        : `${selected.length} selected`;
  return (
    <div className="relative">
      <span className="mb-xxs block text-100 font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-s rounded-md border border-border bg-card px-m py-s-nudge text-200 text-foreground transition-colors hover:border-primary"
      >
        <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>{summary}</span>
        <Chevron open={open} />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-xxs max-h-64 w-full overflow-auto rounded-md border border-border bg-card p-xs shadow-lg">
            {options.length === 0 ? (
              <p className="px-s py-xs text-100 text-muted-foreground">No options</p>
            ) : (
              options.map((o) => {
                const on = selected.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => onChange(on ? selected.filter((x) => x !== o) : [...selected, o])}
                    className={cn(
                      "flex w-full items-center gap-s rounded px-s py-xs text-left text-200 transition-colors hover:bg-secondary",
                      on ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] leading-none",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      )}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="truncate" title={fmt ? fmt(o) : o}>
                      {fmt ? fmt(o) : o}
                    </span>
                  </button>
                );
              })
            )}
            {selected.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mt-xxs w-full rounded px-s py-xs text-left text-100 font-medium text-muted-foreground hover:text-primary"
              >
                Clear
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Selected Difference KPI — total spend delta across the compare range. */
function RangeDelta({ prevYm, currYm, sel }: { prevYm: string; currYm: string; sel: ExpSel }) {
  const query = useMemo(() => explorerRangeDeltaDax(prevYm, currYm, sel), [prevYm, currYm, sel]);
  const { data } = useSemanticModelQuery({ connection: "aca", query });
  const row = data?.status === "success" ? (data.table.rows[0] as unknown as [number, number]) : undefined;
  const prev = Number(row?.[0] ?? 0);
  const curr = Number(row?.[1] ?? 0);
  const delta = curr - prev;
  const up = delta >= 0;
  return (
    <div className="rounded-lg border border-border bg-card px-l py-l">
      <p className="text-200 font-medium uppercase tracking-wide text-muted-foreground">Selected Difference</p>
      <p className={cn("mt-xs font-numeric text-[length:var(--text-hero-700)] font-semibold leading-hero-700", up ? "text-destructive" : "text-success")}>
        {up ? "+" : "−"}
        {fmtUsd(Math.abs(delta), 0)}
      </p>
      <p className="mt-xxs text-100 text-muted-foreground">
        {monthLabel(prevYm)} → {monthLabel(currYm)}
      </p>
    </div>
  );
}

/** Prev → curr by service with usage vs rate, for the selected month range. */
function ExplorerChange({ prevYm, currYm, sel }: { prevYm: string; currYm: string; sel: ExpSel }) {
  const query = useMemo(() => explorerChangeDax(prevYm, currYm, sel), [prevYm, currYm, sel]);
  const { data, isLoading } = useSemanticModelQuery({ connection: "aca", query });

  const movers =
    data?.status === "success"
      ? (data.table.rows as unknown as [string, number, number, number, number][])
          .map(([name, prev, curr, pq, cq]) => {
            const p = prev ?? 0;
            const c = curr ?? 0;
            const pQ = pq ?? 0;
            const cQ = cq ?? 0;
            const prevPrice = pQ ? p / pQ : 0;
            const currPrice = cQ ? c / cQ : 0;
            return { name, delta: c - p, usage: (cQ - pQ) * prevPrice, rate: (currPrice - prevPrice) * cQ };
          })
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      : [];

  return (
    <div className="flex h-[26rem] min-h-0 flex-col rounded-lg border border-border bg-card p-l lg:h-full">
      <h3 className="text-300 font-semibold text-foreground">What changed</h3>
      <p className="mb-m text-100 text-muted-foreground">
        {monthLabel(prevYm)} → {monthLabel(currYm)} · usage vs rate
      </p>
      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <p className="text-100 text-muted-foreground">Loading…</p>
        ) : movers.length === 0 ? (
          <p className="text-100 text-muted-foreground">No movement.</p>
        ) : (
          <div className="absolute inset-0 flex flex-col gap-s overflow-auto pr-xs">
          {movers.map((m) => {
            const up = m.delta >= 0;
            return (
              <div key={m.name} className="border-b border-border/60 pb-s last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-s">
                  <span className="truncate text-200 text-foreground" title={m.name}>
                    {m.name}
                  </span>
                  <span className={cn("shrink-0 font-numeric text-200 font-semibold", up ? "text-destructive" : "text-success")}>
                    {up ? "+" : "−"}
                    {fmtUsd(Math.abs(m.delta))}
                  </span>
                </div>
                <div className="mt-xxs flex gap-m text-100 text-muted-foreground">
                  <span>
                    usage{" "}
                    <b className={m.usage >= 0 ? "text-destructive" : "text-success"}>
                      {m.usage >= 0 ? "+" : "−"}
                      {fmtUsd(Math.abs(m.usage))}
                    </b>
                  </span>
                  <span>
                    rate{" "}
                    <b className={m.rate >= 0 ? "text-destructive" : "text-success"}>
                      {m.rate >= 0 ? "+" : "−"}
                      {fmtUsd(Math.abs(m.rate))}
                    </b>
                  </span>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_SEL: ExpSel = { months: [], category: [], service: [], sub: [], region: [] };

/** A dimension value broken down by month (expand detail). */
function ItemMonths({ dim, value, sel }: { dim: ExpDim; value: string; sel: ExpSel }) {
  const query = useMemo(() => explorerItemByMonthDax(dim, value, sel), [dim, value, sel]);
  const { data, isLoading } = useSemanticModelQuery({ connection: "aca", query });
  if (isLoading) return <p className="px-s py-xs text-100 text-muted-foreground">Loading months…</p>;
  const rows =
    data?.status === "success"
      ? (data.table.rows as unknown as [string, number][]).map(([ym, c]) => ({ ym, cost: c ?? 0 }))
      : [];
  if (rows.length === 0) return <p className="px-s py-xs text-100 text-muted-foreground">No monthly detail.</p>;
  const max = Math.max(1, ...rows.map((r) => r.cost));
  return (
    <div className="mt-xxs rounded-md border border-dashed border-border bg-background p-s">
      {rows.map((r) => (
        <div key={r.ym} className="flex items-center gap-s py-[2px]">
          <span className="w-16 shrink-0 text-100 text-muted-foreground">{monthLabel(r.ym)}</span>
          <div className="h-2 flex-1 rounded bg-secondary">
            <div className="h-full rounded bg-primary" style={{ width: `${(r.cost / max) * 100}%` }} />
          </div>
          <span className="w-14 shrink-0 text-right font-numeric text-100 text-foreground">{fmtUsd(r.cost, 0)}</span>
        </div>
      ))}
    </div>
  );
}

/** Cross-filter dimension list; clicking a bar toggles that value in the multi-select. */
function BarList({
  title,
  dim,
  rows,
  accent,
  selected,
  onToggle,
  sel,
}: {
  title: string;
  dim: ExpDim;
  rows: Row[];
  accent: string;
  selected: string[];
  onToggle: (label: string) => void;
  sel: ExpSel;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.cost));
  return (
    <div className="rounded-lg border border-border bg-card p-l">
      <h3 className="mb-m text-300 font-semibold text-foreground">{title}</h3>
      <div className="flex flex-col gap-xxs">
        {rows.length === 0 ? (
          <p className="py-s text-100 text-muted-foreground">No data.</p>
        ) : (
          rows.map((r, i) => {
            const isSel = selected.includes(r.label);
            const dimmed = selected.length > 0 && !isSel;
            const isOpen = open === r.label;
            return (
              <div key={r.label} style={{ opacity: dimmed ? 0.5 : 1 }}>
                <div className="flex items-center gap-xxs">
                  <button
                    type="button"
                    onClick={() => onToggle(r.label)}
                    className={cn(
                      "flex flex-1 items-center gap-s rounded-md px-s py-xs transition-colors",
                      isSel ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-secondary"
                    )}
                    title={r.label}
                  >
                    <span className="w-28 shrink-0 truncate text-left text-200 text-foreground">{r.label}</span>
                    <div className="relative h-4 flex-1 rounded bg-secondary">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${(r.cost / max) * 100}%`,
                          background: i === 0 ? accent : "color-mix(in srgb, " + accent + " 55%, transparent)",
                        }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right font-numeric text-100 text-foreground">
                      {fmtUsd(r.cost, 0)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Toggle monthly detail"
                    onClick={() => setOpen(isOpen ? null : r.label)}
                    className="grid h-6 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:text-primary"
                  >
                    <Chevron open={isOpen} />
                  </button>
                </div>
                {isOpen ? <ItemMonths dim={dim} value={r.label} sel={sel} /> : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function Explorer() {
  const [sel, setSel] = useState<ExpSel>({ months: [], category: [], service: [], sub: [], region: [] });

  const monthsQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerMonthsDax(sel), [sel]) });
  const resQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerResourcesDax(sel), [sel]) });
  const totalQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerTotalDax(sel), [sel]) });

  // Cross-filtered dimension lists for the BarList columns.
  const catQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerDimDax("category", sel), [sel]) });
  const svcQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerDimDax("service", sel), [sel]) });
  const subQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerDimDax("sub", sel), [sel]) });
  const regQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerDimDax("region", sel), [sel]) });

  // Stable full option lists (not cross-filtered) for the dropdown filters.
  const catOptQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerDimDax("category", EMPTY_SEL, 100), []) });
  const svcOptQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerDimDax("service", EMPTY_SEL, 100), []) });
  const subOptQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerDimDax("sub", EMPTY_SEL, 100), []) });
  const regOptQ = useSemanticModelQuery({ connection: "aca", query: useMemo(() => explorerDimDax("region", EMPTY_SEL, 100), []) });

  const header = (
    <ViewHeader
      title="Explorer"
      subtitle="Slice spend by month, category, service, subscription, region — everything cross-filters"
    />
  );

  const firstLoad = !monthsQ.data && monthsQ.isLoading;
  if (firstLoad)
    return (
      <>
        {header}
        <Loading />
      </>
    );
  if (monthsQ.data?.status === "error")
    return (
      <>
        {header}
        <ErrorState message={monthsQ.data.error.message} />
      </>
    );

  const months = (
    monthsQ.data?.status === "success"
      ? (monthsQ.data.table.rows as unknown as [string, number][]).map(([ym, c]) => ({ ym, cost: c ?? 0 }))
      : []
  ).sort((a, b) => a.ym.localeCompare(b.ym));

  const catOptions = toRows(catOptQ.data).map((r) => r.label);
  const svcOptions = toRows(svcOptQ.data).map((r) => r.label);
  const subOptions = toRows(subOptQ.data).map((r) => r.label);
  const regOptions = toRows(regOptQ.data).map((r) => r.label);
  const monthOptions = months.map((m) => m.ym);

  const categories = toRows(catQ.data);
  const services = toRows(svcQ.data);
  const subs = toRows(subQ.data);
  const regions = toRows(regQ.data);

  const resources =
    resQ.data?.status === "success"
      ? (resQ.data.table.rows as unknown as [string, string, string, string, string, string, number][]).map(
          ([name, type, rg, sub, service, region, cost]) => ({ name, type: type || "—", rg, sub, service, region, cost: cost ?? 0 })
        )
      : [];

  const total = totalQ.data?.status === "success" ? Number((totalQ.data.table.rows[0] ?? [0])[0]) : 0;

  const setDim = (dim: ExpDim, vals: string[]) => setSel((s) => ({ ...s, [dim]: vals }));
  const toggleDim = (dim: ExpDim, label: string) =>
    setSel((s) => {
      const cur = s[dim] ?? [];
      return { ...s, [dim]: cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label] };
    });
  const toggleMonth = (ym: string) =>
    setSel((s) => ({ ...s, months: s.months.includes(ym) ? s.months.filter((x) => x !== ym) : [...s.months, ym] }));
  const isMonthSel = (ym: string) => sel.months.length === 0 || sel.months.includes(ym);

  const anyFilter =
    sel.months.length +
      (sel.category?.length ?? 0) +
      (sel.service?.length ?? 0) +
      (sel.sub?.length ?? 0) +
      (sel.region?.length ?? 0) >
    0;

  // Line chart geometry — fixed viewBox scales to the container width (no scroll).
  // A taller H makes the trend legible without browser zoom.
  const W = 1000;
  const H = 300;
  const padX = 46;
  const padTop = 42;
  const padBottom = 44;
  const maxCost = Math.max(1, ...months.map((m) => m.cost));
  const px = (i: number) => padX + (months.length <= 1 ? 0 : (i / (months.length - 1)) * (W - 2 * padX));
  const py = (c: number) => H - padBottom - (c / maxCost) * (H - padTop - padBottom);
  const linePoints = months.map((m, i) => `${px(i)},${py(m.cost)}`).join(" ");

  // Compare range: selected months (min→max); else the full displayed period.
  const sortedSel = [...sel.months].sort();
  const changeMonths: [string, string] | null =
    sortedSel.length >= 2
      ? [sortedSel[0], sortedSel[sortedSel.length - 1]]
      : months.length >= 2
        ? [months[0].ym, months[months.length - 1].ym]
        : null;

  const timeline = (
    <div className="rounded-lg border border-border bg-card p-l">
      <div className="mb-s flex items-baseline justify-between">
        <h3 className="text-300 font-semibold text-foreground">Spend timeline</h3>
        <span className="text-100 text-muted-foreground">click a point to filter by month</span>
      </div>
      <div className="text-foreground">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="aca-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`${padX},${H - padBottom} ${linePoints} ${W - padX},${H - padBottom}`}
            fill="url(#aca-area)"
            stroke="none"
          />
          <polyline points={linePoints} fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {months.map((m, i) => {
            const on = isMonthSel(m.ym);
            return (
              <g key={m.ym} onClick={() => toggleMonth(m.ym)} style={{ cursor: "pointer" }}>
                <rect x={px(i) - 30} y={0} width={60} height={H} fill="transparent" />
                <circle
                  cx={px(i)}
                  cy={py(m.cost)}
                  r={sel.months.includes(m.ym) ? 8 : 5.5}
                  fill={on ? "var(--color-primary)" : "var(--color-card)"}
                  stroke="var(--color-primary)"
                  strokeWidth="2.5"
                />
                <text x={px(i)} y={py(m.cost) - 14} textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">
                  {fmtUsd(m.cost, 0)}
                </text>
                <text
                  x={px(i)}
                  y={H - 14}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight={sel.months.includes(m.ym) ? 700 : 400}
                  fill={sel.months.includes(m.ym) ? "var(--color-primary)" : "var(--color-muted-foreground)"}
                >
                  {monthLabel(m.ym)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );

  return (
    <>
      {header}

      {/* Filters (dropdowns, multi-select) */}
      <div className="mb-s grid grid-cols-2 gap-m md:grid-cols-3 lg:grid-cols-5">
        <MultiSelect label="Months" options={monthOptions} selected={sel.months} onChange={(v) => setSel((s) => ({ ...s, months: v }))} fmt={monthLabel} />
        <MultiSelect label="Service categories" options={catOptions} selected={sel.category ?? []} onChange={(v) => setDim("category", v)} />
        <MultiSelect label="Services" options={svcOptions} selected={sel.service ?? []} onChange={(v) => setDim("service", v)} />
        <MultiSelect label="Subscriptions" options={subOptions} selected={sel.sub ?? []} onChange={(v) => setDim("sub", v)} />
        <MultiSelect label="Regions" options={regOptions} selected={sel.region ?? []} onChange={(v) => setDim("region", v)} />
      </div>
      <div className="mb-l h-4">
        {anyFilter ? (
          <button
            type="button"
            onClick={() => setSel({ months: [], category: [], service: [], sub: [], region: [] })}
            className="text-100 font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            Clear all filters
          </button>
        ) : null}
      </div>

      {/* Values + timeline (left) · What changed (right) */}
      <div className="mb-l grid grid-cols-1 gap-l lg:grid-cols-3">
        <div className="flex flex-col gap-l lg:col-span-2">
          <div className="grid grid-cols-1 gap-l sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-card px-l py-l">
              <p className="text-200 font-medium uppercase tracking-wide text-muted-foreground">Selected Spend</p>
              <p className="mt-xs font-numeric text-[length:var(--text-hero-700)] font-semibold leading-hero-700 text-foreground">{fmtUsd(total, 0)}</p>
              <p className="mt-xxs text-100 text-muted-foreground">
                {(() => {
                  const src = sel.months.length ? [...sel.months].sort() : months.map((m) => m.ym);
                  if (src.length === 0) return "—";
                  if (src.length === 1) return monthLabel(src[0]);
                  return `${monthLabel(src[0])} → ${monthLabel(src[src.length - 1])}`;
                })()}
              </p>
            </div>
            {changeMonths ? (
              <RangeDelta prevYm={changeMonths[0]} currYm={changeMonths[1]} sel={sel} />
            ) : (
              <div className="rounded-lg border border-border bg-card px-l py-l">
                <p className="text-200 font-medium uppercase tracking-wide text-muted-foreground">Selected Difference</p>
                <p className="mt-xs font-numeric text-[length:var(--text-hero-700)] font-semibold leading-hero-700 text-muted-foreground">—</p>
                <p className="mt-xxs text-100 text-muted-foreground">Need two months</p>
              </div>
            )}
          </div>
          {timeline}
        </div>

        <div className="lg:col-span-1">
          {changeMonths ? (
            <ExplorerChange prevYm={changeMonths[0]} currYm={changeMonths[1]} sel={sel} />
          ) : (
            <div className="rounded-lg border border-border bg-card p-l text-100 text-muted-foreground">
              Need at least two months to compare.
            </div>
          )}
        </div>
      </div>

      {/* Cross-filter dimension lists (4 across) */}
      <div className="mb-l grid grid-cols-1 gap-l md:grid-cols-2 xl:grid-cols-4">
        <BarList title="Service categories" dim="category" rows={categories} accent="#8764b8" selected={sel.category ?? []} onToggle={(l) => toggleDim("category", l)} sel={sel} />
        <BarList title="Services" dim="service" rows={services} accent="#0f6cbd" selected={sel.service ?? []} onToggle={(l) => toggleDim("service", l)} sel={sel} />
        <BarList title="Subscriptions" dim="sub" rows={subs} accent="#038387" selected={sel.sub ?? []} onToggle={(l) => toggleDim("sub", l)} sel={sel} />
        <BarList title="Regions" dim="region" rows={regions} accent="#0f7b0f" selected={sel.region ?? []} onToggle={(l) => toggleDim("region", l)} sel={sel} />
      </div>

      {/* Resource detail */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-m border-b border-border bg-secondary/50 px-l py-m text-100 font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="w-56 shrink-0">Resource</span>
          <span className="flex-1">Subscription · Resource group · Type</span>
          <span className="shrink-0">Cost</span>
        </div>
        {resources.length === 0 ? (
          <p className="px-l py-l text-200 text-muted-foreground">No resources for this filter.</p>
        ) : (
          <div className="max-h-96 divide-y divide-border/60 overflow-auto">
            {resources.map((r) => (
              <div key={`${r.name}-${r.rg}`} className="flex items-center gap-m px-l py-s" title={r.name}>
                <span className="w-56 shrink-0 truncate text-200 text-foreground">{r.name}</span>
                <span className="flex-1 truncate text-100 text-muted-foreground">
                  {r.sub} · {r.rg} · {r.type}
                </span>
                <span className="shrink-0 font-numeric text-200 text-foreground">{fmtUsd(r.cost)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
