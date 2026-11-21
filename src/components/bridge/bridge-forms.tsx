"use client";

import { Choice, Field, Toggle } from "@/components/design/design-kit";
import { GIRDER_CHOICES, supportsFor, type BridgeDefinition, type JointChoice, BRIDGE_DEFAULTS, STEEL_GIRDER_DEFAULT } from "@/lib/bridge/definition";
import type { SteelSegment } from "@/lib/design/girders/steel-section";
import { applyEdit } from "@/lib/bridge/geometry";
import { railDef, railWeight } from "@/lib/design/decks/rails";
import { GeometryForm, PierShapesForm } from "./geometry-forms";

// The bridge's inputs, in the groups the workspace's ribbon and tree open in the properties panel
// (as midas Civil's girder bridge wizard groups them: layout, section, boundary, loads).

export type FormKey = "layout" | "alignment" | "profile" | "roadway" | "supports" | "girders" | "diaphragms" | "bearings" | "piers" | "loads";
export const FORM_TITLES: Record<FormKey, string> = {
  layout: "Layout",
  alignment: "Alignment",
  profile: "Profile",
  roadway: "Roadway section",
  supports: "Supports",
  girders: "Girders and deck",
  diaphragms: "Diaphragms",
  bearings: "Bearings",
  piers: "Piers",
  loads: "Loads",
};

type Props = { def: BridgeDefinition; setDef: (update: (d: BridgeDefinition) => BridgeDefinition) => void };

const note = (text: string) => <p className="py-1 text-[11px] leading-snug text-muted-foreground">{text}</p>;

