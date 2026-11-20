"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { designSteelGirder, W_SHAPE_NAMES, type StiffenerZone, type SteelGirderInputs } from "@/lib/design/girders/steel";
import { L_SHAPE_NAMES } from "@/lib/design/girders/steel-crossframe";
import { FATIGUE_CATEGORIES, type FatigueCategory } from "@/lib/design/girders/steel-details";
import type { SteelSegment } from "@/lib/design/girders/steel-section";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { SteelGirderSketch } from "./steel-girder-sketch";

// Checking a steel I-girder line: the spans, deck and girder's sections along it on the left, the
// envelopes, checks and properties on the right, worked out as the inputs change and saved as you go.

const groupOf = (id: string) =>
  id.startsWith("flex") || id === "ductility" || id === "shear"
    ? "Strength I"
    : id.startsWith("con")
      ? "Constructibility (deck placement)"
      : id.startsWith("svc")
        ? "Service II"
        : id.startsWith("defl")
          ? "Live load deflection"
          : id.startsWith("fat")
            ? "Fatigue"
            : id.startsWith("stud")
              ? "Shear connectors"
              : id.startsWith("stf") || id.startsWith("brg")
                ? "Stiffeners and bearings"
                : id.startsWith("pour")
                  ? "Deck placement, pour by pour"
                  : id.startsWith("b6")
                    ? "Moment redistribution (Appendix B6)"
                    : id.startsWith("cf")
                      ? "Cross-frames"
                      : "Proportions and detailing";

/** Rows of three numbers (from, to and a value) with add and remove: stud pitch zones, deck pours. */
function Triples<T extends { from: number; to: number }>({ rows, third, label, add, onChange }: { rows: T[]; third: keyof T & string; label: string; add: T; onChange: (rows: T[]) => void }) {
  return (
    <>
      {rows.map((z, k) => (
        <div key={k} className="mb-1 grid grid-cols-[1fr_1fr_1fr_1.25rem] items-center gap-1">
          <input type="number" value={z.from} onChange={(e) => onChange(rows.map((x, j) => (j === k ? { ...x, from: Number(e.target.value) } : x)))} className={box} aria-label="From (ft)" />
          <input type="number" value={z.to} onChange={(e) => onChange(rows.map((x, j) => (j === k ? { ...x, to: Number(e.target.value) } : x)))} className={box} aria-label="To (ft)" />
          <input type="number" value={Number(z[third])} onChange={(e) => onChange(rows.map((x, j) => (j === k ? { ...x, [third]: Number(e.target.value) } : x)))} className={box} aria-label={third} />
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== k))} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, add])} className="flex items-center gap-1 text-xs text-primary hover:underline">
        <Plus className="size-3" /> {label}
      </button>
    </>
  );
}

const CATEGORY_OPTIONS = (Object.keys(FATIGUE_CATEGORIES) as FatigueCategory[]).map((c) => ({ value: c, label: c }));

const num = (s: string) => s.split(/[,\s]+/).map(Number).filter((v) => Number.isFinite(v) && v > 0);
const box = "h-6 w-full rounded border border-input bg-transparent px-1 text-right text-xs";

