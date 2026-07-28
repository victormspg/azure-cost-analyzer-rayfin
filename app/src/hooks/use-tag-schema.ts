//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useMemo } from "react";

import { tagSchemaDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";

/** One discovered tag key: its original Azure key, friendly display, and WIDE column name. */
export interface TagColumn {
  /** Original (normalized, lower-case) Azure tag key — used for write-back. */
  key: string;
  /** Friendly display label (e.g. "Cost Center"). */
  display: string;
  /** Sanitized PascalCase column on gold_chargeback_by_tag (e.g. "CostCenter"). */
  column: string;
  /** Rank by cost (1 = most expensive). */
  rank: number;
}

/**
 * How many tag keys the app surfaces (Chargeback group-by, Action Center governance, Tag form).
 * The model/tables keep ALL discovered tags; the app caps to the top-N by cost so high-cardinality
 * / ephemeral tags (e.g. Databricks `jobid`, `notebookid`, `clusterid`) don't flood the UI or make
 * governance ("missing tags") meaningless.
 */
export const DEFAULT_TAG_LIMIT = 8;

/**
 * The customer's tag universe, read at runtime from `dim_tag_key`. Drives every tag-aware view
 * (Chargeback grouping, Action Center governance, the inline Tag form) so the app works against
 * ANY set of tag keys — the synthetic demo model AND a customer's real FOCUS export.
 *
 * `columns` is capped to the top `limit` tags by cost; `allColumns` is the full ranked universe
 * (for a future "show more" affordance).
 */
export function useTagSchema(limit: number = DEFAULT_TAG_LIMIT): {
  columns: TagColumn[];
  allColumns: TagColumn[];
  isLoading: boolean;
  error?: Error;
} {
  const query = useMemo(() => tagSchemaDax(), []);
  const { data, isLoading, error } = useSemanticModelQuery({ connection: "aca", query });

  const allColumns = useMemo<TagColumn[]>(() => {
    if (data?.status !== "success") return [];
    return (data.table.rows as unknown as [string, string, string, number][])
      .map(([key, display, column, rank]) => ({
        key,
        display: display || key,
        column,
        rank: rank ?? 0,
      }))
      .filter((c) => c.column)
      .sort((a, b) => a.rank - b.rank);
  }, [data]);

  const columns = useMemo(
    () => (limit > 0 ? allColumns.slice(0, limit) : allColumns),
    [allColumns, limit]
  );

  return { columns, allColumns, isLoading, error };
}