export function BridgeForm({ form, def, setDef: setRaw }: Props & { form: FormKey }) {
  // Every edit of the definition's own values carried into its geometry (geometry.ts applyEdit).
  const setDef: Props["setDef"] = (update) => setRaw((s) => applyEdit(s, update(s)));
  if (form === "alignment" || form === "profile" || form === "roadway" || form === "supports") return <GeometryForm form={form} def={def} setDef={setRaw} />;
  const set = <K extends keyof BridgeDefinition>(key: K) => (v: BridgeDefinition[K]) => setDef((s) => ({ ...s, [key]: v }));
  const part = <K extends "girder" | "deck" | "diaphragms" | "piers" | "loads" | "environment">(key: K) => <F extends keyof BridgeDefinition[K]>(field: F) => (v: BridgeDefinition[K][F]) => setDef((s) => ({ ...s, [key]: { ...s[key], [field]: v } }));
  const setSpans = (spans: number[]) => setDef((s) => ({ ...s, spans, supports: supportsFor(spans.length, s.supports) }));
  const lineName = (k: number) => (k === 0 ? "Abutment 1" : k === def.supports.length - 1 ? "Abutment 2" : `Pier ${k}`);

  if (form === "layout")
    return (
      <>
        <Field label="Spans" value={def.spans.length} onChange={(n) => setSpans(Array.from({ length: Math.min(8, Math.max(1, Math.round(n))) }, (_, k) => def.spans[k] ?? def.spans[def.spans.length - 1]))} />
        {def.spans.map((L, k) => (
          <Field key={k} label={`Span ${k + 1}`} unit="ft" value={L} onChange={(v) => setSpans(def.spans.map((x, j) => (j === k ? v : x)))} step={5} hint="Between support centerlines" />
        ))}
        <Field label="Skew of the supports" unit="°" value={def.skew} onChange={set("skew")} step={5} />
        {def.spans.length > 1 && (
          <>
            <Choice
              label="At the piers"
              value={def.continuity}
              options={[
                { value: "continuous", label: "Made continuous" },
                { value: "simple", label: "Simple spans" },
              ]}
              onChange={set("continuity")}
            />
            {def.continuity === "continuous" && note("Continuous for the loads after the deck (barriers, wearing surface, live load); the girders carry their weight and the deck on simple spans.")}
          </>
        )}
        <Field label="Elements per span" value={def.divisions} onChange={(v) => set("divisions")(Math.round(v))} hint="10: results at the tenth points" />
      </>
    );
  if (form === "girders")
    return (
      <>
        <Choice label="Superstructure (the Bridge design)" value={def.superstructure ?? "girders"} options={[{ value: "girders", label: "Girders under a deck" }, { value: "slab", label: "Cast-in-place slab bridge" }]} onChange={(v) => setDef((s) => ({ ...s, superstructure: v as "girders" | "slab" }))} />
        {def.superstructure === "slab" && note("A slab bridge: the deck's thickness below is the slab's depth, and the girder lines are its bearing lines at the spacing. The Slab Bridge design carries it; this section's own analysis still models girders.")}
        <Choice label="Girder" value={def.girder.shape} options={def.girder.shape === "custom" ? [{ value: "custom", label: "Custom section" }, ...GIRDER_CHOICES] : GIRDER_CHOICES} onChange={(shape) => setDef((s) => ({ ...s, girder: { shape, fc: s.girder.fc, wc: s.girder.wc, ...(shape === "steel" ? { steel: s.girder.steel ?? STEEL_GIRDER_DEFAULT } : {}) } }))} />
        {def.girder.shape === "steel" && <SteelPlates def={def} setDef={setDef} />}
        <Field label="Number of girders" value={def.nGirders} onChange={(v) => set("nGirders")(Math.round(v))} />
        <Field label="Girder spacing" unit="ft" value={def.spacing} onChange={set("spacing")} step={0.25} />
        <Field label="Overhang" unit="ft" value={def.overhang} onChange={set("overhang")} step={0.25} hint="Exterior girder centerline to the deck's edge" />
        {def.girder.shape !== "steel" && (
          <>
            <Field label="Girder f'c" unit="ksi" value={def.girder.fc} onChange={part("girder")("fc")} step={0.5} />
            <Field label="Girder unit weight" unit="kcf" value={def.girder.wc} onChange={part("girder")("wc")} step={0.005} />
          </>
        )}
        <Field label="Deck thickness, as cast" unit="in" value={def.deck.thickness} onChange={part("deck")("thickness")} step={0.25} />
        <Field label="Sacrificial thickness" unit="in" value={def.deck.sacrificial} onChange={part("deck")("sacrificial")} step={0.25} hint="A load, left out of the section" />
        <Field label="Haunch" unit="in" value={def.deck.haunch} onChange={part("deck")("haunch")} step={0.5} />
        <Field label="Deck f'c" unit="ksi" value={def.deck.fc} onChange={part("deck")("fc")} step={0.5} />
        <Field label="Deck unit weight" unit="kcf" value={def.deck.wc} onChange={part("deck")("wc")} step={0.005} />
      </>
    );
  if (form === "diaphragms")
    return (
      <>
        <Field label="Intermediate, per span" value={def.diaphragms.perSpan} onChange={(v) => part("diaphragms")("perSpan")(Math.round(v))} />
        <Field label="Weight, per bay" unit="kip" value={def.diaphragms.weight} onChange={part("diaphragms")("weight")} step={0.5} hint="Between two girders: an interior girder carries one, an exterior girder half" />
        <Field label="Thickness" unit="ft" value={def.diaphragms.thickness} onChange={part("diaphragms")("thickness")} step={0.25} />
        <Toggle label="Diaphragms at the supports" value={def.diaphragms.atSupports} onChange={part("diaphragms")("atSupports")} />
      </>
    );
  if (form === "bearings")
    return (
      <>
        {def.supports.map((s, k) => (
          <Choice
            key={k}
            label={lineName(k)}
            value={s.bearing}
            options={[
              { value: "fixed", label: "Fixed" },
              { value: "expansion", label: "Expansion" },
            ]}
            onChange={(v) => set("supports")(def.supports.map((x, j) => (j === k ? { ...x, bearing: v } : x)))}
          />
        ))}
        {def.supports.map((s, k) => (
          <Choice
            key={`t${k}`}
            label={`${lineName(k)}: type`}
            value={s.bearingKind ?? "elastomeric"}
            options={[
              { value: "elastomeric", label: "Elastomeric pads" },
              { value: "pot", label: "Pot bearings (14.7.4)" },
              { value: "disc", label: "Disc bearings (14.7.8)" },
            ]}
            onChange={(v) => set("supports")(def.supports.map((x, j) => (j === k ? { ...x, bearingKind: v as "elastomeric" | "pot" | "disc" } : x)))}
          />
        ))}
        {def.supports.map((s, k) =>
          k === 0 || k === def.supports.length - 1 ? (
            <Choice
              key={`j${k}`}
              label={`${lineName(k)}: expansion device`}
              value={s.jointKind ?? "auto"}
              options={[
                { value: "auto", label: "Recommended from the movement" },
                { value: "strip-seal", label: "Strip seal (to 4 in)" },
                { value: "modular", label: "Modular joint (over 4 in)" },
                { value: "finger", label: "Finger joint (replacement)" },
              ]}
              onChange={(v) => set("supports")(def.supports.map((x, j) => (j === k ? { ...x, jointKind: v as JointChoice } : x)))}
            />
          ) : null,
        )}
        <Field label="Bearing height" unit="in" value={def.piers.bearingHeight} onChange={part("piers")("bearingHeight")} step={0.5} />
        {note("Fixed bearings hold the girders along the bridge; expansion bearings let them slide. Every bearing holds its girder vertically and across the bridge. An abutment's expansion device, recommended, is a strip seal for 4 in of movement or less (an oversized gland past a 25° skew) and a modular joint above (CDOT BDM 14.4.4–14.4.5); CDOT uses finger joints only to replace existing ones.")}
      </>
    );
  if (form === "piers")
    return def.spans.length < 2 ? (
      note("A single span has no piers: its girders sit on the abutments.")
    ) : (
      <>
        <Toggle label="Model the caps and columns" value={def.piers.model} onChange={part("piers")("model")} />
        {def.piers.model ? (
          <>
            <Field label="Pier f'c" unit="ksi" value={def.piers.fc} onChange={part("piers")("fc")} step={0.5} />
            <Field label="Column height" unit="ft" value={def.piers.columnHeight} onChange={part("piers")("columnHeight")} step={1} hint="Cap's soffit to the fixed base, where a pier's foundation top isn't given (0)" />
            <PierShapesForm def={def} setDef={setRaw} />
          </>
        ) : (
          note("Without the caps and columns, the bearings at each pier stand on fixed supports.")
        )}
      </>
    );
  const rail = def.geometry && def.geometry.rail.type !== "custom" ? railDef(def.geometry.rail.type) : null;
  const env = def.environment ?? BRIDGE_DEFAULTS.environment;
  const sw = def.sidewalks ?? { left: 0, right: 0, depth: 8 };
  const setSw = (p: Partial<typeof sw>) => setDef((s) => ({ ...s, sidewalks: { ...(s.sidewalks ?? { left: 0, right: 0, depth: 8 }), ...p } }));
  return (
    <>
      {rail ? (
        <>
          <Fixed label="Barrier, each side" unit="klf" value={def.loads.barrierWeight.toFixed(3)} />
          <Fixed label="Barrier width" unit="ft" value={def.loads.barrierWidth.toFixed(2)} />
          {note(`From the ${rail.name} (Roadway section): ${railWeight(rail, def.deck.wc).basis}.`)}
        </>
      ) : (
        <>
          <Field label="Barrier, each side" unit="klf" value={def.loads.barrierWeight} onChange={part("loads")("barrierWeight")} step={0.05} />
          <Field label="Barrier width" unit="ft" value={def.loads.barrierWidth} onChange={part("loads")("barrierWidth")} step={0.25} hint="The roadway, and its lanes, run between the barriers" />
          {note("A CDOT standard rail (Roadway section) sets these from its worksheet.")}
        </>
      )}
      <Field label="Future wearing surface" unit="psf" value={def.loads.wearingSurface} onChange={part("loads")("wearingSurface")} step={5} />
      <Field label="Sidewalk, left" unit="ft" value={sw.left} onChange={(v) => setSw({ left: v })} step={0.5} hint="Inside the barrier, 0 for none; the lanes keep to the curbs" />
      <Field label="Sidewalk, right" unit="ft" value={sw.right} onChange={(v) => setSw({ right: v })} step={0.5} />
      {sw.left + sw.right > 0 && <Field label="Sidewalk depth above the deck" unit="in" value={sw.depth} onChange={(v) => setSw({ depth: v })} step={1} hint="Its concrete (DC); 0.075 ksf of pedestrians on a sidewalk wider than 2 ft (AASHTO 3.6.1.6)" />}
      {note("The girders', deck's, haunches' and piers' weights come from the sections. Live load is HL-93 (AASHTO 3.6.1): the design truck or tandem with 33% dynamic allowance, plus the lane load, in every lane that adds to an effect; the fatigue truck (Fatigue I, II) and CDOT's permit vehicles (Strength II) run the same way.")}
      <Field label="Highest temperature" unit="°F" value={env.Tmax} onChange={part("environment")("Tmax")} hint="Procedure B (AASHTO Figure 3.12.2.2.1), CDOT BDM 14.3" />
      <Field label="Lowest temperature" unit="°F" value={env.Tmin} onChange={part("environment")("Tmin")} />
      <Field label="Temperature when made continuous" unit="°F" value={env.Tset} onChange={part("environment")("Tset")} />
      <Field label="Wind speed, 3-second gust" unit="mph" value={env.wind} onChange={part("environment")("wind")} hint="AASHTO Figure 3.8.1.1.2-1 (Strength III)" />
      <Field label="Height above the ground or water" unit="ft" value={env.height} onChange={part("environment")("height")} hint="For Kz; 33 ft at least" />
      <Field label="Barrier height (the depth the wind sees)" unit="ft" value={env.barrierHeight} onChange={part("environment")("barrierHeight")} step={0.25} />
      <div className="grid grid-cols-[1fr_7rem] items-center gap-2 py-0.5 text-xs">
        <span className="text-muted-foreground">Wind exposure</span>
        <select value={env.exposure} onChange={(e) => part("environment")("exposure")(e.target.value as "B" | "C" | "D")} className="h-7 rounded-md border bg-transparent px-1 text-xs" aria-label="Wind exposure">
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </div>
      <div className="grid grid-cols-[1fr_7rem] items-center gap-2 py-0.5 text-xs">
        <span className="text-muted-foreground" title="AASHTO 3.12.3: the solar radiation zone (Figure 3.12.3-1). CDOT BDM 14.3 considers it where appropriate.">Temperature gradient</span>
        <select value={env.gradientZone ?? 0} onChange={(e) => part("environment")("gradientZone")(Number(e.target.value) as 0 | 1 | 2 | 3 | 4)} className="h-7 rounded-md border bg-transparent px-1 text-xs" aria-label="Temperature gradient zone">
          <option value={0}>Not considered</option>
          <option value={1}>Zone 1</option>
          <option value={2}>Zone 2</option>
          <option value={3}>Zone 3</option>
          <option value={4}>Zone 4</option>
        </select>
      </div>
      {(env.gradientZone ?? 0) > 0 && (
        <label className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={!!env.asphalt} onChange={(e) => part("environment")("asphalt")(e.target.checked)} />
          Asphalt overlay (negative gradient × −0.20, else −0.30)
        </label>
      )}
    </>
  );
}

