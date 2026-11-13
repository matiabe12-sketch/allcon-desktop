"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { bridgeAgency, bridgeDesignStatus, createBridgeDesign, setBridgeAgency, updateBridgeDesigns, type BridgeDesignStatus, type SyncRow } from "@/app/actions/bridge";
import type { BridgeDefinition, DesignLink } from "@/lib/bridge/definition";
import { designTargets } from "@/lib/bridge/design-links";
import { cn } from "@/lib/utils";

// The bridge's parts and their designs: each part that has a design tool, what the design takes
// from the model, and the design started for it with whether its checks pass. A design opens in
// the Design section, where it's an ordinary design with the bridge's values filled in.

export function DesignPanel({ bridgeId, def, saved, onLinks }: { bridgeId: string; def: BridgeDefinition; /** The bridge as shown is saved (a design is started from the saved bridge). */ saved: boolean; onLinks: (links: DesignLink[]) => void }) {
  const [status, setStatus] = useState<BridgeDesignStatus[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<SyncRow[] | null>(null);
  const [agency, setAgency] = useState<"cdot" | null | undefined>(undefined);
  useEffect(() => {
    bridgeAgency()
      .then(setAgency)
      .catch(() => setAgency(null));
  }, []);
  const chooseAgency = async (a: "cdot" | null) => {
    setAgency(a);
    try {
      await setBridgeAgency(a);
      toast.success(a === "cdot" ? "New girder designs take CDOT's criteria" : "New designs follow AASHTO LRFD alone");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the rules");
    }
  };
  const links = def.designs;
  /** The load path: every linked design brought up to date from the bridge (and the missing ones made, with `create`). */
  const update = async (create: boolean) => {
    setBusy(create ? "create" : "update");
    try {
      const r = await updateBridgeDesigns(bridgeId, create);
      onLinks(r.designs);
      setReport(r.rows);
      const changed = r.rows.filter((x) => x.action === "updated" || x.action === "created").length;
      toast.success(changed ? `${changed} design${changed > 1 ? "s" : ""} updated from the bridge` : "The linked designs were already up to date");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the designs");
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    let live = true;
    bridgeDesignStatus(bridgeId)
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus([]));
    return () => {
      live = false;
    };
  }, [bridgeId, links]);
  const start = async (key: string) => {
    setBusy(key);
    try {
      const r = await createBridgeDesign(bridgeId, key);
      onLinks(r.designs);
      toast.success("Design started with the bridge's values", { action: { label: "Open", onClick: () => window.open(`/design/${r.designId}`, "_blank") } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the design");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-2 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!!busy || !saved} onClick={() => void update(false)} className="inline-flex items-center gap-1 rounded border px-2 py-1 font-medium hover:bg-accent disabled:opacity-50" title="Each linked design's inputs brought up to date from the bridge, top to bottom: girders, deck, bearings, abutments, approach slabs, wingwalls, pier caps, columns, foundations">
          {busy === "update" ? <Loader2 className="size-3 animate-spin" /> : <ArrowDownToLine className="size-3" />} Update linked designs
        </button>
        <button type="button" disabled={!!busy || !saved} onClick={() => void update(true)} className="inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-accent disabled:opacity-50" title="The same, and a design made for every part that has none">
          {busy === "create" ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} Also make the missing ones
        </button>
        <label className="ml-auto inline-flex items-center gap-1">
          <span className="text-muted-foreground">Rules</span>
          <select value={agency ?? ""} disabled={agency === undefined} onChange={(e) => void chooseAgency(e.target.value === "cdot" ? "cdot" : null)} className="h-6 rounded border bg-transparent px-1" title="Your setting: new girder designs take CDOT's amendments to AASHTO LRFD (Bridge Design Manual), or AASHTO alone">
            <option value="">AASHTO LRFD</option>
            <option value="cdot">AASHTO LRFD with CDOT&apos;s amendments</option>
          </select>
        </label>
        <span className="w-full text-muted-foreground">The loads go down the load path: girders&apos; reactions to the abutments and caps, the caps&apos; model to the columns, the columns&apos; base forces to the foundations.</span>
      </div>
      {report && (
        <table className="w-full rounded border">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-2 py-1 font-medium">Part</th>
              <th className="px-2 font-medium">Design</th>
              <th className="px-2 font-medium">Done</th>
              <th className="px-2 font-medium">What changed</th>
              <th className="px-2 font-medium">Checks</th>
            </tr>
          </thead>
          <tbody>
            {report.map((r) => (
              <tr key={r.key} className="border-b border-border/40 align-top">
                <td className="px-2 py-1 font-medium">{r.component}</td>
                <td className="px-2">{r.designId ? <Link href={`/design/${r.designId}`} target="_blank" className="text-primary hover:underline">{r.name}</Link> : <span className="text-muted-foreground">none</span>}</td>
                <td className="px-2">{r.action}</td>
                <td className="px-2 text-muted-foreground">{r.changes.length ? r.changes.slice(0, 6).join(", ") + (r.changes.length > 6 ? ` and ${r.changes.length - 6} more` : "") : "—"}</td>
                <td className={cn("px-2", /fail|can't|couldn't|needed/.test(r.verdict) ? "text-red-600" : "text-emerald-600")}>{r.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Part</th>
            <th className="px-2 font-medium">Design tool</th>
            <th className="px-2 font-medium">Taken from the model</th>
            <th className="px-2 font-medium">Design</th>
            <th className="px-2 font-medium">Checks</th>
            <th className="w-32 pl-2" />
          </tr>
        </thead>
        <tbody>
          {designTargets(def).map((t) => {
            const link = links.find((l) => l.target === t.key);
            const s = link ? status?.find((x) => x.id === link.id) : undefined;
            const gone = !!link && !!status && !s;
            return (
              <tr key={t.key} className="border-b border-border/40">
                <td className="py-1 pr-2 font-medium">{t.label}</td>
                <td className="px-2">{t.tool}</td>
                <td className="px-2 text-muted-foreground">{t.from}</td>
                <td className="px-2">
                  {s ? (
                    <Link href={`/design/${s.id}`} target="_blank" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {s.name} <ExternalLink className="size-3" />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{gone ? "Deleted" : link && !status ? "…" : "Not started"}</span>
                  )}
                </td>
                <td className={cn("px-2 font-medium", s?.ok === true ? "text-emerald-600" : s?.ok === false ? "text-red-600" : "text-muted-foreground")}>{s ? (s.ok === true ? "Pass" : s.ok === false ? "Fail" : "Can't be worked out") : "—"}</td>
                <td className="pl-2 text-right">
                  <button type="button" disabled={!!busy || !saved} onClick={() => void start(t.key)} title={saved ? undefined : "Saving the bridge first"} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-accent disabled:opacity-50">
                    {busy === t.key ? <Loader2 className="size-3 animate-spin" /> : s ? <RefreshCw className="size-3" /> : <Plus className="size-3" />}
                    {s ? "Start again" : "Start design"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-muted-foreground">
        A design starts with the bridge&apos;s geometry and the forces from this analysis filled in, and is then an ordinary design: its own checks and calc package, edited in Design. It doesn&apos;t follow later changes to the bridge: &ldquo;Start again&rdquo; makes a new one
        from the bridge as it is now. The girder check does its own line-girder analysis with AASHTO&apos;s distribution factors, to compare with this model&apos;s. The abutments, approach slabs, wingwalls, pier caps and foundations take their loads down the load path (&ldquo;Update linked designs&rdquo; keeps them all in step).
      </p>
    </div>
  );
}