export function SteelGirderEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: SteelGirderInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof SteelGirderInputs>(key: K) => (v: SteelGirderInputs[K]) => setInputs((s) => ({ ...s, [key]: v }));
  const setLoads = <K extends keyof SteelGirderInputs["loads"]>(key: K) => (v: SteelGirderInputs["loads"][K]) => setInputs((s) => ({ ...s, loads: { ...s.loads, [key]: v } }));
  const setBars = <K extends keyof SteelGirderInputs["bars"]>(key: K) => (v: SteelGirderInputs["bars"][K]) => setInputs((s) => ({ ...s, bars: { ...s.bars, [key]: v } }));
  const setSeg = (k: number, seg: SteelSegment) => setInputs((s) => ({ ...s, segments: s.segments.map((x, j) => (j === k ? seg : x)) }));
  const setZone = (k: number, z: StiffenerZone) => setInputs((s) => ({ ...s, stiffeners: s.stiffeners.map((x, j) => (j === k ? z : x)) }));
  const setFat = <K extends keyof SteelGirderInputs["fatigue"]>(key: K) => (v: SteelGirderInputs["fatigue"][K]) => setInputs((s) => ({ ...s, fatigue: { ...s.fatigue, [key]: v } }));
  const setStud = <K extends keyof SteelGirderInputs["studs"]>(key: K) => (v: SteelGirderInputs["studs"][K]) => setInputs((s) => ({ ...s, studs: { ...s.studs, [key]: v } }));
  const setStf = <K extends keyof SteelGirderInputs["stiffener"]>(key: K) => (v: SteelGirderInputs["stiffener"][K]) => setInputs((s) => ({ ...s, stiffener: { ...s.stiffener, [key]: v } }));
  const setBrg = <K extends keyof SteelGirderInputs["bearing"]>(key: K) => (v: SteelGirderInputs["bearing"][K]) => setInputs((s) => ({ ...s, bearing: { ...s.bearing, [key]: v } }));
  const setCf = <K extends keyof SteelGirderInputs["crossFrame"]>(key: K) => (v: SteelGirderInputs["crossFrame"][K]) => setInputs((s) => ({ ...s, crossFrame: { ...s.crossFrame, [key]: v } }));
  const setWind = <K extends keyof SteelGirderInputs["wind"]>(key: K) => (v: SteelGirderInputs["wind"][K]) => setInputs((s) => ({ ...s, wind: { ...s.wind, [key]: v } }));
  const [spansText, setSpansText] = useState(inputs.spans.join(", "));
  const [bracesText, setBracesText] = useState(inputs.braces.join(", "));
  const angles = L_SHAPE_NAMES.map((n) => ({ value: n, label: n }));

  // The girder line takes up to a second for long girders: worked out on a deferred copy so typing stays quick.
  const deferred = useDeferredValue(inputs);
  const outcome = useMemo(() => {
    try {
      return { result: designSteelGirder(deferred), error: null };
    } catch (err) {
      return { result: null, error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [deferred]);
  const r = outcome.result;
  const total = inputs.spans.reduce((s, L) => s + L, 0);
  const segTotal = inputs.segments.reduce((s, x) => s + x.length, 0);
  const L = inputs.loads;

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Steel Girder Design Check · AASHTO LRFD 6.10" canMakeCalc={!!r} />

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Spans and layout" open>
              <label className="block py-1 text-xs">
                <span className="text-muted-foreground">Spans, bearing to bearing (ft), separated by commas</span>
                <input
                  value={spansText}
                  onChange={(e) => {
                    setSpansText(e.target.value);
                    const v = num(e.target.value);
                    if (v.length) set("spans")(v.slice(0, 6));
                  }}
                  className="mt-1 h-6 w-full rounded border border-input bg-transparent px-1 text-xs"
                />
              </label>
              <Field label="Girders" value={inputs.nGirders} onChange={(v) => set("nGirders")(Math.max(2, Math.round(v)))} />
              <Field label="Girder spacing" unit="ft" value={inputs.S} onChange={set("S")} step={0.25} />
              <Field label="Overhang (girder to deck edge)" unit="ft" value={inputs.overhang} onChange={set("overhang")} step={0.25} />
              <Field label="Deck edge to barrier face" unit="ft" value={inputs.barrierWidth} onChange={set("barrierWidth")} step={0.25} />
              <Field label="Skew" unit="°" value={inputs.skew} onChange={set("skew")} />
            </Section>

            <Section title="Deck" open>
              <Field label="Thickness as cast" unit="in" value={inputs.deckT} onChange={set("deckT")} step={0.25} />
              <Field label="Integral wearing surface" unit="in" value={inputs.sacrificial} onChange={set("sacrificial")} step={0.25} />
              <Field label="Haunch" unit="in" value={inputs.haunch} onChange={set("haunch")} step={0.25} />
              <Choice
                label="Haunch measured to the top of the"
                value={inputs.haunchTo}
                options={[
                  { value: "web", label: "Web (flanges inside it)" },
                  { value: "flange", label: "Top flange" },
                ]}
                onChange={set("haunchTo")}
              />
              <Field label="f'c" unit="ksi" value={inputs.fcDeck} onChange={set("fcDeck")} step={0.5} />
              <Field label="Unit weight" unit="kcf" value={inputs.wcDeck} onChange={set("wcDeck")} step={0.005} />
              <Field label="Modular ratio n (0: from Ec, 5.4.2.4)" value={inputs.n} onChange={set("n")} step={0.5} />
              <p className="pt-2 pb-1 text-[11px] text-muted-foreground">Longitudinal bars over the piers (6.10.1.7)</p>
              <Field label="Area, % of the deck" unit="%" value={inputs.bars.pct} onChange={setBars("pct")} step={0.1} />
              <Field label="Share in the top layer" value={inputs.bars.top} onChange={setBars("top")} step={0.05} />
              <Field label="Top layer below the deck's top" unit="in" value={inputs.bars.topCover} onChange={setBars("topCover")} step={0.25} />
              <Field label="Bottom layer above the deck's bottom" unit="in" value={inputs.bars.bottomCover} onChange={setBars("bottomCover")} step={0.25} />
            </Section>

            <Section title="Steel girder" open>
              <Field label="Web Fy" unit="ksi" value={inputs.Fyw} onChange={set("Fyw")} />
              <Field label="Flanges Fy" unit="ksi" value={inputs.Fyf} onChange={set("Fyf")} />
              <p className={`py-1 text-[11px] ${Math.abs(segTotal - total) > 0.5 ? "text-destructive" : "text-muted-foreground"}`}>
                Sections along the girder from its start: {fmt(segTotal)} of {fmt(total)} ft.
              </p>
              {inputs.segments.map((s, k) => (
                <div key={k} className="mb-1.5 rounded border border-border/60 p-1.5 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="w-5 font-medium">{k + 1}</span>
                    <select value={s.kind} onChange={(e) => setSeg(k, { ...s, kind: e.target.value === "rolled" ? "rolled" : "plate", shape: s.shape ?? "W36X150" })} className="h-6 rounded border border-input bg-transparent text-xs">
                      <option value="plate">Plate girder</option>
                      <option value="rolled">Rolled W</option>
                    </select>
                    <input type="number" value={s.length} step={1} onChange={(e) => setSeg(k, { ...s, length: Number(e.target.value) })} className={`${box} w-16`} aria-label="Length (ft)" />
                    <span className="text-muted-foreground">ft</span>
                    <button type="button" onClick={() => setInputs((st) => ({ ...st, segments: st.segments.filter((_, j) => j !== k) }))} className="ml-auto text-muted-foreground hover:text-destructive" aria-label="Remove section">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  {s.kind === "rolled" ? (
                    <select value={s.shape} onChange={(e) => setSeg(k, { ...s, shape: e.target.value })} className="mt-1 h-6 w-full rounded border border-input bg-transparent text-xs">
                      {W_SHAPE_NAMES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-1 grid grid-cols-[3.5rem_1fr_1fr] items-center gap-1">
                      <span className="text-muted-foreground" />
                      <span className="text-center text-[10px] text-muted-foreground">width / depth</span>
                      <span className="text-center text-[10px] text-muted-foreground">thickness</span>
                      <span className="text-muted-foreground">Top</span>
                      <input type="number" step={0.5} value={s.top.b} onChange={(e) => setSeg(k, { ...s, top: { ...s.top, b: Number(e.target.value) } })} className={box} />
                      <input type="number" step={0.125} value={s.top.t} onChange={(e) => setSeg(k, { ...s, top: { ...s.top, t: Number(e.target.value) } })} className={box} />
                      <span className="text-muted-foreground">Web</span>
                      <input type="number" step={1} value={s.D} onChange={(e) => setSeg(k, { ...s, D: Number(e.target.value) })} className={box} />
                      <input type="number" step={0.0625} value={s.tw} onChange={(e) => setSeg(k, { ...s, tw: Number(e.target.value) })} className={box} />
                      <span className="text-muted-foreground">Bottom</span>
                      <input type="number" step={0.5} value={s.bottom.b} onChange={(e) => setSeg(k, { ...s, bottom: { ...s.bottom, b: Number(e.target.value) } })} className={box} />
                      <input type="number" step={0.125} value={s.bottom.t} onChange={(e) => setSeg(k, { ...s, bottom: { ...s.bottom, t: Number(e.target.value) } })} className={box} />
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setInputs((s) => ({ ...s, segments: [...s.segments, { ...(s.segments[s.segments.length - 1] ?? { kind: "plate", D: 42, tw: 0.5, top: { b: 16, t: 1 }, bottom: { b: 18, t: 1.25 } }), length: Math.max(0, Math.round((total - segTotal) * 100) / 100) }] }))}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="size-3" /> Section
              </button>
            </Section>

            <Section title="Bracing and stiffeners">
              <label className="block py-1 text-xs">
                <span className="text-muted-foreground">Cross-frames at (ft along the girder, commas); empty: equally spaced</span>
                <input
                  value={bracesText}
                  onChange={(e) => {
                    setBracesText(e.target.value);
                    set("braces")(num(e.target.value).slice(0, 200));
                  }}
                  className="mt-1 h-6 w-full rounded border border-input bg-transparent px-1 text-xs"
                />
              </label>
              {inputs.braces.length === 0 && <Field label="Cross-frames, most spacing in a span" unit="ft" value={inputs.crossFrames} onChange={set("crossFrames")} hint="Equally spaced in each span" />}
              <Toggle label="Design the cross-frames (6.7.4.2.2)" value={inputs.crossFrame.check} onChange={setCf("check")} />
              {inputs.crossFrame.check && (
                <>
                  <Choice
                    label="Type"
                    value={inputs.crossFrame.type}
                    options={[
                      { value: "X", label: "X (diagonals in compression)" },
                      { value: "K", label: "K" },
                    ]}
                    onChange={setCf("type")}
                  />
                  <Choice label="Diagonals" value={inputs.crossFrame.diagonal} options={angles} onChange={setCf("diagonal")} />
                  <Choice label="Struts" value={inputs.crossFrame.strut} options={angles} onChange={setCf("strut")} />
                  <Field label="Depth between the struts" unit="in" value={inputs.crossFrame.hb} onChange={setCf("hb")} />
                  <Field label="Angles' Fy" unit="ksi" value={inputs.crossFrame.Fy} onChange={setCf("Fy")} />
                  <Toggle label="Full-depth connection plates on both flanges" value={inputs.crossFrame.fullDepthPlates} onChange={setCf("fullDepthPlates")} />
                  {!inputs.crossFrame.fullDepthPlates && (
                    <>
                      <Field label="Connection plate width (both sides)" unit="in" value={inputs.crossFrame.plateWidth} onChange={setCf("plateWidth")} />
                      <Field label="Connection plate thickness" unit="in" value={inputs.crossFrame.plateThickness} onChange={setCf("plateThickness")} step={0.0625} />
                    </>
                  )}
                  <Field label="Wind speed, Strength III (0: none)" unit="mph" value={inputs.wind.V} onChange={setWind("V")} hint="3.8.1.1.2; Strength V uses 80 mph" />
                  {inputs.wind.V > 0 && (
                    <>
                      <Choice
                        label="Exposure"
                        value={inputs.wind.exposure}
                        options={[
                          { value: "B", label: "B" },
                          { value: "C", label: "C" },
                          { value: "D", label: "D" },
                        ]}
                        onChange={setWind("exposure")}
                      />
                      <Field label="Height above ground or water" unit="ft" value={inputs.wind.Z} onChange={setWind("Z")} />
                    </>
                  )}
                </>
              )}
              <p className="pt-2 pb-1 text-[11px] text-muted-foreground">Deck pours in order: from, to (ft), order. None: one pour.</p>
              <Triples rows={inputs.pours} third="order" label="Pour" add={{ from: 0, to: 0, order: inputs.pours.length + 1 }} onChange={set("pours")} />
              <p className="pt-2 pb-1 text-[11px] text-muted-foreground">Transverse stiffeners: from, to (ft along the girder), spacing (in). None: an unstiffened web.</p>
              {inputs.stiffeners.map((z, k) => (
                <div key={k} className="mb-1 grid grid-cols-[1fr_1fr_1fr_1.25rem] items-center gap-1">
                  <input type="number" value={z.from} onChange={(e) => setZone(k, { ...z, from: Number(e.target.value) })} className={box} aria-label="From (ft)" />
                  <input type="number" value={z.to} onChange={(e) => setZone(k, { ...z, to: Number(e.target.value) })} className={box} aria-label="To (ft)" />
                  <input type="number" value={z.spacing} onChange={(e) => setZone(k, { ...z, spacing: Number(e.target.value) })} className={box} aria-label="Spacing (in)" />
                  <button type="button" onClick={() => setInputs((s) => ({ ...s, stiffeners: s.stiffeners.filter((_, j) => j !== k) }))} className="text-muted-foreground hover:text-destructive" aria-label="Remove stiffeners">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setInputs((s) => ({ ...s, stiffeners: [...s.stiffeners, { from: 0, to: 0, spacing: 0 }] }))} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="size-3" /> Stiffeners
              </button>
              {inputs.stiffeners.length > 0 && (
                <>
                  <p className="pt-2 pb-1 text-[11px] text-muted-foreground">Transverse stiffener plates (6.10.11.1)</p>
                  <Field label="Projecting width" unit="in" value={inputs.stiffener.bt} onChange={setStf("bt")} step={0.25} />
                  <Field label="Thickness" unit="in" value={inputs.stiffener.tp} onChange={setStf("tp")} step={0.0625} />
                  <Field label="Fy" unit="ksi" value={inputs.stiffener.Fys} onChange={setStf("Fys")} />
                  <Toggle label="Pairs (one each side of the web)" value={inputs.stiffener.pair} onChange={setStf("pair")} />
                </>
              )}
              <p className="pt-2 pb-1 text-[11px] text-muted-foreground">Bearing stiffeners at the supports (6.10.11.2)</p>
              <Toggle label="Bearing stiffeners" value={inputs.bearing.use} onChange={setBrg("use")} />
              {inputs.bearing.use ? (
                <>
                  <Field label="Projecting width" unit="in" value={inputs.bearing.bt} onChange={setBrg("bt")} step={0.25} />
                  <Field label="Thickness" unit="in" value={inputs.bearing.tp} onChange={setBrg("tp")} step={0.0625} />
                  <Field label="Fy" unit="ksi" value={inputs.bearing.Fys} onChange={setBrg("Fys")} />
                  <Field label="Clip at the flange" unit="in" value={inputs.bearing.clip} onChange={setBrg("clip")} step={0.25} />
                  <Field label="Pairs at the abutments" value={inputs.bearing.pairsEnd} onChange={(v) => setBrg("pairsEnd")(Math.max(1, Math.round(v)))} />
                  {inputs.spans.length > 1 && <Field label="Pairs at the piers" value={inputs.bearing.pairsPier} onChange={(v) => setBrg("pairsPier")(Math.max(1, Math.round(v)))} />}
                  {(inputs.bearing.pairsEnd > 1 || (inputs.spans.length > 1 && inputs.bearing.pairsPier > 1)) && <Field label="Between pairs" unit="in" value={inputs.bearing.gap} onChange={setBrg("gap")} />}
                </>
              ) : (
                <>
                  <Field label="Bearing length N" unit="in" value={inputs.bearing.N} onChange={setBrg("N")} hint="For the web's local yielding and crippling (D6.5)" />
                  <Field label="Fillet or flange-to-web weld" unit="in" value={inputs.bearing.weld} onChange={setBrg("weld")} step={0.0625} hint="k = the flange's thickness plus this" />
                </>
              )}
            </Section>

            <Section title="Shear connectors and fatigue">
              <Toggle label="Shear connectors along the whole girder" value={inputs.studsThroughout} onChange={set("studsThroughout")} />
              <Toggle label="Check the shear connectors (6.10.10)" value={inputs.studs.check} onChange={setStud("check")} />
              {inputs.studs.check && (
                <>
                  <Field label="Stud diameter" unit="in" value={inputs.studs.d} onChange={setStud("d")} step={0.125} />
                  <Field label="Studs across the flange" value={inputs.studs.perRow} onChange={(v) => setStud("perRow")(Math.max(1, Math.round(v)))} />
                  <Field label="Pitch" unit="in" value={inputs.studs.pitch} onChange={setStud("pitch")} step={0.5} />
                  <p className="pt-1 pb-1 text-[11px] text-muted-foreground">Other pitches: from, to (ft), pitch (in)</p>
                  <Triples rows={inputs.studs.zones} third="pitch" label="Pitch zone" add={{ from: 0, to: 0, pitch: inputs.studs.pitch }} onChange={setStud("zones")} />
                  <Field label="Height" unit="in" value={inputs.studs.height} onChange={setStud("height")} step={0.25} />
                  <Field label="Fu" unit="ksi" value={inputs.studs.Fu} onChange={setStud("Fu")} />
                </>
              )}
              <Toggle label="Check fatigue (6.6.1.2, 6.10.5)" value={inputs.fatigue.check} onChange={setFat("check")} />
              <Field label="Single-lane ADTT, 75-year" value={inputs.fatigue.adttSL} onChange={setFat("adttSL")} step={100} hint="3.6.1.4.2: p × ADTT; also sets the studs' resistance" />
              <Field label="Design life" unit="years" value={inputs.fatigue.life} onChange={setFat("life")} />
              {inputs.fatigue.check && (
                <>
                  <Choice label="Flange attachments, positive moment" value={inputs.fatigue.flange} options={CATEGORY_OPTIONS} onChange={setFat("flange")} />
                  <Choice label="Flange attachments, negative moment" value={inputs.fatigue.flangeNeg} options={CATEGORY_OPTIONS} onChange={setFat("flangeNeg")} />
                  <p className="pt-1 text-[11px] text-muted-foreground">Table 6.6.1.2.3-1: C′ for welded connection plates and stiffeners (4.1), B for bolted ones (2.1). The top flange is also checked as C at the studs (9.1).</p>
                </>
              )}
            </Section>

            <Section title="Dead loads (per girder)" open>
              <Choice
                label="Dead loads"
                value={L.mode}
                options={[
                  { value: "computed", label: "From the deck and barriers" },
                  { value: "entered", label: "As entered" },
                ]}
                onChange={setLoads("mode")}
              />
              {L.mode === "entered" ? (
                <>
                  <Field label="DC1 besides the girder's steel" unit="klf" value={L.dc1} onChange={setLoads("dc1")} step={0.01} hint="Deck, haunch, forms, cross-frames; the steel is added" />
                  <Field label="DC2" unit="klf" value={L.dc2} onChange={setLoads("dc2")} step={0.01} />
                  <Field label="DW" unit="klf" value={L.dw} onChange={setLoads("dw")} step={0.01} />
                </>
              ) : (
                <>
                  <Field label="Stay-in-place forms" unit="psf" value={L.sip} onChange={setLoads("sip")} />
                  <Field label="Cross-frames and other steel" unit="plf" value={L.misc} onChange={setLoads("misc")} />
                  <Field label="Other DC1" unit="klf" value={L.otherDC1} onChange={setLoads("otherDC1")} step={0.01} />
                  <Field label="Barrier weight, each" unit="klf" value={L.barrierWeight} onChange={setLoads("barrierWeight")} step={0.01} hint="Shared equally by the girders" />
                  <Field label="Other DC2" unit="klf" value={L.otherDC2} onChange={setLoads("otherDC2")} step={0.01} />
                  <Field label="Future wearing surface" unit="psf" value={L.fws} onChange={setLoads("fws")} />
                </>
              )}
            </Section>

            <Section title="Live load and options">
              <Choice
                label="Girder"
                value={inputs.girder}
                options={[
                  { value: "both", label: "Both (the larger factor, the smaller width)" },
                  { value: "interior", label: "Interior" },
                  { value: "exterior", label: "Exterior" },
                ]}
                onChange={set("girder")}
              />
              <Toggle label="Exterior girder not less than the rigid cross-section (4.6.2.2.2d)" value={inputs.rigidMethod} onChange={set("rigidMethod")} />
              <Toggle label="Skew correction for shear on interior girders too" value={inputs.skewShearInterior} onChange={set("skewShearInterior")} />
              <Field label="Dynamic load allowance IM" value={inputs.IM} onChange={set("IM")} step={0.01} />
              <Field label="Construction live load on the deck" unit="psf" value={inputs.constructionLL} onChange={set("constructionLL")} />
              <Field label="Flange lateral bending, construction" unit="ksi" value={inputs.flConstruction} onChange={set("flConstruction")} step={0.5} hint="From the overhang brackets (6.10.1.6)" />
              <Toggle label="Check live load deflection (2.5.2.6.2)" value={inputs.deflection.check} onChange={(v) => set("deflection")({ ...inputs.deflection, check: v })} />
              {inputs.deflection.check && <Field label="Limit: span /" value={inputs.deflection.limit} onChange={(v) => set("deflection")({ ...inputs.deflection, limit: v })} step={50} />}
              <Field label="η (ηD·ηR·ηI)" value={inputs.eta} onChange={set("eta")} step={0.05} hint="1.3.2" />
              <Toggle label="Negative flexure by Appendix A6 where it applies" value={inputs.appendixA6} onChange={set("appendixA6")} />
              <Toggle label="Moment redistribution from the piers (Appendix B6)" value={inputs.redistribution} onChange={set("redistribution")} />
            </Section>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {outcome.error ? (
            <DesignErrorCard message={outcome.error} />
          ) : (
            r && (
              <>
                <ChecksBanner checks={r.checks} />
                <Card>
                  <CardContent className="py-3">
                    <SteelGirderSketch result={r} />
                    <p className="pt-1 text-[11px] text-muted-foreground">
                      Governing ratio {fmt(r.governing, 3)}. Blue: positive moment, red: negative, amber: shear. Numbered blocks: the girder&apos;s sections; ticks: brace points.
                    </p>
                  </CardContent>
                </Card>
                <ChecksTable checks={r.checks} groupOf={groupOf} />
                <div className="grid gap-4 xl:grid-cols-2">
                  <KeyValues
                    title="Deck, loads and distribution"
                    rows={[
                      ["Modular ratio n", fmt(r.n, 2)],
                      ["Effective width: interior / exterior / used", `${fmt(r.beff.interior)} / ${fmt(r.beff.exterior)} / ${fmt(r.beff.used)} in`],
                      ["DC1 besides the steel / DC2 / DW", `${fmt(r.loads.dc1Deck, 3)} / ${fmt(r.loads.dc2, 3)} / ${fmt(r.loads.dw, 3)} klf`],
                      ...r.df.spans.map((d, k) => [`Span ${k + 1}: moment / shear factors`, `${fmt(d.moment, 3)} / ${fmt(d.shear, 3)}`] as [string, string]),
                      ...r.df.piers.map((d, k) => [`Pier ${k + 1}: negative moment factor`, fmt(d.moment, 3)] as [string, string]),
                    ]}
                  />
                  <KeyValues
                    title="Reactions per girder (kip; live load with its factor and IM on the truck)"
                    rows={r.reactions.map((x) => [x.support === 0 || x.support === r.spans.length ? `Abutment ${x.support === 0 ? 1 : 2}` : `Pier ${x.support}`, `DC ${fmt(x.dc, 1)}, DW ${fmt(x.dw, 1)}, truck ${fmt(x.truck, 1)}, lane ${fmt(x.lane, 1)}`] as [string, string])}
                  />
                </div>
                <KeyValues
                  title="Sections (steel / short-term n / long-term 3n / steel and bars): I in⁴, S to the bottom in³"
                  rows={r.sections.map((s) => [`${s.k + 1}: ${s.name}, ${fmt(s.weight)} plf`, [s.steel, s.short, s.long, s.bars].map((p) => `${fmt(p.I, 0)} / ${fmt(p.Sbot, 0)}`).join("; ")] as [string, string])}
                />
                <KeyValues
                  title="Camber: dead load deflections, downward (in), DC1 on the steel, DC2 and DW on the long-term section (6.7.2)"
                  rows={r.camber
                    .filter((c) => Math.abs(c.at * 10 - Math.round(c.at * 10)) < 1e-6 && [0.2, 0.4, 0.5, 0.6, 0.8].some((t) => Math.abs(c.at - t) < 1e-6))
                    .map((c) => [`Span ${c.span + 1}, ${fmt(c.at, 1)}L`, `steel ${fmt(c.steel, 2)}, deck ${fmt(c.deck, 2)}, DC2 ${fmt(c.dc2, 2)}; total ${fmt(c.total, 2)} (DW ${fmt(c.dw, 2)} more)`] as [string, string])}
                />
                {r.b6.piers.length > 0 && (inputs.appendixA6 || inputs.redistribution) && (
                  <KeyValues
                    title={`Pier sections (Appendices A6${inputs.redistribution ? ", B6" : ""}): kip·ft`}
                    rows={r.b6.piers.map((q) => [
                      `Pier ${q.pier}`,
                      `Me ${fmt(Math.abs(q.Me), 0)}; Myc ${fmt(q.Myc, 0)}, Myt ${fmt(q.Myt, 0)}, Mp ${fmt(q.Mp, 0)}; Mn ${fmt(q.Mn / 12, 0)}${q.useA6 ? ` (A6, Rpc ${fmt(q.a6.Rpc, 3)})` : " (6.10.8)"}${inputs.redistribution ? (r.b6.active ? `; Mpe ${fmt(q.Mpe.strength / 12, 0)}, Mrd ${fmt(q.Mrd, 0)} (service ${fmt(q.MrdSvc, 0)})` : "; not redistributed: a B6.2 limit is missed") : ""}`,
                    ] as [string, string])}
                  />
                )}
                {r.crossFrames && (
                  <KeyValues
                    title="Cross-frames: stability bracing (kip·in/rad, kip)"
                    rows={r.crossFrames.cases.map((c) => [`${c.label[0].toUpperCase()}${c.label.slice(1)}`, `required ${fmt(c.req, 0)}, provided ${fmt(c.act, 0)} (brace ${fmt(c.bbr, 0)}, girders ${fmt(c.bg, 0)}); Mbr ${fmt(c.Mbr, 1)} kip·in, strut ${fmt(c.Fstrut, 2)}, diagonal ${fmt(c.Fdiag, 2)}`] as [string, string])}
                  />
                )}
                <p className="text-[11px] text-muted-foreground">
                  Not checked here: the cross-frames&apos; connections and their fatigue, wind&apos;s lateral bending of the bottom flange at Strength III and V, and the refined method of Appendix B6.6. Camber leaves out the vertical profile.
                </p>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
