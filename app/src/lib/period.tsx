import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";

const MONTHS_DAX = `EVALUATE
SUMMARIZECOLUMNS ( dim_month[YearMonth], "Cost", [Total Effective Cost] )
ORDER BY dim_month[YearMonth] ASC`;

/** "2026-06" -> "Jun 2026". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

/** "2026-06" -> DAX date-boundary expressions for the whole month. */
export function monthBounds(ym: string): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  return { start: `DATE ( ${y}, ${m}, 1 )`, end: `EOMONTH ( DATE ( ${y}, ${m}, 1 ), 0 )` };
}

interface PeriodState {
  /** Available months ("YYYY-MM"), ascending. */
  months: string[];
  /** Baseline month to compare from. */
  prevYm: string;
  /** Target month to compare to. */
  currYm: string;
  setPrevYm: (ym: string) => void;
  setCurrYm: (ym: string) => void;
  ready: boolean;
}

const PeriodContext = createContext<PeriodState | null>(null);

/**
 * Loads the list of available months once and holds the currently selected
 * comparison period, shared across every view. Defaults to the two most recent
 * complete months (the current calendar month is excluded).
 */
export function PeriodProvider({ children }: { children: ReactNode }) {
  const { data } = useSemanticModelQuery({ connection: "aca", query: MONTHS_DAX });
  const [prevYm, setPrevYm] = useState("");
  const [currYm, setCurrYm] = useState("");

  const months = useMemo(() => {
    if (data?.status !== "success") return [] as string[];
    return (data.table.rows as unknown as [string, number][]).map((r) => r[0]);
  }, [data]);

  useEffect(() => {
    if (months.length < 2 || (prevYm && currYm)) return;
    const nowYm = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const complete = months.filter((m) => m < nowYm);
    const usable = complete.length >= 2 ? complete : months;
    setCurrYm(usable[usable.length - 1]);
    setPrevYm(usable[usable.length - 2]);
  }, [months, prevYm, currYm]);

  const value: PeriodState = {
    months,
    prevYm,
    currYm,
    setPrevYm,
    setCurrYm,
    ready: Boolean(prevYm && currYm),
  };

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod(): PeriodState {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod must be used within a PeriodProvider");
  return ctx;
}
