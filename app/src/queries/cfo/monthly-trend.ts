import type { VisualizationSpec } from "@microsoft/fabric-visuals";
import type { ColumnMetadataMap } from "@/lib/to-data-table";
import query from "./monthly-trend.dax?raw";
import vegaLiteSpec from "./monthly-trend.json";

const connection = "aca";

const columnMetadata: ColumnMetadataMap = {
  "dim_month[YearMonth]": {
    name: "YearMonth",
    displayName: "Mes",
  },
  "[Effective Cost]": {
    name: "Effective Cost",
    displayName: "Costo efectivo",
    format: "#,##0.00",
  },
};

export function monthlyTrend() {
  return {
    connection,
    query,
    columnMetadata,
    vegaLiteSpec: vegaLiteSpec as VisualizationSpec,
  };
}
