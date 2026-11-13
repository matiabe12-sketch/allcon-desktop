"use client";

import { useMemo } from "react";
import { Plus, X } from "lucide-react";
import { Choice, Field } from "@/components/design/design-kit";
import { BridgePlan, BridgeProfile } from "@/components/design/bridge-sketch";
import type { BridgeDefinition } from "@/lib/bridge/definition";
import { geometryOf, SUPPORT_TYPES, toBridgeInputs, withGeometry, type BridgeGeometry } from "@/lib/bridge/geometry";
import { bearingText, stationText } from "@/lib/design/bridge/alignment";
import { bridgeLayout, type Support } from "@/lib/design/bridge/bridge";

// The bridge's geometry in the properties panel (geometry.ts): the alignment, the profile, the roadway
// section with the bridge line, edges, slab offset and rail, and each support at its station. An edit
// sets the geometry (a bridge without one gets it, from its spans) and the spans follow the stations.

export type GeometryFormKey = "alignment" | "profile" | "roadway" | "supports";
type Props = { def: BridgeDefinition; setDef: (update: (d: BridgeDefinition) => BridgeDefinition) => void };

const note = (text: string) => <p className="py-1 text-[11px] leading-snug text-muted-foreground">{text}</p>;

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid grid-cols-[1fr_7rem] items-center gap-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="h-7 rounded-md border border-input bg-transparent px-1.5" />
    </label>
  );
}

/** A list of like items (curves, sections): each with its fields, removable; one more added from `blank`. */
function Items<T>({ title, items, blank, onChange, render, empty }: { title: string; items: T[]; blank: () => T; onChange: (v: T[]) => void; render: (item: T, set: (v: T) => void) => React.ReactNode; empty: string }) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between py-1 text-xs font-medium">
        <span>{title}</span>
        <button type="button" className="flex items-center gap-0.5 text-[11px] text-primary hover:underline" onClick={() => onChange([...items, blank()])}>
          <Plus className="size-3" /> Add
        </button>
      </div>
      {!items.length && note(empty)}
      {items.map((it, k) => (
        <div key={k} className="relative mb-1.5 rounded-md border p-1.5 pr-6">
          <button type="button" aria-label={`Remove ${title.toLowerCase()} ${k + 1}`} className="absolute top-1 right-1 text-muted-foreground hover:text-foreground" onClick={() => onChange(items.filter((_, j) => j !== k))}>
            <X className="size-3.5" />
          </button>
          {render(it, (v) => onChange(items.map((x, j) => (j === k ? v : x))))}
        </div>
      ))}
    </div>
  );
}

/** The bridge's plan or profile, as the Bridge design drew them. */
function Sketch({ def, kind }: { def: BridgeDefinition; kind: "plan" | "profile" }) {
  const view = useMemo(() => {
    try {
      const b = toBridgeInputs(def);
      return { b, lay: bridgeLayout(b) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "The bridge can't be laid out." };
    }
  }, [def]);
  if ("error" in view) return <p className="py-1 text-[11px] text-destructive">{view.error}</p>;
  return <div className="mt-2 overflow-hidden rounded-md border bg-background">{kind === "plan" ? <BridgePlan b={view.b} lay={view.lay} /> : <BridgeProfile b={view.b} lay={view.lay} />}</div>;
}

const RAILS = [
  { value: "custom", label: "Barrier (Loads)" },
  { value: "type9-4", label: "CDOT Type 9 (#4)" },
  { value: "type9-3", label: "CDOT Type 9 (#3)" },
  { value: "type10-mash", label: "CDOT Type 10 MASH" },
] as const;