/** A steel plate girder's plates along the bridge: each segment's length (scaled to the bridge's), web and flanges. */
function SteelPlates({ def, setDef }: { def: BridgeDefinition; setDef: Props["setDef"] }) {
  const st = def.girder.steel ?? STEEL_GIRDER_DEFAULT;
  const total = def.spans.reduce((a, b) => a + b, 0);
  const sum = st.segments.reduce((a, x) => a + x.length, 0);
  const update = (segments: SteelSegment[]) => setDef((s) => ({ ...s, girder: { ...s.girder, steel: { ...st, segments } } }));
  const cell = (k: number, value: number, put: (v: number) => SteelSegment, label: string, step = 0.125) => (
    <input type="number" step={step} value={value} aria-label={`Segment ${k + 1} ${label}`} onChange={(e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v > 0) update(st.segments.map((x, q) => (q === k ? put(v) : x)));
    }} className="h-7 w-full rounded border bg-transparent px-1 text-right text-[11px] tabular-nums" />
  );
  return (
    <div className="space-y-1 py-1 text-xs">
      <p className="text-muted-foreground">Plates along the bridge from the first abutment (in; lengths in ft, scaled to the bridge&apos;s {+total.toFixed(1)} ft{Math.abs(sum - total) > 0.01 ? `, entered ${+sum.toFixed(1)}` : ""}). Fy {st.Fyf} ksi.</p>
      <div className="grid grid-cols-[2.5rem_repeat(7,1fr)] gap-1 text-[10px] text-muted-foreground">
        <span />
        <span>L (ft)</span>
        <span>D</span>
        <span>tw</span>
        <span>top b</span>
        <span>top t</span>
        <span>bot b</span>
        <span>bot t</span>
      </div>
      {st.segments.map((x, k) => (
        <div key={k} className="grid grid-cols-[2.5rem_repeat(7,1fr)] items-center gap-1">
          <button type="button" className="text-[10px] text-muted-foreground hover:text-destructive" aria-label={`Remove segment ${k + 1}`} disabled={st.segments.length < 2} onClick={() => update(st.segments.filter((_, q) => q !== k))}>
            {k + 1} ×
          </button>
          {cell(k, x.length, (v) => ({ ...x, length: v }), "length", 1)}
          {cell(k, x.D, (v) => ({ ...x, D: v }), "web depth", 1)}
          {cell(k, x.tw, (v) => ({ ...x, tw: v }), "web thickness", 0.0625)}
          {cell(k, x.top.b, (v) => ({ ...x, top: { ...x.top, b: v } }), "top flange width", 1)}
          {cell(k, x.top.t, (v) => ({ ...x, top: { ...x.top, t: v } }), "top flange thickness")}
          {cell(k, x.bottom.b, (v) => ({ ...x, bottom: { ...x.bottom, b: v } }), "bottom flange width", 1)}
          {cell(k, x.bottom.t, (v) => ({ ...x, bottom: { ...x.bottom, t: v } }), "bottom flange thickness")}
        </div>
      ))}
      <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => update([...st.segments, { ...st.segments[st.segments.length - 1] }])}>
        Add a segment
      </button>
    </div>
  );
}

/** A value the bridge works out (shown, not entered). */
function Fixed({ label, unit, value }: { label: string; unit: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_7rem] items-center gap-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <span className="h-7 w-full rounded-md border border-dashed px-2 text-right leading-7 tabular-nums">{value}</span>
        <span className="w-9 shrink-0 text-[11px] text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}
