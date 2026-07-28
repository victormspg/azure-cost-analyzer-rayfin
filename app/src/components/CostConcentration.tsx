import { useMemo, useState, type ReactNode } from "react";

import { concentrationDax, concentrationResourcesDax, type ConcSelection } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { fmtUsd } from "@/lib/format";

import { ViewHeader, Loading, ErrorState } from "./AppShell";

function Frame({ children }: { children: ReactNode }) {
  return (
    <>
      <ViewHeader
        title="Concentration"
        subtitle="Where your spend is concentrated — click any item to cross-filter the rest"
      />
      {children}
    </>
  );
}

type Row = { label: string; cost: number };

function BarList({
  title,
  rows,
  accent,
  selected,
  onSelect,
}: {
  title: string;
  rows: Row[];
  accent: string;
  selected: string | null;
  onSelect: (label: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.cost));
  return (
    <div className="rounded-lg border border-border bg-card p-l">
      <h3 className="mb-m text-300 font-semibold text-foreground">{title}</h3>
      <div className="flex flex-col gap-xxs">
        {rows.length === 0 ? (
          <p className="py-s text-100 text-muted-foreground">No data for this filter.</p>
        ) : (
          rows.map((r, i) => {
            const isSel = selected === r.label;
            const dimmed = selected !== null && !isSel;
            return (
              <button
                key={r.label}
                type="button"
                onClick={() => onSelect(r.label)}
                className={cnRow(isSel)}
                style={{ opacity: dimmed ? 0.5 : 1 }}
                title={r.label}
              >
                <span className="w-36 shrink-0 truncate text-left text-200 text-foreground">
                  {r.label}
                </span>
                <div className="relative h-5 flex-1 rounded bg-secondary">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${(r.cost / max) * 100}%`,
                      background:
                        i === 0
                          ? accent
                          : "color-mix(in srgb, " + accent + " 55%, transparent)",
                    }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-numeric text-200 text-foreground">
                  {fmtUsd(r.cost)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function cnRow(selected: boolean): string {
  return [
    "flex items-center gap-m rounded-md px-s py-xs transition-colors",
    selected ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-secondary",
  ].join(" ");
}

function toRows(data: ReturnType<typeof useSemanticModelQuery>["data"]): Row[] {
  if (data?.status !== "success") return [];
  return (data.table.rows as unknown as [string, number][]).map(([label, cost]) => ({
    label,
    cost: cost ?? 0,
  }));
}

export function CostConcentration() {
  const [sel, setSel] = useState<ConcSelection>({ sub: null, service: null, region: null });

  const subQuery = useMemo(() => concentrationDax("sub", sel), [sel]);
  const svcQuery = useMemo(() => concentrationDax("service", sel), [sel]);
  const regQuery = useMemo(() => concentrationDax("region", sel), [sel]);

  const subQ = useSemanticModelQuery({ connection: "aca", query: subQuery });
  const svcQ = useSemanticModelQuery({ connection: "aca", query: svcQuery });
  const regQ = useSemanticModelQuery({ connection: "aca", query: regQuery });
  const resQuery = useMemo(() => concentrationResourcesDax(sel), [sel]);
  const resQ = useSemanticModelQuery({ connection: "aca", query: resQuery });

  const firstLoad =
    !subQ.data && !svcQ.data && !regQ.data && (subQ.isLoading || svcQ.isLoading || regQ.isLoading);
  if (firstLoad)
    return (
      <Frame>
        <Loading />
      </Frame>
    );

  const anyErr =
    subQ.data?.status === "error" || svcQ.data?.status === "error" || regQ.data?.status === "error";
  if (anyErr)
    return (
      <Frame>
        <ErrorState
          message={
            subQ.data?.status === "error"
              ? subQ.data.error.message
              : svcQ.data?.status === "error"
                ? svcQ.data.error.message
                : regQ.data?.status === "error"
                  ? regQ.data.error.message
                  : undefined
          }
        />
      </Frame>
    );

  const subs = toRows(subQ.data);
  const services = toRows(svcQ.data);
  const regions = toRows(regQ.data);

  const resources =
    resQ.data?.status === "success"
      ? (resQ.data.table.rows as unknown as [string, string, string, string, string, string, number][]).map(
          ([name, type, rg, sub, service, region, cost]) => ({
            name,
            type: type || "—",
            rg,
            sub,
            service,
            region,
            cost: cost ?? 0,
          })
        )
      : [];
  const resMax = Math.max(1, ...resources.map((r) => r.cost));

  const toggle = (dim: keyof ConcSelection, label: string) =>
    setSel((s) => ({ ...s, [dim]: s[dim] === label ? null : label }));

  const activeChips = (
    [
      ["sub", "Subscription", sel.sub],
      ["service", "Service", sel.service],
      ["region", "Region", sel.region],
    ] as const
  ).filter(([, , v]) => v);

  return (
    <Frame>
      <div className="mb-l flex min-h-8 flex-wrap items-center gap-s">
        {activeChips.length === 0 ? (
          <span className="text-200 text-muted-foreground">
            No filters — showing all spend. Click a subscription, service, or region to focus.
          </span>
        ) : (
          <>
            <span className="text-200 font-semibold text-foreground">Filters:</span>
            {activeChips.map(([dim, label, value]) => (
              <button
                key={dim}
                type="button"
                onClick={() => toggle(dim, value as string)}
                className="flex items-center gap-xs rounded-full border border-primary/40 bg-primary/10 px-m py-xs text-100 font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <span className="text-muted-foreground">{label}:</span> {value}
                <span aria-hidden>×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSel({ sub: null, service: null, region: null })}
              className="text-100 font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-l lg:grid-cols-3">
        <BarList
          title="Top subscriptions"
          rows={subs}
          accent="#0f6cbd"
          selected={sel.sub ?? null}
          onSelect={(l) => toggle("sub", l)}
        />
        <BarList
          title="Top services"
          rows={services}
          accent="#8764b8"
          selected={sel.service ?? null}
          onSelect={(l) => toggle("service", l)}
        />
        <BarList
          title="Top regions"
          rows={regions}
          accent="#0f7b0f"
          selected={sel.region ?? null}
          onSelect={(l) => toggle("region", l)}
        />
      </div>

      <div className="mt-l rounded-lg border border-border bg-card p-l">
        <div className="mb-m flex items-baseline justify-between">
          <h3 className="text-300 font-semibold text-foreground">Top resources</h3>
          <span className="text-100 text-muted-foreground">hover for detail · click to filter</span>
        </div>
        {resources.length === 0 ? (
          <p className="py-s text-100 text-muted-foreground">No resources for this filter.</p>
        ) : (
          <div className="flex flex-col gap-xxs">
            {resources.map((r) => (
              <button
                key={r.name}
                type="button"
                onClick={() => setSel({ sub: r.sub, service: r.service, region: r.region })}
                className="group relative flex items-center gap-m rounded-md px-s py-xs text-left transition-colors hover:bg-secondary"
              >
                <div className="w-64 min-w-0 shrink-0">
                  <p className="truncate text-200 text-foreground">{r.name}</p>
                  <p className="truncate text-100 text-muted-foreground">
                    {r.type} · {r.rg}
                  </p>
                </div>
                <div className="relative h-4 flex-1 rounded bg-secondary">
                  <div
                    className="h-full rounded"
                    style={{ width: `${(r.cost / resMax) * 100}%`, background: "var(--color-primary)" }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right font-numeric text-200 text-foreground">
                  {fmtUsd(r.cost)}
                </span>

                <div className="pointer-events-none absolute left-s top-full z-20 mt-xxs hidden w-64 rounded-md border border-border bg-card p-m text-100 shadow-lg group-hover:block">
                  <p className="mb-xs font-semibold text-foreground">{r.name}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-m gap-y-xxs text-muted-foreground">
                    <dt>Subscription</dt>
                    <dd className="truncate text-foreground">{r.sub}</dd>
                    <dt>Resource group</dt>
                    <dd className="truncate text-foreground">{r.rg}</dd>
                    <dt>Service</dt>
                    <dd className="truncate text-foreground">{r.service}</dd>
                    <dt>Region</dt>
                    <dd className="truncate text-foreground">{r.region}</dd>
                  </dl>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Frame>
  );
}