export function GeometryForm({ form, def, setDef }: Props & { form: GeometryFormKey }) {
  const g = geometryOf(def);
  const setGeo = (update: (g: BridgeGeometry) => BridgeGeometry) => setDef((s) => withGeometry(s, update(geometryOf(s))));
  const al = g.alignment;
  const pr = g.profile;
  const rw = g.roadway;
  const n = g.supports.length;
  const mid = g.supports[Math.floor(n / 2)].station;

  if (form === "alignment")
    return (
      <>
        {!def.geometry && note("Worked out from the spans: a straight alignment, the first abutment at station 0+00. Change anything here to put the bridge on its real alignment.")}
        <Field label="Reference station" unit="ft" value={al.refStation} onChange={(v) => setGeo((x) => ({ ...x, alignment: { ...x.alignment, refStation: v } }))} step={10} hint={stationText(al.refStation)} />
        <Field label="Northing" unit="ft" value={al.northing} onChange={(v) => setGeo((x) => ({ ...x, alignment: { ...x.alignment, northing: v } }))} step={10} />
        <Field label="Easting" unit="ft" value={al.easting} onChange={(v) => setGeo((x) => ({ ...x, alignment: { ...x.alignment, easting: v } }))} step={10} />
        <Field label="Back tangent's azimuth" unit="°" value={al.azimuth} onChange={(v) => setGeo((x) => ({ ...x, alignment: { ...x.alignment, azimuth: v } }))} step={0.0001} hint={`${bearingText(al.azimuth)}: clockwise from north, 90 due east`} />
        <Items
          title="Horizontal curves"
          items={al.curves}
          empty="None: a tangent. A curve by its PI station, radius, the front tangent's azimuth and its spirals' lengths (0: a simple curve)."
          blank={() => ({ pi: mid, radius: 2000, azimuth: al.azimuth + 5, spiralIn: 0, spiralOut: 0 })}
          onChange={(curves) => setGeo((x) => ({ ...x, alignment: { ...x.alignment, curves } }))}
          render={(c, set) => (
            <>
              <Field label="PI station" unit="ft" value={c.pi} onChange={(v) => set({ ...c, pi: v })} step={10} hint={stationText(c.pi)} />
              <Field label="Radius" unit="ft" value={c.radius} onChange={(v) => set({ ...c, radius: v })} step={100} />
              <Field label="Ahead azimuth" unit="°" value={c.azimuth} onChange={(v) => set({ ...c, azimuth: v })} step={0.5} />
              <Field label="Entry spiral" unit="ft" value={c.spiralIn ?? 0} onChange={(v) => set({ ...c, spiralIn: v })} step={10} />
              <Field label="Exit spiral" unit="ft" value={c.spiralOut ?? 0} onChange={(v) => set({ ...c, spiralOut: v })} step={10} />
            </>
          )}
        />
        <Sketch def={def} kind="plan" />
      </>
    );

  if (form === "profile")
    return (
      <>
        <Field label="Station" unit="ft" value={pr.station} onChange={(v) => setGeo((x) => ({ ...x, profile: { ...x.profile, station: v } }))} step={10} hint={stationText(pr.station)} />
        <Field label="Elevation" unit="ft" value={pr.elevation} onChange={(v) => setGeo((x) => ({ ...x, profile: { ...x.profile, elevation: v } }))} step={0.1} />
        <Field label="Grade leaving it" unit="%" value={pr.grade} onChange={(v) => setGeo((x) => ({ ...x, profile: { ...x.profile, grade: v } }))} step={0.1} />
        <Items
          title="Vertical curves"
          items={pr.curves}
          empty="None: one grade. A curve by its PVI station, the grade leaving it and its length (a symmetric parabola)."
          blank={() => ({ pvi: mid, grade: -pr.grade, length: 200 })}
          onChange={(curves) => setGeo((x) => ({ ...x, profile: { ...x.profile, curves } }))}
          render={(c, set) => (
            <>
              <Field label="PVI station" unit="ft" value={c.pvi} onChange={(v) => set({ ...c, pvi: v })} step={10} hint={stationText(c.pvi)} />
              <Field label="Grade leaving it" unit="%" value={c.grade} onChange={(v) => set({ ...c, grade: v })} step={0.1} />
              <Field label="Length" unit="ft" value={c.length} onChange={(v) => set({ ...c, length: v })} step={20} />
            </>
          )}
        />
        <Sketch def={def} kind="profile" />
      </>
    );

  if (form === "roadway")
    return (
      <>
        <Field label="Left slope" unit="ft/ft" value={rw.leftSlope} onChange={(v) => setGeo((x) => ({ ...x, roadway: { ...x.roadway, leftSlope: v } }))} step={0.005} hint="− falls to the left" />
        <Field label="Right slope" unit="ft/ft" value={rw.rightSlope} onChange={(v) => setGeo((x) => ({ ...x, roadway: { ...x.roadway, rightSlope: v } }))} step={0.005} hint="− falls to the right" />
        <Field label="Crown from the alignment" unit="ft" value={rw.crownOffset} onChange={(v) => setGeo((x) => ({ ...x, roadway: { ...x.roadway, crownOffset: v } }))} step={0.5} hint="+ right" />
        <Field label="Bridge line from the alignment" unit="ft" value={g.bridgeLineOffset} onChange={(v) => setGeo((x) => ({ ...x, bridgeLineOffset: v }))} step={0.5} hint="The girders' center, + right" />
        <Field label="Bridge line to the left edge" unit="ft" value={g.leftEdge} onChange={(v) => setGeo((x) => ({ ...x, leftEdge: v }))} step={0.25} />
        <Field label="Bridge line to the right edge" unit="ft" value={g.rightEdge} onChange={(v) => setGeo((x) => ({ ...x, rightEdge: v }))} step={0.25} />
        <Field label="Slab offset (A)" unit="in" value={g.slabOffset} onChange={(v) => setGeo((x) => ({ ...x, slabOffset: v }))} step={0.25} hint="The deck's top to the girder's top at the bearings" />
        <Choice label="Bridge rail" value={g.rail.type} options={RAILS.map((r) => ({ value: r.value, label: r.label }))} onChange={(type) => setGeo((x) => ({ ...x, rail: { ...x.rail, type } }))} />
        <Items
          title="Superelevation"
          items={rw.sections ?? []}
          empty="None: the section above everywhere. Sections at stations, straight-line between them (the transitions)."
          blank={() => ({ station: g.supports[0].station, leftSlope: rw.leftSlope, rightSlope: rw.rightSlope, crownOffset: rw.crownOffset })}
          onChange={(sections) => setGeo((x) => ({ ...x, roadway: { ...x.roadway, sections } }))}
          render={(t, set) => (
            <>
              <Field label="Station" unit="ft" value={t.station} onChange={(v) => set({ ...t, station: v })} step={10} hint={stationText(t.station)} />
              <Field label="Left slope" unit="ft/ft" value={t.leftSlope} onChange={(v) => set({ ...t, leftSlope: v })} step={0.005} />
              <Field label="Right slope" unit="ft/ft" value={t.rightSlope} onChange={(v) => set({ ...t, rightSlope: v })} step={0.005} />
              <Field label="Crown offset" unit="ft" value={t.crownOffset} onChange={(v) => set({ ...t, crownOffset: v })} step={0.5} />
            </>
          )}
        />
      </>
    );

  const setSupport = (k: number, v: Partial<Support>) => setGeo((x) => ({ ...x, supports: x.supports.map((s, j) => (j === k ? { ...s, ...v } : s)) }));
  return (
    <>
      {note("Each support at its station (the spans follow), its skew from the alignment's normal (+ clockwise), its type, the girders' end distance past the bearing, the bearing's offset from the support line and its height, and the girder spacing there (0: the bridge's; spacings that differ flare the girders). Add or remove piers with the number of spans (Layout).")}
      {g.supports.map((s, k) => {
        const end = k === 0 || k === n - 1;
        return (
          <div key={k} className="mb-1.5 rounded-md border p-1.5">
            <Text label="Name" value={s.name} onChange={(v) => setSupport(k, { name: v })} />
            <Field label="Station" unit="ft" value={s.station} onChange={(v) => setSupport(k, { station: v })} step={5} hint={stationText(s.station)} />
            <Field label="Skew" unit="°" value={s.skew} onChange={(v) => setSupport(k, { skew: v })} step={1} />
            <Choice label="Type" value={s.type} options={SUPPORT_TYPES.filter((t) => t.value.endsWith("abutment") === end)} onChange={(type) => setSupport(k, { type })} />
            <Field label="End distance" unit="ft" value={s.endDistance} onChange={(v) => setSupport(k, { endDistance: v })} step={0.25} />
            <Field label="Bearing offset" unit="ft" value={s.bearingOffset} onChange={(v) => setSupport(k, { bearingOffset: v })} step={0.25} />
            <Field label="Bearing height" unit="in" value={s.bearingHeight} onChange={(v) => setSupport(k, { bearingHeight: v })} step={0.5} />
            <Field label="Girder spacing here" unit="ft" value={s.spacing ?? 0} onChange={(v) => setSupport(k, { spacing: v > 0 ? v : undefined })} step={0.25} hint="0: the bridge's spacing" />
          </div>
        );
      })}
      <Sketch def={def} kind="plan" />
    </>
  );
}

