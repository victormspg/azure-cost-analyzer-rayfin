import { usePeriod, monthLabel } from "@/lib/period";
import { cn } from "@/lib/utils";

const selectClass =
  "rounded-md border border-border bg-card px-m py-s-nudge text-200 font-medium text-foreground transition-colors focus:border-primary focus:outline-none";

/** Two-dropdown month comparison selector, backed by the shared PeriodProvider. */
export function PeriodPicker() {
  const { months, prevYm, currYm, setPrevYm, setCurrYm } = usePeriod();
  if (months.length < 2) return null;

  return (
    <div className="flex items-center gap-s text-200 text-muted-foreground">
      <span className="uppercase tracking-wide text-100 font-semibold">Compare</span>
      <select
        aria-label="Baseline month"
        className={cn(selectClass)}
        value={prevYm}
        onChange={(e) => setPrevYm(e.target.value)}
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <span aria-hidden>→</span>
      <select
        aria-label="Comparison month"
        className={cn(selectClass)}
        value={currYm}
        onChange={(e) => setCurrYm(e.target.value)}
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
    </div>
  );
}
