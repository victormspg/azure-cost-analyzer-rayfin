import { useMemo } from "react";

import { resourceDrillDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/format";

type Res = {
  name: string;
  rg: string;
  sub: string;
  project: string;
  environment: string;
  prev: number;
  curr: number;
  delta: number;
};

/** Third-level drill: individual resources of one service, with sub / RG / tags on hover. */
export function ResourceDrill({
  prevYm,
  currYm,
  service,
}: {
  prevYm: string;
  currYm: string;
  service: string;
}) {
  const query = useMemo(() => resourceDrillDax(prevYm, currYm, service), [prevYm, currYm, service]);
  const { data, isLoading, error } = useSemanticModelQuery({ connection: "aca", query });

  if (isLoading)
    return <div className="px-m py-s text-100 text-muted-foreground">Loading resources…</div>;
  if (error || data?.status === "error")
    return <div className="px-m py-s text-100 text-destructive">Couldn&apos;t load resources.</div>;
  if (data?.status !== "success") return null;

  const rows: Res[] = (
    data.table.rows as unknown as [string, string, string, string, string, number, number][]
  ).map(([name, rg, sub, project, environment, prev, curr]) => ({
    name,
    rg: rg || "—",
    sub: sub || "—",
    project: project || "Untagged",
    environment: environment || "Untagged",
    prev: prev ?? 0,
    curr: curr ?? 0,
    delta: (curr ?? 0) - (prev ?? 0),
  }));

  if (rows.length === 0)
    return <div className="px-m py-s text-100 text-muted-foreground">No resource detail.</div>;

  return (
    <div className="mt-xs rounded-md border border-dashed border-border bg-card">
      <div className="border-b border-border px-m py-s text-100 font-semibold uppercase tracking-wide text-muted-foreground">
        Resources · hover for subscription, resource group & tags
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((r) => {
          const up = r.delta >= 0;
          return (
            <div
              key={r.name}
              className="group relative flex items-center gap-m px-m py-s"
              title={`Subscription: ${r.sub}\nResource group: ${r.rg}\nProject: ${r.project}\nEnvironment: ${r.environment}`}
            >
              <span className="w-40 shrink-0 truncate text-200 text-foreground">{r.name}</span>
              <span className="flex flex-1 items-center gap-xs overflow-hidden text-100 text-muted-foreground">
                <span className="truncate rounded bg-secondary px-xs py-[1px]">{r.rg}</span>
                <span
                  className={cn(
                    "shrink-0 rounded px-xs py-[1px]",
                    r.project === "Untagged"
                      ? "bg-warning/15 text-warning"
                      : "bg-success/15 text-success"
                  )}
                >
                  {r.project}
                </span>
              </span>
              <span className="w-16 shrink-0 text-right font-numeric text-100 text-muted-foreground">
                {fmtUsd(r.curr)}
              </span>
              <span
                className={cn(
                  "w-16 shrink-0 text-right font-numeric text-200 font-semibold",
                  up ? "text-destructive" : "text-success"
                )}
              >
                {up ? "+" : "−"}
                {fmtUsd(Math.abs(r.delta))}
              </span>

              {/* rich hover card, anchored under the resource name */}
              <div className="pointer-events-none absolute left-m top-full z-20 mt-xxs hidden w-64 rounded-md border border-border bg-card p-m text-100 shadow-lg group-hover:block">
                <p className="mb-xs font-semibold text-foreground">{r.name}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-m gap-y-xxs text-muted-foreground">
                  <dt>Subscription</dt>
                  <dd className="truncate text-foreground">{r.sub}</dd>
                  <dt>Resource group</dt>
                  <dd className="truncate text-foreground">{r.rg}</dd>
                  <dt>Project</dt>
                  <dd className="text-foreground">{r.project}</dd>
                  <dt>Environment</dt>
                  <dd className="text-foreground">{r.environment}</dd>
                </dl>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
