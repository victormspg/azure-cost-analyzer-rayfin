import { useMemo, useState } from "react";

import { drillDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/format";

import { Chevron } from "./AppShell";
import { ResourceDrill } from "./ResourceDrill";

type DrillRow = {
  name: string;
  prev: number;
  curr: number;
  delta: number;
  usage: number;
  rate: number;
};

function parseRows(rows: unknown): DrillRow[] {
  return (rows as [string, number, number, number, number][])
    .map(([name, prevCost, currCost, prevQty, currQty]) => {
      const pc = prevCost ?? 0;
      const cc = currCost ?? 0;
      const pq = prevQty ?? 0;
      const cq = currQty ?? 0;
      const prevPrice = pq ? pc / pq : 0;
      const currPrice = cq ? cc / cq : 0;
      return {
        name,
        prev: pc,
        curr: cc,
        delta: cc - pc,
        usage: (cq - pq) * prevPrice,
        rate: (currPrice - prevPrice) * cq,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 8);
}

function Signed({ value, muted }: { value: number; muted?: boolean }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "font-numeric",
        muted ? "text-100" : "text-200 font-semibold",
        up ? "text-destructive" : "text-success"
      )}
    >
      {up ? "+" : "−"}
      {fmtUsd(Math.abs(value))}
    </span>
  );
}

/** Inline drill panel: breaks one ServiceCategory into its top services. */
export function CategoryDrill({
  prevYm,
  currYm,
  category,
  mode,
}: {
  prevYm: string;
  currYm: string;
  category: string;
  mode: "delta" | "pricevolume";
}) {
  const query = useMemo(() => drillDax(prevYm, currYm, category), [prevYm, currYm, category]);
  const { data, isLoading, error } = useSemanticModelQuery({ connection: "aca", query });
  const [openSvc, setOpenSvc] = useState<string | null>(null);

  if (isLoading)
    return <div className="px-s py-m text-100 text-muted-foreground">Loading services…</div>;
  if (error || data?.status === "error")
    return <div className="px-s py-m text-100 text-destructive">Couldn&apos;t load detail.</div>;
  if (data?.status !== "success") return null;

  const rows = parseRows(data.table.rows);
  if (rows.length === 0)
    return <div className="px-s py-m text-100 text-muted-foreground">No service detail.</div>;

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-m py-s">
        <span className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
          Services in {category}
        </span>
        <span className="text-100 uppercase tracking-wide text-muted-foreground">
          {mode === "pricevolume" ? "usage · rate · Δ" : `${prevYm.slice(5)} → ${currYm.slice(5)} · Δ`}
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((r) => {
          const isOpen = openSvc === r.name;
          return (
            <div key={r.name}>
              <button
                type="button"
                onClick={() => setOpenSvc(isOpen ? null : r.name)}
                className="flex w-full items-center gap-m px-m py-s text-left transition-colors hover:bg-secondary/40"
              >
                <span className="flex w-40 shrink-0 items-center gap-xs text-200 text-foreground">
                  <span className="text-muted-foreground">
                    <Chevron open={isOpen} />
                  </span>
                  <span className="truncate" title={r.name}>
                    {r.name}
                  </span>
                </span>

                {mode === "pricevolume" ? (
                  <span className="flex flex-1 items-center justify-end gap-l text-100 text-muted-foreground">
                    <span className="tabular-nums">
                      usage <Signed value={r.usage} muted />
                    </span>
                    <span className="tabular-nums">
                      rate <Signed value={r.rate} muted />
                    </span>
                  </span>
                ) : (
                  <span className="flex flex-1 items-center justify-end gap-xs font-numeric text-100 text-muted-foreground">
                    <span>{fmtUsd(r.prev)}</span>
                    <span aria-hidden className="text-muted-foreground/60">
                      →
                    </span>
                    <span className="text-foreground">{fmtUsd(r.curr)}</span>
                  </span>
                )}

                <span className="w-20 shrink-0 text-right">
                  <Signed value={r.delta} />
                </span>
              </button>

              {isOpen ? (
                <div className="px-m pb-s">
                  <ResourceDrill prevYm={prevYm} currYm={currYm} service={r.name} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
