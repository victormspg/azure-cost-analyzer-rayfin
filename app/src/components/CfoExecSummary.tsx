import React from "react";
import { execSummaryKpis } from "@/queries/cfo";
import { monthlyTrend } from "@/queries/cfo";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";
import { toDataTable } from "@/lib/to-data-table";
import { VegaVisual, useCssTheme } from "@microsoft/fabric-visuals";

/** Format a number compactly (K, M, B). */
function formatCompact(value: number, prefix = "$"): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${prefix}${(value / 1_000).toFixed(2)}K`;
  return `${prefix}${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** KPI card sub-component */
function KpiCard({
  label,
  value,
  subtitle,
  subtitleColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  subtitleColor?: string;
}) {
  return (
    <div className="flex flex-col gap-xs rounded-lg border border-border bg-card px-xl py-l">
      <span className="text-200 font-medium text-muted-foreground">{label}</span>
      <span className="font-numeric text-hero-800 font-semibold text-foreground">{value}</span>
      {subtitle && (
        <span className={`text-100 font-medium ${subtitleColor ?? "text-muted-foreground"}`}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

/** Sidebar navigation */
function Sidebar({ active }: { active: string }) {
  const items = [
    { id: "resumen", icon: "📊", label: "Resumen Ejecutivo" },
    { id: "showback", icon: "🏷️", label: "Showback / Chargeback" },
    { id: "ahorros", icon: "🏦", label: "Ahorros Realizados" },
    { id: "pregunta", icon: "💬", label: "Pregúntale a tus datos" },
  ];

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-xs border-r border-border bg-card p-l">
      <div className="mb-m flex items-center gap-s">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          CF
        </div>
        <div>
          <p className="text-300 font-semibold text-foreground">CFO</p>
          <p className="text-100 text-muted-foreground">Líder Financiero</p>
        </div>
      </div>
      <p className="mb-xs text-100 font-semibold uppercase tracking-wide text-muted-foreground">
        Vistas del Rol
      </p>
      {items.map((item) => (
        <button
          key={item.id}
          className={`flex items-center gap-s rounded-md px-m py-s text-left text-200 transition-colors ${
            item.id === active
              ? "border-l-2 border-primary bg-muted font-semibold text-primary"
              : "text-foreground hover:bg-muted"
          }`}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Narrative block */
function Narrative({ cost, untagged, savings }: { cost: string; untagged: string; savings: string }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-xl">
      <div className="mb-m inline-flex items-center gap-xs self-start rounded-full border border-primary/30 bg-primary/5 px-m py-xs">
        <span className="text-100 text-primary">◆</span>
        <span className="text-200 font-medium text-primary">Narrativa generada por RayFin</span>
      </div>
      <div className="space-y-m text-300 leading-300 text-foreground">
        <p>
          El gasto cloud cerró en <strong className="text-primary">{cost} MXN</strong> con una{" "}
          <strong className="text-primary">tendencia al alza hasta junio</strong> impulsada por
          Analytics y Databases (81% del total).
        </p>
        <p>
          Existe un <strong className="text-amber-600">{untagged} del costo sin etiquetar</strong>,
          lo que impide asignar gasto a unidades de negocio.
          Se propuso una política de tagging obligatorio.
        </p>
        <p>
          FinOps identificó <strong className="text-green-700">{savings} MXN de ahorro anualizado</strong>{" "}
          en palancas de optimización accionables.
        </p>
      </div>
    </div>
  );
}

/** Monthly trend chart + MoM computation */
function TrendChart({ onMomComputed }: { onMomComputed?: (mom: number | null) => void }) {
  const theme = useCssTheme();
  const { connection, query, columnMetadata, vegaLiteSpec } = monthlyTrend();
  const { data, isLoading } = useSemanticModelQuery({ connection, query });

  // Compute MoM from last two data points
  React.useEffect(() => {
    if (!onMomComputed || data?.status !== "success") return;
    const dt = toDataTable(data.table, columnMetadata);
    const costIdx = dt.columns.findIndex((c) => c.name === "Effective Cost");
    if (costIdx === -1 || dt.rows.length < 2) {
      onMomComputed(null);
      return;
    }
    const current = Number(dt.rows[dt.rows.length - 1][costIdx]);
    const previous = Number(dt.rows[dt.rows.length - 2][costIdx]);
    if (previous === 0) { onMomComputed(null); return; }
    onMomComputed((current - previous) / previous);
  }, [data, onMomComputed, columnMetadata]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-border bg-card p-xl">
        <p className="text-200 text-muted-foreground">Cargando tendencia…</p>
      </div>
    );
  }

  if (data?.status !== "success") return null;

  const dataTable = toDataTable(data.table, columnMetadata);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-xl">
      <h3 className="mb-m text-200 font-semibold text-foreground">
        Tendencia mensual (Total Effective Cost)
      </h3>
      <div className="min-h-48 flex-1">
        <VegaVisual spec={vegaLiteSpec} data={dataTable} theme={theme} />
      </div>
    </div>
  );
}

export function CfoExecSummary() {
  const { connection, query, columnMetadata } = execSummaryKpis();
  const { data, isLoading, error } = useSemanticModelQuery({ connection, query });
  const [momPct, setMomPct] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando resumen ejecutivo…</p>
      </div>
    );
  }

  if (error || data?.status === "error") {
    const msg = data?.status === "error" ? data.error.message : error?.message;
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-destructive">Error: {msg}</p>
      </div>
    );
  }

  if (data?.status !== "success") return null;

  const dataTable = toDataTable(data.table, columnMetadata);
  const row = dataTable.rows[0];
  if (!row) return null;

  const cols = dataTable.columns;
  const getVal = (name: string): number | null => {
    const idx = cols.findIndex((c) => c.name === name);
    if (idx === -1) return null;
    const v = row[idx];
    return v != null ? Number(v) : null;
  };

  const totalCost = getVal("Total Effective Cost");
  const untaggedPct = getVal("Untagged %");
  const totalSavings = getVal("Total Savings");
  const riCoverage = getVal("RI Coverage %");

  const costDisplay = totalCost != null ? formatCompact(totalCost) : "—";
  const momDisplay = momPct != null ? `▲ ${formatPercent(momPct)} MoM` : "";
  const untaggedDisplay = untaggedPct != null ? formatPercent(untaggedPct) : "—";
  const savingsDisplay = totalSavings != null ? formatCompact(totalSavings) : "—";
  const riDisplay = riCoverage != null ? formatPercent(riCoverage) : "—";

  const monthNames = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const now = new Date();
  const currentMonth = monthNames[now.getMonth()];
  const currentYear = now.getFullYear();

  return (
    <div className="flex h-full bg-background">
      <Sidebar active="resumen" />

      <main className="flex flex-1 flex-col overflow-auto p-xl">
        {/* Badge */}
        <div className="mb-m">
          <span className="inline-flex items-center gap-xs rounded-full border border-primary/30 bg-primary/5 px-m py-xs text-200 font-medium text-primary">
            ◆ Pilar 5 · Lente ejecutiva
          </span>
        </div>

        {/* Title */}
        <header className="mb-l">
          <h1 className="font-heading text-hero-700 font-semibold text-foreground">
            Resumen Ejecutivo · {currentMonth} {currentYear}
          </h1>
          <p className="text-200 text-muted-foreground">
            El estado del gasto en 30 segundos: narrativa auto-generada más KPIs del mes, lista para el board.
          </p>
        </header>

        {/* KPI Cards */}
        <div className="mb-l grid grid-cols-1 gap-l sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Costo efectivo"
            value={costDisplay}
            subtitle={momDisplay}
            subtitleColor={momPct != null && momPct > 0 ? "text-red-600" : "text-green-700"}
          />
          <KpiCard
            label="Sin etiquetar"
            value={untaggedDisplay}
            subtitle="riesgo gobernanza"
            subtitleColor="text-amber-600"
          />
          <KpiCard
            label="Ahorro identificado"
            value={savingsDisplay}
            subtitle="anualizado"
          />
          <KpiCard
            label="Cobertura reservas"
            value={riDisplay}
            subtitle={riCoverage == null ? "sin datos aún" : undefined}
          />
        </div>

        {/* Narrative + Trend chart */}
        <div className="mb-l grid grid-cols-1 gap-l lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Narrative
              cost={costDisplay}
              untagged={untaggedDisplay}
              savings={savingsDisplay}
            />
          </div>
          <div className="lg:col-span-2">
            <TrendChart onMomComputed={setMomPct} />
          </div>
        </div>

        {/* Footer sources */}
        <footer className="flex flex-wrap items-center gap-s text-100 text-muted-foreground">
          <span>Fuentes:</span>
          {["gold_cost_summary_monthly", "gold_cost_by_resource", "dim_month"].map((t) => (
            <code key={t} className="rounded bg-muted px-xs py-xxs font-monospace">{t}</code>
          ))}
          <span>· measures</span>
          {["Total Effective Cost", "MoM Cost %", "Untagged %"].map((m) => (
            <code key={m} className="rounded bg-muted px-xs py-xxs font-monospace">{m}</code>
          ))}
        </footer>
      </main>
    </div>
  );
}
