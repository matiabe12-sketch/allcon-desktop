"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { bridgeRatings, type BridgeRating } from "@/app/actions/bridge";
import { cn } from "@/lib/utils";

// The workspace's Load rating tab: the bridge's rated designs (its girders) by LRFR (MBE 6A with the CDOT Bridge Rating
// Manual), each vehicle's rating factor and tons for every girder group, the HL-93 factors, the posting and the overload
// color code, and the bridge's rating: the lowest of its girders. Each design's "Load rating (LRFR)" section sets its
// ADTT, route and condition.

type Rated = BridgeRating & { rating: NonNullable<BridgeRating["rating"]> };
const LEVEL: Record<string, string> = { legal: "Legal", su: "Specialized hauling", ev: "Emergency", permit: "Permit" };
const trunc2 = (v: number) => (Math.floor(v * 100 + 1e-9) / 100).toFixed(2);
const at = (a: { girder: string; span: number; x: number; limit: string; at?: string }) => (a.at ? `${a.at}: ${a.limit.toLowerCase()}` : `${a.girder}, span ${a.span + 1}, ${a.x.toFixed(1)} ft: ${a.limit.toLowerCase()}`);

export function RatingPanel({ bridgeId, saved }: { bridgeId: string; saved: boolean }) {
  const [rows, setRows] = useState<BridgeRating[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    bridgeRatings(bridgeId)
      .then((r) => live && (setRows(r), setError(null)))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not rate the bridge"));
    return () => {
      live = false;
    };
  }, [bridgeId, version, saved]);

  if (error) return <p className="p-3 text-xs text-destructive">{error}</p>;
  if (!rows)
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Rating the girders
      </div>
    );
  if (!rows.length) return <p className="p-3 text-xs text-muted-foreground">No girder design is linked yet: start the girders in the Design tab, and their load rating shows here.</p>;
  const rated = rows.filter((r): r is Rated => !!r.rating);
  const lowest = <T,>(f: (r: Rated) => T, key: (t: T) => number) => rated.reduce((a, b) => (key(f(b)) < key(f(a)) ? b : a));
  const vehicles = rated[0]?.rating.ratings.map((v) => v.name) ?? [];

  return (
    <div className="space-y-3 p-3 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <p className="text-sm font-semibold">Load rating (LRFR)</p>
        <span className="text-muted-foreground">MBE 6A with the CDOT Bridge Rating Manual, the BRM governing where they differ</span>
        <button type="button" onClick={() => setVersion((v) => v + 1)} className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-accent">
          <RefreshCw className="size-3" /> Rate again
        </button>
      </div>

      {rated.length > 0 &&
        (() => {
          const inv = lowest((r) => r.rating.hl93.inventory, (a) => a.rf);
          const op = lowest((r) => r.rating.hl93.operating, (a) => a.rf);
          const permit = lowest((r) => r.rating.color, (c) => c.permitTons);
          const posting = rated.some((r) => r.rating.needsPosting);
          return (
            <div className="grid gap-2 sm:grid-cols-4">
              <Tile label="HL-93 inventory (RF)" value={trunc2(inv.rating.hl93.inventory.rf)} bad={inv.rating.hl93.inventory.rf < 1} note={inv.name} />
              <Tile label="HL-93 operating (RF)" value={trunc2(op.rating.hl93.operating.rf)} bad={op.rating.hl93.operating.rf < 1} note={op.name} />
              <Tile label="Overload color code (BRM 1.16)" value={permit.rating.color.code} bad={permit.rating.color.code !== "White"} note={`CO Permit ${permit.rating.color.permitTons.toFixed(1)} T, Modified Tandem ${permit.rating.color.tandemTons.toFixed(1)} T`} />
              <Tile label="Posting (BRM 1.15)" value={posting ? "Needed" : "None"} bad={posting} note="The lowest legal load of every girder group" />
            </div>
          );
        })()}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Vehicle</th>
              <th className="px-2 font-medium">Level</th>
              {rated.map((r) => (
                <th key={r.id} className="px-2 text-right font-medium" title={r.tool}>
                  {r.target === "girders" ? "Girders" : r.target === "slab" ? "Slab" : r.target.replace("girders-", "Girders, group ")}
                  <span className="block font-normal">RF · tons</span>
                </th>
              ))}
              <th className="px-2 text-right font-medium">Bridge</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2">HL-93 inventory</td>
              <td className="px-2 text-muted-foreground">Design</td>
              {rated.map((r) => (
                <td key={r.id} className={cn("px-2 text-right tabular-nums", r.rating.hl93.inventory.rf < 1 && "text-red-600")} title={at(r.rating.hl93.inventory)}>
                  {trunc2(r.rating.hl93.inventory.rf)}
                </td>
              ))}
              <td className="px-2 text-right font-medium tabular-nums">{rated.length ? trunc2(Math.min(...rated.map((r) => r.rating.hl93.inventory.rf))) : "—"}</td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2">HL-93 operating</td>
              <td className="px-2 text-muted-foreground">Design</td>
              {rated.map((r) => (
                <td key={r.id} className={cn("px-2 text-right tabular-nums", r.rating.hl93.operating.rf < 1 && "text-red-600")} title={at(r.rating.hl93.operating)}>
                  {trunc2(r.rating.hl93.operating.rf)}
                </td>
              ))}
              <td className="px-2 text-right font-medium tabular-nums">{rated.length ? trunc2(Math.min(...rated.map((r) => r.rating.hl93.operating.rf))) : "—"}</td>
            </tr>
            {vehicles.map((name) => {
              const of = rated.map((r) => r.rating.ratings.find((v) => v.name === name));
              const lowestV = of.reduce((a, b) => (b && (!a || b.rf.rf < a.rf.rf) ? b : a), undefined as (typeof of)[number]);
              return (
                <tr key={name} className="border-b border-border/40">
                  <td className="py-1 pr-2">{name}</td>
                  <td className="px-2 text-muted-foreground">{LEVEL[of[0]?.level ?? ""] ?? ""}</td>
                  {of.map((v, k) => (
                    <td key={rated[k].id} className={cn("px-2 text-right tabular-nums", v && v.rf.rf < 1 && "text-red-600")} title={v ? `${at(v.rf)}; γL ${v.gammaL.toFixed(2)}` : undefined}>
                      {v ? `${trunc2(v.rf.rf)} · ${v.ratingTons === null ? "—" : v.ratingTons.toFixed(1)}` : "—"}
                    </td>
                  ))}
                  <td className="px-2 text-right font-medium tabular-nums">{lowestV ? `${lowestV.ratingTons === null ? "—" : lowestV.ratingTons.toFixed(1)} T` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {rated.map((r) => (
          <div key={r.id} className="rounded-md border px-3 py-2">
            <p className="flex items-center gap-1 font-medium">
              <Link href={`/design/${r.id}`} target="_blank" className="inline-flex items-center gap-1 text-primary hover:underline">
                {r.name} <ExternalLink className="size-3" />
              </Link>
              <span className="font-normal text-muted-foreground">· {r.tool}</span>
            </p>
            <p className="text-muted-foreground">
              {r.rating.settings.route === "interstate" ? "Interstate" : "Colorado"} legal trucks · ADTT {r.rating.settings.adtt ?? "unknown"} · condition {r.rating.settings.condition} (φc·φs {r.rating.factors.phiCS.toFixed(2)}) · legal γL {r.rating.factors.gLegal.toFixed(2)} · {r.rating.settings.lanes === "multi" ? "multi-lane" : "one lane"}
            </p>
            <p>HL-93 inventory controls at {at(r.rating.hl93.inventory)}.</p>
            <p className={r.rating.needsPosting ? "text-red-600" : ""}>
              Posting:{" "}
              {r.rating.posting
                .filter((p) => p.action !== "not used on this route")
                .map((p) => `${p.name} ${p.tons.toFixed(1)} T (${p.action})`)
                .join("; ")}
            </p>
            <p>
              Color code {r.rating.color.code}: CO Permit {r.rating.color.permitTons.toFixed(1)} T, Modified Tandem {r.rating.color.tandemTons.toFixed(1)} T (interior girders)
            </p>
          </div>
        ))}
        {rows
          .filter((r) => !r.rating)
          .map((r) => (
            <div key={r.id} className="rounded-md border border-destructive/40 px-3 py-2 text-destructive">
              {r.name}: {r.error}
            </div>
          ))}
      </div>
      <p className="text-muted-foreground">
        Each girder design rates itself from its own capacities, dead loads, distribution factors and stresses; open it to change its ADTT, route, condition or the other settings in its &ldquo;Load rating (LRFR)&rdquo; section, and its calc package has the rating worked out. Hover a value for where it controls. Ratings in tons are truncated to tenths, rating factors to hundredths (BRM 1.14).
      </p>
    </div>
  );
}

function Tile({ label, value, bad, note }: { label: string; value: string; bad: boolean; note: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", bad && "text-red-600")}>{value}</p>
      <p className="truncate text-muted-foreground" title={note}>
        {note}
      </p>
    </div>
  );
}
