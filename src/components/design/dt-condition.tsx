"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NO_UNIT_CONDITION, needsPosting, type DtCondition, type DtRating, type DtUnitCondition } from "@/lib/design/rating/double-tee";
import { conditionTags, type ConditionTag, type SiaConditionData } from "@/lib/design/rating/sia";
import { cn } from "@/lib/utils";
import { Field, Toggle } from "./design-kit";

// The inspection's findings (MBE 6.1.2): each damaged unit's strands, top and judgment factor, and the
// joints. The back-calculation stays on the intact bridge; only the rating sees these.

const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "—");

const TAG_LABEL: Record<ConditionTag, string> = { strands: "strands", joints: "joints", impact: "impact", concrete: "section loss", cracks: "cracks" };
const KEY_TAGS = new Set<ConditionTag>(["strands", "joints", "impact"]);

function Tags({ tags }: { tags: ConditionTag[] }) {
  if (!tags.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {tags.map((t) => (
        <span key={t} className={cn("rounded px-1 text-[10px] leading-4", KEY_TAGS.has(t) ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200" : "bg-muted text-muted-foreground")}>
          {TAG_LABEL[t]}
        </span>
      ))}
    </span>
  );
}

/** The SIA's element table, notes and maintenance items beside the condition inputs: the inspector's words, never applied. */
function SiaPrompts({ data, unitCount, hasDeck, onClear }: { data: SiaConditionData; unitCount: number; hasDeck: boolean; onClear: () => void }) {
  return (
    <div className="space-y-2 rounded-md border border-dashed p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">
          From the {data.source || "SIA"}, inspected {data.date || "(no date)"}
        </p>
        <Button size="icon-xs" variant="ghost" aria-label="Remove the SIA findings" title="Remove the SIA findings" onClick={onClear}>
          <Trash2 />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The inspector&apos;s words, not applied. Enter only what they state. Condition-state quantities say how much is damaged, not which strands, and a crack or seam over a joint doesn&apos;t by itself show the joint has failed. The tags only point at notes to read.
        {hasDeck ? " This bridge has a composite deck, which ties the units together: the joints-failed switch is for units without one." : ""}
      </p>
      {data.notes.map((n, k) => (
        <p key={k}>
          <span className="text-muted-foreground">{n.label}: </span>
          {n.text}
        </p>
      ))}
      {data.notes.some((n) => /named|labeled|lettered/i.test(n.text)) && (
        <p className="text-[11px] text-muted-foreground">The SIA letters girder lines; with stems lettered, two letters make a unit ({unitCount} units). Match them to G1–G{unitCount} on the sketch.</p>
      )}
      {data.elements.map((e) => (
        <details key={e.code} open={e.code === 104 || e.code === 109 || e.code === 115} className="rounded border px-2 py-1">
          <summary className="cursor-pointer select-none">
            <span className="font-medium">
              {e.code} {e.name}
            </span>{" "}
            <span className="text-muted-foreground tabular-nums">
              {e.total} {e.unit}: CS1 {e.cs[0]} · CS2 {e.cs[1]} · CS3 {e.cs[2]} · CS4 {e.cs[3]}
            </span>
          </summary>
          {e.defects.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-muted-foreground tabular-nums">
              {e.defects.map((d) => (
                <li key={d.code}>
                  {d.code} {d.name}: CS1 {d.cs[0]} · CS2 {d.cs[1]} · CS3 {d.cs[2]} · CS4 {d.cs[3]}
                  {d.code === 1100 && <Tags tags={["strands"]} />}
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {e.notes.map((n, k) => (
              <li key={k}>
                {n}
                <Tags tags={conditionTags(n, e.code)} />
              </li>
            ))}
          </ul>
        </details>
      ))}
      {data.work.length > 0 && (
        <details className="rounded border px-2 py-1">
          <summary className="cursor-pointer select-none font-medium">Maintenance items ({data.work.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {data.work.map((w, k) => (
              <li key={k}>
                {w}
                <Tags tags={conditionTags(w)} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function ConditionInputs({
  value,
  onChange,
  unitCount,
  span,
  sia,
  hasDeck,
  onClearSia,
}: {
  value: DtCondition;
  onChange: (c: DtCondition) => void;
  unitCount: number;
  span: number;
  sia: SiaConditionData | null;
  hasDeck: boolean;
  onClearSia: () => void;
}) {
  const set = (k: number, patch: Partial<DtUnitCondition>) => onChange({ ...value, units: value.units.map((u, j) => (j === k ? { ...u, ...patch } : u)) });
  const next = () => {
    const used = new Set(value.units.map((u) => u.unit));
    for (let n = 1; n <= unitCount; n++) if (!used.has(n)) return n;
    return 1;
  };
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Rated on the section as inspected (MBE 6.1.2). The strands are still back-calculated on the intact bridge, since the original design had no damage.
      </p>
      {sia ? (
        <SiaPrompts data={sia} unitCount={unitCount} hasDeck={hasDeck} onClear={onClearSia} />
      ) : (
        <p className="text-[11px] text-muted-foreground">Read the SIA (above) to see its element conditions, notes and maintenance items here.</p>
      )}
      {hasDeck && value.jointsFailed && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">This bridge has a composite deck, which ties the units together. Check that the inspection shows the units moving apart before rating them alone.</p>
      )}
      <Toggle label="Joints (shear keys) failed: each unit carries the wheels on it" value={value.jointsFailed} onChange={(v) => onChange({ ...value, jointsFailed: v })} />
      {value.jointsFailed && (
        <label className="block py-0.5 text-xs">
          <span className="text-muted-foreground">What the inspection found at the joints</span>
          <textarea value={value.jointsNote} onChange={(e) => onChange({ ...value, jointsNote: e.target.value })} rows={2} placeholder="e.g. reflective cracking along every joint; units deflect separately" className="mt-1 w-full rounded-md border border-input bg-transparent p-2 text-xs" />
        </label>
      )}
      {value.units.map((c, k) => (
        <div key={k} className="space-y-0.5 rounded-md border p-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <label className="flex items-center gap-2">
              <span className="font-medium">Unit</span>
              <select value={c.unit} onChange={(e) => set(k, { unit: +e.target.value })} className="h-7 rounded-md border border-input bg-transparent px-1">
                {Array.from({ length: unitCount }, (_, j) => j + 1).map((n) => (
                  <option key={n} value={n}>
                    G{n}
                  </option>
                ))}
              </select>
            </label>
            <Button size="icon-xs" variant="ghost" aria-label="Remove this unit's condition" onClick={() => onChange({ ...value, units: value.units.filter((_, j) => j !== k) })}>
              <Trash2 />
            </Button>
          </div>
          <Field label="Broken or missing strands" value={c.lostStrands} onChange={(v) => set(k, { lostStrands: Math.max(0, v) })} />
          <Field label="Exposed strands with section loss" value={c.corrodedStrands} onChange={(v) => set(k, { corrodedStrands: Math.max(0, v) })} />
          {c.corrodedStrands > 0 && <Field label="Their area lost" unit="%" value={c.areaLoss} onChange={(v) => set(k, { areaLoss: Math.min(100, Math.max(0, v)) })} />}
          <Field label="Lost from the top (spalls, delamination)" unit="in" value={c.topLoss} onChange={(v) => set(k, { topLoss: Math.max(0, v) })} step={0.25} />
          <Toggle label="Over part of the span only" value={!!c.zone} onChange={(v) => set(k, { zone: v ? { from: span * 0.4, to: span * 0.6 } : null })} />
          {c.zone && (
            <>
              <Field label="From, along the span" unit="ft" value={c.zone.from} onChange={(v) => set(k, { zone: { ...c.zone!, from: v } })} step={0.5} />
              <Field label="To" unit="ft" value={c.zone.to} onChange={(v) => set(k, { zone: { ...c.zone!, to: v } })} step={0.5} />
              <p className="text-[11px] text-muted-foreground">The strands count as lost a development length past each end too (SSHB 9.28).</p>
            </>
          )}
          <Field label="Judgment factor on the capacity" value={c.factor} onChange={(v) => set(k, { factor: Math.min(1, Math.max(0, v)) })} step={0.05} hint="1: none. Only for damage that can't be measured; give the reason." />
          <label className="block py-0.5 text-xs">
            <span className={cn("text-muted-foreground", c.factor < 1 && !c.note.trim() && "text-red-600")}>What the inspection found{c.factor < 1 ? " (needed with a factor)" : ""}</span>
            <textarea value={c.note} onChange={(e) => set(k, { note: e.target.value })} rows={2} placeholder="e.g. impact damage, 2 strands exposed and broken, 3 ft long spall at midspan" className="mt-1 w-full rounded-md border border-input bg-transparent p-2 text-xs" />
          </label>
        </div>
      ))}
      {value.units.length < unitCount && (
        <Button size="xs" variant="outline" onClick={() => onChange({ ...value, units: [...value.units, { unit: next(), ...NO_UNIT_CONDITION }] })}>
          <Plus /> Damaged unit
        </Button>
      )}
    </div>
  );
}

/** As designed beside as inspected: what the findings cost, vehicle by vehicle, and each damaged unit's Mn. */
export function ConditionResults({ r }: { r: DtRating }) {
  const c = r.condition;
  if (!c.active || !c.asDesigned) return null;
  return (
    <Card>
      <CardContent className="overflow-x-auto py-2 text-xs">
        <p className="pb-1 font-semibold">Condition: as designed and as inspected (MBE 6.1.2)</p>
        {c.alone && <p className="pb-1 text-muted-foreground">Joints failed: each unit carries the wheels on it (a hinge at every joint), in place of the distribution of the original design.</p>}
        <table className="w-full">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 font-normal">Vehicle</th>
              <th className="text-right font-normal">Designed inv</th>
              <th className="text-right font-normal">Inspected inv</th>
              <th className="pl-3 text-right font-normal">Designed opr</th>
              <th className="text-right font-normal">Inspected opr</th>
              <th className="pl-3 text-right font-normal">Change</th>
              <th className="pl-3 font-normal">Posting, inspected</th>
            </tr>
          </thead>
          <tbody>
            {r.ratings.map((v, k) => {
              const d = c.asDesigned![k];
              const ch = v.govOpr.opr.opr / d.opr - 1;
              return (
                <tr key={v.name} className="border-b border-border/40">
                  <td className="py-0.5 whitespace-nowrap">{v.name}</td>
                  <td className="text-right tabular-nums">{f3(d.inv)}</td>
                  <td className="text-right tabular-nums">{f3(v.govInv.inv.inv)}</td>
                  <td className="pl-3 text-right tabular-nums">{f3(d.opr)}</td>
                  <td className="text-right tabular-nums">{f3(v.govOpr.opr.opr)}</td>
                  <td className="pl-3 text-right tabular-nums">{Number.isFinite(ch) ? `${(ch * 100).toFixed(1)}%` : "—"}</td>
                  <td className={cn("pl-3", needsPosting(v.posting) ? "font-medium text-red-600" : "text-muted-foreground")}>{v.posting}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {c.units.length > 0 && (
          <table className="mt-3 w-full">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1 font-normal">Unit</th>
                <th className="text-right font-normal">at, ft</th>
                <th className="text-right font-normal">A*s intact, in²</th>
                <th className="text-right font-normal">A*s left</th>
                <th className="text-right font-normal">Mn intact, kip·ft</th>
                <th className="text-right font-normal">Mn inspected</th>
              </tr>
            </thead>
            <tbody>
              {c.units.map((u) => (
                <tr key={u.unit} className="border-b border-border/40" title={u.note}>
                  <td className="py-0.5">{u.g}</td>
                  <td className="text-right tabular-nums">{u.at.toFixed(2)}</td>
                  <td className="text-right tabular-nums">{f3(u.intact.As)}</td>
                  <td className="text-right tabular-nums">{f3(u.inspected.As)}</td>
                  <td className="text-right tabular-nums">{u.intact.Mn.toFixed(1)}</td>
                  <td className="text-right tabular-nums">
                    {u.inspected.Mn.toFixed(1)}
                    {u.inspected.factor < 1 ? ` (× ${u.inspected.factor})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
