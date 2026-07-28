import type { ColumnMetadataMap } from "@/lib/to-data-table";
import query from "./exec-summary-kpis.dax?raw";

const connection = "aca";

/** Column metadata keyed by exact DAX output column names. */
const columnMetadata: ColumnMetadataMap = {
  "[Total Effective Cost]": {
    name: "Total Effective Cost",
    displayName: "Costo efectivo",
    format: "#,##0.00",
  },
  "[Untagged %]": {
    name: "Untagged %",
    displayName: "Sin etiquetar",
    format: "0.0%",
  },
  "[Total Savings]": {
    name: "Total Savings",
    displayName: "Ahorro identificado",
    format: "#,##0.00",
  },
  "[Savings %]": {
    name: "Savings %",
    displayName: "Savings %",
    format: "0.0%",
  },
  "[RI Coverage %]": {
    name: "RI Coverage %",
    displayName: "Cobertura reservas",
    format: "0.0%",
  },
};

export function execSummaryKpis() {
  return { connection, query, columnMetadata };
}