/** Each pier on its own (the geometry's piers): its cap, columns and foundation. */
export function PierShapesForm({ def, setDef }: Props) {
  const g = geometryOf(def);
  const setGeo = (update: (g: BridgeGeometry) => BridgeGeometry) => setDef((s) => withGeometry(s, update(geometryOf(s))));
  const setPier = (k: number, v: Partial<NonNullable<Support["pier"]>>) => setGeo((x) => ({ ...x, supports: x.supports.map((s, j) => (j === k && s.pier ? { ...s, pier: { ...s.pier, ...v } } : s)) }));
  return (
    <>
      {g.supports.map((s, k) => {
        const p = s.pier;
        if (!p) return null;
        return (
          <div key={k} className="mb-1.5 rounded-md border p-1.5">
            <p className="pb-0.5 text-xs font-medium">{s.name}</p>
            <Choice label="Type" value={p.kind} options={[{ value: "multicolumn", label: "Multi-column bent" }, { value: "hammerhead", label: "Hammerhead" }]} onChange={(kind) => setPier(k, { kind, ...(kind === "hammerhead" ? { columns: 1 } : {}) })} />
            <Field label="Cap length" unit="ft" value={p.capLength} onChange={(v) => setPier(k, { capLength: v })} step={1} hint="Along the support line" />
            <Field label="Cap depth" unit="ft" value={p.capDepth} onChange={(v) => setPier(k, { capDepth: v })} step={0.25} />
            <Field label="Cap width" unit="in" value={p.capWidth} onChange={(v) => setPier(k, { capWidth: v })} step={6} hint="Along the bridge" />
            {p.kind === "multicolumn" && <Field label="Columns" value={p.columns} onChange={(v) => setPier(k, { columns: Math.max(1, Math.round(v)) })} />}
            {p.kind === "multicolumn" && <Field label="Column spacing" unit="ft" value={p.columnSpacing} onChange={(v) => setPier(k, { columnSpacing: v })} step={1} />}
            <Choice label="Column shape" value={p.columnShape} options={[{ value: "round", label: "Round" }, { value: "rectangular", label: "Rectangular" }]} onChange={(columnShape) => setPier(k, { columnShape })} />
            <Field label={p.columnShape === "round" ? "Column diameter" : "Column, across the bridge"} unit="in" value={p.columnSize} onChange={(v) => setPier(k, { columnSize: v })} step={6} />
            {p.columnShape === "rectangular" && <Field label="Column, along the bridge" unit="in" value={p.columnDepth} onChange={(v) => setPier(k, { columnDepth: v })} step={6} />}
            <Choice label="Foundation" value={p.foundation} options={[{ value: "spread-footing", label: "Spread footing" }, { value: "pile-foundation", label: "Piles and cap" }, { value: "drilled-shaft", label: "Drilled shafts" }]} onChange={(foundation) => setPier(k, { foundation })} />
            <Field label="Foundation top" unit="ft" value={p.foundationTop} onChange={(v) => setPier(k, { foundationTop: v })} step={1} hint="Its elevation (0: 20 ft below the cap's soffit); the columns run down to it" />
          </div>
        );
      })}
    </>
  );
}
