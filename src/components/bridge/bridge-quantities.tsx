"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { bridgeQuantitiesFor } from "@/app/actions/bridge";

// The bridge's summary of quantities in the workspace: a row per pay item, a column per part of the
// bridge (superstructure, each support, the approach slabs) and the total, as the calc package's Part 3
// gives it. Read from the saved bridge and its linked designs, again after each save and on "Refresh" (a new `version`).

type Quantities = Awaited<ReturnType<typeof bridgeQuantitiesFor>>;

const th = "px-2 py-1 text-right font-medium";
const td = "px-2 py-0.5 text-right";
/** Concrete to 0.1 CY, everything else whole (bars are already to 10 LB); blank for none. */
const qty = (unit: string, v: number) => (v === 0 ? "" : unit === "CY" ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v).toLocaleString("en-US"));

export function QuantitiesPanel({ bridgeId, version, saved }: { bridgeId: string; version: number; saved: boolean }) {
  const [state, setState] = useState<{ version: number; data?: Quantities; error?: string } | null>(null);
  useEffect(() => {
    if (!saved) return;
    let live = true;
    bridgeQuantitiesFor(bridgeId)
      .then((data) => live && setState({ version, data }))
      .catch((e) => live && setState({ version, error: e instanceof Error ? e.message : "Could not read the quantities" }));
    return () => {
      live = false;
    };
  }, [bridgeId, version, saved]);

  if (!state || state.version !== version)
    return (
      <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> {saved ? "Reading the linked designs’ quantities" : "Saving the bridge first"}
      </p>
    );
  if (state.error) return <p className="p-3 text-xs text-destructive">{state.error}</p>;
  const { columns, rows, missing } = state.data!;

  return (
    <div className="space-y-2 p-3 text-xs">
      <p className="text-muted-foreground">
        Summary of quantities under the pay items, from the linked designs: concrete to 0.1 CY, reinforcing steel to 10 LB, the rest whole. Each design&apos;s own tabulation is in its calc and in the calc package.
      </p>
      {missing.length > 0 && <p className="text-amber-700 dark:text-amber-400">Not counted (no linked design): {missing.join("; ")}.</p>}
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No quantities yet: link designs to the bridge under Design.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full tabular-nums">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-1 pr-2 text-left font-medium">Item</th>
                <th className="px-2 text-left font-medium">Description</th>
                <th className="px-2 text-left font-medium">Unit</th>
                {columns.map((c) => (
                  <th key={c} className={th}>
                    {c}
                  </th>
                ))}
                <th className={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b border-border/40">
                  <td className="py-0.5 pr-2 whitespace-nowrap">{r.code}</td>
                  <td className="px-2">{r.description}</td>
                  <td className="px-2">{r.unit}</td>
                  {r.values.map((v, k) => (
                    <td key={k} className={td}>
                      {qty(r.unit, v)}
                    </td>
                  ))}
                  <td className={`${td} font-medium`}>{qty(r.unit, r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
