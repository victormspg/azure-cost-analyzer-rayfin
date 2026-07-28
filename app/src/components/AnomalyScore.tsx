import { useMemo, useState } from "react";

import { anomalyScanDax, anomalyWindowDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { cn } from "@/lib/utils";
import { fmtUsd, fmtPct, fmtNum } from "@/lib/format";

import { ViewHeader, Loading, ErrorState, Chevron } from "./AppShell";

type Tier = "high" | "medium" | "low";
type Event = {
  key: string;
  date: string;
  service: string;
  region: string;
  actual: number;
  expected: number;
  std: number;
  z: number;
  severity: string;
  dev: number;
  mult: number;
  tier: Tier;
};

const TIERS: { key: Tier; label: string; dot: string; text: string }[] = [
  { key: "high", label: "Much higher", dot: "bg-destructive", text: "text-destructive" },
  { key: "medium", label: "Higher", dot: "bg-warning", text: "text-warning" },
  { key: "low", label: "Slightly higher", dot: "bg-muted-foreground", text: "text-muted-foreground" },
];
const TIER_META = Object.fromEntries(TIERS.map((t) => [t.key, t])) as Record<Tier, (typeof TIERS)[number]>;

function tierOf(mult: number, expected: number): Tier {
  if (mult >= 3 || expected <= 0.01) return "high";
  if (mult >= 1.5) return "medium";
  return "low";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function multLabel(e: Event): string {
  return e.expected > 0.01 ? `${e.mult.toFixed(1)}× usual` : "new spend";
}

function portalUrl(resourceId: string): string {
  return `https://portal.azure.com/#resource${resourceId}/overview`;
}

/** Dive: top meters driving a service+region over the 7-day rolling window. */
function AnomalyWindow({ service, region, date }: { service: string; region: string; date: string }) {
  const query = useMemo(() => anomalyWindowDax(service, region, date.slice(0, 10)), [service, region, date]);
  const { data, isLoading, error } = useSemanticModelQuery({ connection: "aca", query });

  if (isLoading) return <p className="mt-m text-100 text-muted-foreground">Loading top consumption…</p>;
  if (error || data?.status === "error")
    return <p className="mt-m text-100 text-destructive">Couldn&apos;t load window detail.</p>;
  if (data?.status !== "success") return null;

  const rows = (data.table.rows as unknown as [string, string, string, string, string, number, number][]).map(
    ([id, name, type, rg, sub, cost, qty]) => ({
      id,
      name,
      type: type || "—",
      rg: rg || "—",
      sub: sub || "—",
      cost: cost ?? 0,
      qty: qty ?? 0,
    })
  );
  if (rows.length === 0)
    return <p className="mt-m text-100 text-muted-foreground">No resource detail in this window.</p>;

  return (
    <div className="mt-m rounded-md border border-dashed border-border bg-card">
      <div className="flex items-center gap-m border-b border-border px-m py-s text-100 font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="w-56 shrink-0">Resource</span>
        <span className="flex-1">Subscription · Resource group · Type</span>
        <span className="w-20 shrink-0 text-right">Units</span>
        <span className="w-16 shrink-0 text-right">Cost</span>
        <span className="w-28 shrink-0 text-right">Action</span>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-m px-m py-s" title={r.name}>
            <span className="w-56 shrink-0 truncate text-100 text-foreground">{r.name}</span>
            <span className="flex-1 truncate text-100 text-muted-foreground">
              {r.sub} · {r.rg} · {r.type}
            </span>
            <span className="w-20 shrink-0 text-right font-numeric text-100 text-muted-foreground">
              {fmtNum(r.qty)} u
            </span>
            <span className="w-16 shrink-0 text-right font-numeric text-100 font-semibold text-foreground">
              {fmtUsd(r.cost)}
            </span>
            <a
              href={portalUrl(r.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-28 shrink-0 items-center justify-end gap-xxs text-100 font-semibold text-primary hover:underline"
            >
              Open in Portal
              <span aria-hidden>↗</span>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnomalyScore() {
  const query = useMemo(() => anomalyScanDax(24), []);
  const { data, isLoading, error } = useSemanticModelQuery({ connection: "aca", query });
  const [open, setOpen] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Set<Tier>>(new Set(["high", "medium", "low"]));
  const [sortBy, setSortBy] = useState<"date" | "amount" | "percent">("date");

  const header = (
    <ViewHeader title="Unusual Spend" subtitle="Days where a service cost more than its 7-day usual level" />
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

  // Columns: Date, SubAccountName, ServiceCategory, ServiceName, RegionName,
  // EffectiveCost, RollingMean, RollingStdDev, ZScore, IsAnomaly, Severity, Dev
  const events: Event[] = (
    data.table.rows as unknown as [string, string, string, string, string, number, number, number, number, boolean, string, number][]
  ).map((row) => {
    const [date, , , service, region, actual, mean, std, z, , severity, dev] = row;
    const expected = mean ?? 0;
    const a = actual ?? 0;
    const mult = expected > 0 ? a / expected : 99;
    return {
      key: `${date}-${service}-${region}`,
      date,
      service,
      region,
      actual: a,
      expected,
      std: std ?? 0,
      z: z ?? 0,
      severity: severity ?? "Normal",
      dev: dev ?? 0,
      mult,
      tier: tierOf(mult, expected),
    };
  });

  const top = [...events].sort((x, y) => y.dev - x.dev)[0];
  const counts: Record<Tier, number> = {
    high: events.filter((e) => e.tier === "high").length,
    medium: events.filter((e) => e.tier === "medium").length,
    low: events.filter((e) => e.tier === "low").length,
  };
  const displayed = events
    .filter((e) => tiers.has(e.tier))
    .sort((a, b) =>
      sortBy === "date"
        ? b.date.localeCompare(a.date)
        : sortBy === "amount"
          ? b.dev - a.dev
          : b.mult - a.mult
    );

  const toggleTier = (t: Tier) =>
    setTiers((cur) => {
      const next = new Set(cur);
      if (next.has(t)) {
        if (next.size > 1) next.delete(t);
      } else next.add(t);
      return next;
    });

  return (
    <>
      {header}

      <div className="mb-l rounded-lg border border-border bg-card p-l">
        <p className="mb-s text-100 font-semibold uppercase tracking-wide text-muted-foreground">
          How unusual spend is detected
        </p>
        <ul className="grid grid-cols-1 gap-s text-100 text-muted-foreground sm:grid-cols-2">
          <li>
            <b className="text-foreground">Baseline</b> — each service&apos;s daily cost is compared to
            its own 7-day rolling average, and the days that rose the most above that usual level are
            surfaced first.
          </li>
          <li>
            <b className="text-foreground">How far above usual</b> — each day is rated by how many times
            its cost beat the 7-day average:
            <span className="mt-xs flex flex-col gap-xxs">
              <span className="flex items-center gap-xs">
                <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
                <span><b className="text-foreground">Much higher</b> — 3× or more above usual (or brand-new spend).</span>
              </span>
              <span className="flex items-center gap-xs">
                <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
                <span><b className="text-foreground">Higher</b> — between 1.5× and 3× the usual level.</span>
              </span>
              <span className="flex items-center gap-xs">
                <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
                <span><b className="text-foreground">Slightly higher</b> — under 1.5× above usual.</span>
              </span>
            </span>
          </li>
        </ul>
      </div>

      {top ? (
        <div className="mb-l rounded-lg border border-border border-l-4 border-l-destructive bg-card p-l">
          <p className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">Biggest surprise</p>
          <p className="mt-xs text-400 font-semibold text-foreground">
            {top.service} spent {fmtUsd(top.actual)} on {fmtDate(top.date)}
          </p>
          <p className="mt-xxs text-200 text-muted-foreground">
            About <span className="font-semibold text-destructive">{multLabel(top)}</span> — its 7-day
            average is {fmtUsd(top.expected)} ({top.region}).
          </p>
        </div>
      ) : null}

      {/* Tier filter (multi-select) */}
      <div className="mb-l flex flex-wrap items-center gap-s">
        <span className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">Show</span>
        {TIERS.map((t) => {
          const on = tiers.has(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => toggleTier(t.key)}
              className={cn(
                "flex items-center gap-xs rounded-full border px-m py-xs text-100 font-medium transition-colors",
                on ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", t.dot)} />
              {t.label} <span className="text-muted-foreground">({counts[t.key]})</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-l py-m">
          <h3 className="text-300 font-semibold text-foreground">Unusual days</h3>
          <div className="flex items-center gap-xxs text-100">
            <span className="uppercase tracking-wide text-muted-foreground">Sort</span>
            {([
              ["date", "Newest"],
              ["amount", "By $ change"],
              ["percent", "By % change"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSortBy(k)}
                className={cn(
                  "rounded px-s py-[2px] font-medium transition-colors",
                  sortBy === k ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-border">
          {displayed.map((e) => {
            const isOpen = open === e.key;
            const t = TIER_META[e.tier];
            return (
              <div key={e.key}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : e.key)}
                  className="flex w-full items-center gap-m px-l py-m text-left transition-colors hover:bg-secondary/40"
                >
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", t.dot)} />
                  <span className="w-24 shrink-0 font-numeric text-100 text-muted-foreground">{fmtDate(e.date)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-200 text-foreground">
                      <span className="font-semibold">{e.service}</span> spent{" "}
                      <span className="font-numeric font-semibold">{fmtUsd(e.actual)}</span>
                      <span className="text-muted-foreground"> · usual {fmtUsd(e.expected)}</span>
                    </p>
                    <p className="truncate text-100 text-muted-foreground">{e.region}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-200 font-semibold", t.text)}>
                      +{fmtPct(e.expected > 0 ? (e.actual - e.expected) / e.expected : 1, 0)}
                    </p>
                    <p className="text-100 text-muted-foreground">{multLabel(e)}</p>
                  </div>
                  <span className="shrink-0 text-muted-foreground">
                    <Chevron open={isOpen} />
                  </span>
                </button>

                {isOpen ? (
                  <div className="border-t border-border bg-secondary/30 px-l py-m">
                    <p className="text-200 text-foreground">
                      {e.service} in {e.region} cost{" "}
                      <span className="font-semibold text-destructive">{fmtUsd(e.actual)}</span> on{" "}
                      {fmtDate(e.date)} — {fmtPct(e.expected > 0 ? (e.actual - e.expected) / e.expected : 1, 0)} above its{" "}
                      {fmtUsd(e.expected)} 7-day rolling average.
                    </p>
                    <div className="mt-m flex flex-wrap gap-m text-100 text-muted-foreground">
                      <span>7-day avg: <b className="text-foreground">{fmtUsd(e.expected)}</b></span>
                      <span>Std dev: <b className="text-foreground">{fmtUsd(e.std)}</b></span>
                      <span>Score: <b className="text-foreground">{e.z.toFixed(1)}σ</b></span>
                      <span>Status: <b className="text-foreground">{e.severity}</b></span>
                    </div>
                    <AnomalyWindow service={e.service} region={e.region} date={e.date} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
