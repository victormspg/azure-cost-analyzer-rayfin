//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useMemo } from "react";

import { tagValuesDax } from "@/queries/cfo/builders";
import { useSemanticModelQuery } from "@/hooks/use-semantic-model-query";

/**
 * Distinct values present in the model for each (dynamic) tag column, keyed by column name.
 * Feeds the tag editor's dropdowns (list of existing values) while still allowing free text.
 */
export function useTagValues(tagColumns: string[]): Record<string, string[]> {
  const key = tagColumns.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(() => tagValuesDax(tagColumns), [key]);
  const { data } = useSemanticModelQuery({ connection: "aca", query });

  return useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of tagColumns) out[c] = [];
    if (data?.status === "success") {
      for (const [col, val] of data.table.rows as unknown as [string, string][]) {
        if (!val || val === "Untagged") continue;
        if (out[col]) out[col].push(val);
      }
      for (const c of Object.keys(out)) {
        out[c] = Array.from(new Set(out[c])).sort((a, b) => a.localeCompare(b));
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, key]);
}
