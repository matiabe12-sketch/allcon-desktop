"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { COHESIVE_OFF, COMPLEX_OFF, designScour, MATERIAL_DEFAULT, SCOUR_DEFAULTS, type BedCondition, type ComplexPier, type PierMaterial, type PierShape, type ScourAbutment, type ScourFlood, type ScourInputs, type ScourMode, type ScourPier } from "@/lib/design/scour/scour";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, Section, Toggle } from "./design-kit";
import { ScourPlot } from "./scour-plot";

// Bridge scour: the bed, each flood's contraction (and pressure flow), the piers and the abutments on the left; the
// totals and minimum scour elevations at every element, and each element's working, on the right, saved as you go.

const MODES = [
  { value: "auto" as ScourMode, label: "By the approach velocity (Vc)" },
  { value: "live" as ScourMode, label: "Live-bed" },
  { value: "clear" as ScourMode, label: "Clear-water" },
];
const SHAPES = [
  { value: "round" as PierShape, label: "Round nose (K1 1.0)" },
  { value: "square" as PierShape, label: "Square nose (K1 1.1)" },
  { value: "circular" as PierShape, label: "Circular cylinder (K1 1.0)" },
  { value: "sharp" as PierShape, label: "Sharp nose (K1 0.9)" },
  { value: "columns" as PierShape, label: "Multiple columns (a bent)" },
];
const METHODS = [
  { value: "hec18" as const, label: "HEC-18 (CSU) equation" },
  { value: "fdot" as const, label: "FDOT method (HEC-18 7.3)" },
];
const MATERIALS = [
  { value: "granular" as PierMaterial["kind"], label: "Sand or gravel" },
  { value: "cohesive" as PierMaterial["kind"], label: "Cohesive (clay, silt)" },
  { value: "rock" as PierMaterial["kind"], label: "Erodible rock" },
];
const BEDS = [
  { value: "clear" as BedCondition, label: "Clear-water (K3 1.1)" },
  { value: "plane" as BedCondition, label: "Plane bed or antidunes (1.1)" },
  { value: "small-dunes" as BedCondition, label: "Small dunes (1.1)" },
  { value: "medium-dunes" as BedCondition, label: "Medium dunes (1.2)" },
  { value: "large-dunes" as BedCondition, label: "Large dunes (1.3)" },
];

export function ScourEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: ScourInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof ScourInputs>(k: K) => (v: ScourInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const outcome = useMemo(() => {
    try {
      return { result: designScour(inputs), error: null as string | null };
    } catch (err) {
      return { result: null, error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;

  const setFlood = (k: number, f: (x: ScourFlood) => ScourFlood) => setInputs((s) => ({ ...s, floods: s.floods.map((x, j) => (j === k ? f(x) : x)) }));
  const setPier = (k: number, f: (x: ScourPier) => ScourPier) => setInputs((s) => ({ ...s, piers: s.piers.map((x, j) => (j === k ? f(x) : x)) }));
  const setCoh = (k: number, f: (c: typeof COHESIVE_OFF) => typeof COHESIVE_OFF) => setFlood(k, (x) => ({ ...x, contraction: { ...x.contraction, cohesive: f(x.contraction.cohesive ?? COHESIVE_OFF) } }));
  const setMat = (k: number, f: (m: PierMaterial) => PierMaterial) => setPier(k, (x) => ({ ...x, material: f(x.material ?? MATERIAL_DEFAULT) }));
  const setCx = (k: number, f: (c: ComplexPier) => ComplexPier) => setPier(k, (x) => ({ ...x, complex: f(x.complex ?? COMPLEX_OFF) }));
  const setAbut = (k: number, f: (x: ScourAbutment) => ScourAbutment) => setInputs((s) => ({ ...s, abutments: s.abutments.map((x, j) => (j === k ? f(x) : x)) }));
  const flows = <T,>(list: T[], fill: T) => inputs.floods.map((_, k) => list[k] ?? list[list.length - 1] ?? fill);

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Bridge Scour · FHWA HEC-18, CDOT DDM 10.6" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Bed material" open>
              <Field label="D50" unit="mm" value={inputs.D50} onChange={set("D50")} step={0.1} hint="The upper foot of the bed upstream; 0.2 mm is the floor in the critical velocity (HEC-18 6.7)" />
              <Field label="Fall velocity (0: worked out)" unit="ft/s" value={inputs.fall} onChange={set("fall")} step={0.01} hint="HEC-18 Figure 6.8; worked out for natural sand, SG 2.65" />
              <Field label="Floodplain critical shear stress (0: by grain size)" unit="psf" value={inputs.tauc} onChange={set("tauc")} step={0.01} hint="Cohesive floodplains, abutment condition (b), Eq. 8.7" />
              {inputs.tauc > 0 && <Field label="Floodplain Manning n" value={inputs.nFloodplain} onChange={set("nFloodplain")} step={0.005} />}
            </Section>
            {inputs.floods.map((f, k) => (
              <Section key={k} title={f.name} open={k === 0}>
                <Field label="Long-term degradation" unit="ft" value={f.ltd} onChange={(v) => setFlood(k, (x) => ({ ...x, ltd: v }))} step={0.5} hint="HEC-20 stream stability; at every element" />
                <Choice label="Contraction scour" value={f.contraction.mode} options={MODES} onChange={(v) => setFlood(k, (x) => ({ ...x, contraction: { ...x.contraction, mode: v } }))} />
                <p className="pt-1 text-[11px] font-medium text-muted-foreground">Upstream main channel (the approach section)</p>
                <Field label="Flow Q1" unit="cfs" value={f.contraction.Q1} onChange={(v) => setFlood(k, (x) => ({ ...x, contraction: { ...x.contraction, Q1: v } }))} step={100} />
                <Field label="Width W1" unit="ft" value={f.contraction.W1} onChange={(v) => setFlood(k, (x) => ({ ...x, contraction: { ...x.contraction, W1: v } }))} />
                <Field label="Average depth y1" unit="ft" value={f.contraction.y1} onChange={(v) => setFlood(k, (x) => ({ ...x, contraction: { ...x.contraction, y1: v } }))} step={0.1} />
                <Field label="Energy slope S1" unit="ft/ft" value={f.contraction.S1} onChange={(v) => setFlood(k, (x) => ({ ...x, contraction: { ...x.contraction, S1: v } }))} step={0.0005} />
                <p className="pt-1 text-[11px] font-medium text-muted-foreground">At the bridge (the contracted section)</p>
                <Field label="Flow Q2" unit="cfs" value={f.contraction.Q2} onChange={(v) => setFlood(k, (x) => ({ ...x, contraction: { ...x.contraction, Q2: v } }))} step={100} />
                <Field label="Width W2, less the piers" unit="ft" value={f.contraction.W2} onChange={(v) => setFlood(k, (x) => ({ ...x, contraction: { ...x.contraction, W2: v } }))} />
                <Field label="Existing depth y0" unit="ft" value={f.contraction.y0} onChange={(v) => setFlood(k, (x) => ({ ...x, contraction: { ...x.contraction, y0: v } }))} step={0.1} />
                <Toggle label="Armoring limits live-bed scour (the smaller depth)" value={f.contraction.armor} onChange={(v) => setFlood(k, (x) => ({ ...x, contraction: { ...x.contraction, armor: v } }))} />
                <Toggle label="Cohesive bed (HEC-18 6.7)" value={!!f.contraction.cohesive?.on} onChange={(v) => setCoh(k, (c) => ({ ...c, on: v }))} />
                {f.contraction.cohesive?.on && (
                  <>
                    <Field label="Critical shear stress τc" unit="psf" value={f.contraction.cohesive.tauc} onChange={(v) => setCoh(k, (c) => ({ ...c, tauc: v }))} step={0.01} hint="From erosion tests (Eq. 6.6)" />
                    <Field label="Manning n at the bridge" value={f.contraction.cohesive.n} onChange={(v) => setCoh(k, (c) => ({ ...c, n: v }))} step={0.005} />
                    <div className="grid grid-cols-2 gap-x-2">
                      <Field label="Initial rate (0: ultimate)" unit="ft/hr" value={f.contraction.cohesive.zdot} onChange={(v) => setCoh(k, (c) => ({ ...c, zdot: v }))} step={0.01} />
                      <Field label="Flood duration" unit="hr" value={f.contraction.cohesive.hours} onChange={(v) => setCoh(k, (c) => ({ ...c, hours: v }))} />
                    </div>
                  </>
                )}
                <Toggle label="Pressure flow (the low chord submerged)" value={f.pressure.on} onChange={(v) => setFlood(k, (x) => ({ ...x, pressure: { ...x.pressure, on: v } }))} />
                {f.pressure.on && (
                  <>
                    <Field label="Upstream depth hu" unit="ft" value={f.pressure.hu} onChange={(v) => setFlood(k, (x) => ({ ...x, pressure: { ...x.pressure, hu: v } }))} step={0.1} />
                    <Field label="Opening height hb (bed to low chord)" unit="ft" value={f.pressure.hb} onChange={(v) => setFlood(k, (x) => ({ ...x, pressure: { ...x.pressure, hb: v } }))} step={0.1} />
                    <Field label="Deck depth T (girders, deck, parapet)" unit="ft" value={f.pressure.T} onChange={(v) => setFlood(k, (x) => ({ ...x, pressure: { ...x.pressure, T: v } }))} step={0.1} />
                    <Field label="Flow through the opening" unit="cfs" value={f.pressure.Qb} onChange={(v) => setFlood(k, (x) => ({ ...x, pressure: { ...x.pressure, Qb: v } }))} step={100} hint="Less any overtopping (from HEC-RAS or 2D)" />
                  </>
                )}
              </Section>
            ))}
            {inputs.piers.map((p, k) => (
              <Section key={`p${k}`} title={p.name || `Pier ${k + 1}`}>
                <label className="grid grid-cols-[1fr_7rem] items-center gap-2 py-0.5 text-xs">
                  <span className="text-muted-foreground">Name</span>
                  <input value={p.name} onChange={(e) => setPier(k, (x) => ({ ...x, name: e.target.value }))} className="h-7 rounded-md border bg-transparent px-1 text-xs" aria-label="Pier name" />
                </label>
                <Choice label="Shape" value={p.shape} options={SHAPES} onChange={(v) => setPier(k, (x) => ({ ...x, shape: v }))} />
                <Field label={p.shape === "columns" ? "Column diameter" : "Width a"} unit="ft" value={p.a} onChange={(v) => setPier(k, (x) => ({ ...x, a: v }))} step={0.25} />
                {p.shape === "columns" ? (
                  <div className="grid grid-cols-2 gap-x-2">
                    <Field label="Columns" value={p.columns.n} onChange={(v) => setPier(k, (x) => ({ ...x, columns: { ...x.columns, n: Math.max(1, Math.round(v)) } }))} />
                    <Field label="Spacing" unit="ft" value={p.columns.spacing} onChange={(v) => setPier(k, (x) => ({ ...x, columns: { ...x.columns, spacing: v } }))} />
                  </div>
                ) : (
                  <Field label="Length L" unit="ft" value={p.L} onChange={(v) => setPier(k, (x) => ({ ...x, L: v }))} />
                )}
                <Choice label="Bed material at the pier" value={p.material?.kind ?? "granular"} options={MATERIALS} onChange={(v) => setMat(k, (m) => ({ ...m, kind: v }))} />
                {(p.material?.kind ?? "granular") === "granular" && <Choice label="Method" value={p.method ?? "hec18"} options={METHODS} onChange={(v) => setPier(k, (x) => ({ ...x, method: v }))} />}
                {p.material?.kind === "cohesive" && <Field label="Critical velocity Vc" unit="ft/s" value={p.material.Vc} onChange={(v) => setMat(k, (m) => ({ ...m, Vc: v }))} step={0.1} hint="From erosion tests; Eq. 7.35" />}
                {p.material?.kind === "rock" && (
                  <>
                    <div className="grid grid-cols-2 gap-x-2">
                      <Field label="Erodibility index K" value={p.material.K} onChange={(v) => setMat(k, (m) => ({ ...m, K: v }))} step={0.1} hint="HEC-18 7.13" />
                      <Field label="Energy slope" unit="ft/ft" value={p.material.S} onChange={(v) => setMat(k, (m) => ({ ...m, S: v }))} step={0.0005} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-2">
                      <Field label="Abrasion GSN (0: none)" unit="ft" value={p.material.GSN} onChange={(v) => setMat(k, (m) => ({ ...m, GSN: v }))} step={0.01} hint="Per unit of cumulative stream power, from slake durability tests" />
                      <Field label="Cumulative stream power Ω" value={p.material.omega} onChange={(v) => setMat(k, (m) => ({ ...m, omega: v }))} />
                    </div>
                  </>
                )}
                <Choice label="Bed condition" value={p.bed} options={BEDS} onChange={(v) => setPier(k, (x) => ({ ...x, bed: v }))} />
                <Field label="Datum (thalweg or floodplain)" unit="ft El." value={p.datum} onChange={(v) => setPier(k, (x) => ({ ...x, datum: v }))} step={0.5} />
                <Field label="Top of non-erodible rock (0: none)" unit="ft El." value={p.rock ?? 0} onChange={(v) => setPier(k, (x) => ({ ...x, rock: v > 0 ? v : null }))} step={0.5} />
                <Toggle label="In the contracted channel (add contraction scour)" value={p.contraction} onChange={(v) => setPier(k, (x) => ({ ...x, contraction: v }))} />
                <Toggle label="Wide-pier factor Kw where it applies (judgment)" value={p.wide} onChange={(v) => setPier(k, (x) => ({ ...x, wide: v }))} />
                {p.shape !== "columns" && (p.material?.kind ?? "granular") === "granular" && <Toggle label="Footing or pile cap in the flow (complex pier, 7.5)" value={!!p.complex?.on} onChange={(v) => setCx(k, (c) => ({ ...c, on: v }))} />}
                {p.shape !== "columns" && (p.material?.kind ?? "granular") === "granular" && p.complex?.on && (
                  <>
                    <div className="grid grid-cols-2 gap-x-2">
                      <Field label="Cap width" unit="ft" value={p.complex.capWidth} onChange={(v) => setCx(k, (c) => ({ ...c, capWidth: v }))} />
                      <Field label="Cap length" unit="ft" value={p.complex.capLength} onChange={(v) => setCx(k, (c) => ({ ...c, capLength: v }))} />
                      <Field label="Thickness T" unit="ft" value={p.complex.T} onChange={(v) => setCx(k, (c) => ({ ...c, T: v }))} step={0.25} />
                      <Field label="Overhang f" unit="ft" value={p.complex.f} onChange={(v) => setCx(k, (c) => ({ ...c, f: v }))} step={0.25} />
                    </div>
                    <Field label="Bottom of cap or footing" unit="ft El." value={p.complex.capBottom} onChange={(v) => setCx(k, (c) => ({ ...c, capBottom: v }))} step={0.5} hint="Its height above the bed after degradation and contraction scour sets Case 1 or 2" />
                    <Choice label="Cap nose" value={p.complex.capShape} options={[{ value: "square" as const, label: "Square (K1 1.1)" }, { value: "round" as const, label: "Round (K1 1.0)" }]} onChange={(v) => setCx(k, (c) => ({ ...c, capShape: v }))} />
                    <Field label="Bed roughness ks" unit="ft" value={p.complex.ks} onChange={(v) => setCx(k, (c) => ({ ...c, ks: v }))} step={0.005} hint="D84 for sand, 3.5 D84 for gravel (an exposed footing, Eq. 7.26)" />
                    <Toggle label="Piles exposed below the cap" value={p.complex.piles.on} onChange={(v) => setCx(k, (c) => ({ ...c, piles: { ...c.piles, on: v } }))} />
                    {p.complex.piles.on && (
                      <div className="grid grid-cols-2 gap-x-2">
                        <Field label="Piles across" value={p.complex.piles.across} onChange={(v) => setCx(k, (c) => ({ ...c, piles: { ...c.piles, across: Math.max(1, Math.round(v)) } }))} />
                        <Field label="Rows along" value={p.complex.piles.rows} onChange={(v) => setCx(k, (c) => ({ ...c, piles: { ...c.piles, rows: Math.max(1, Math.round(v)) } }))} />
                        <Field label="Pile width" unit="ft" value={p.complex.piles.d} onChange={(v) => setCx(k, (c) => ({ ...c, piles: { ...c.piles, d: v } }))} step={0.25} />
                        <Field label="Spacing" unit="ft" value={p.complex.piles.S} onChange={(v) => setCx(k, (c) => ({ ...c, piles: { ...c.piles, S: v } }))} step={0.25} />
                      </div>
                    )}
                    {p.complex.piles.on && <Toggle label="Square piles (K1 1.1)" value={p.complex.piles.square} onChange={(v) => setCx(k, (c) => ({ ...c, piles: { ...c.piles, square: v } }))} />}
                  </>
                )}
                <Toggle label="Debris on the pier (HEC-18 7.7)" value={p.debris.on} onChange={(v) => setPier(k, (x) => ({ ...x, debris: { ...x.debris, on: v } }))} />
                {p.debris.on && (
                  <>
                    <Choice
                      label="Debris shape"
                      value={p.debris.shape}
                      options={[
                        { value: "rectangular" as const, label: "Rectangular" },
                        { value: "triangular" as const, label: "Triangular" },
                      ]}
                      onChange={(v) => setPier(k, (x) => ({ ...x, debris: { ...x.debris, shape: v } }))}
                    />
                    <div className="grid grid-cols-2 gap-x-2">
                      <Field label="Width" unit="ft" value={p.debris.W} onChange={(v) => setPier(k, (x) => ({ ...x, debris: { ...x.debris, W: v } }))} />
                      <Field label="Thickness" unit="ft" value={p.debris.H} onChange={(v) => setPier(k, (x) => ({ ...x, debris: { ...x.debris, H: v } }))} />
                    </div>
                  </>
                )}
                {flows(p.flow, p.flow[0]).map((fl, j) => (
                  <div key={j} className="pt-1">
                    <p className="text-[11px] font-medium text-muted-foreground">{inputs.floods[j].name}: upstream of the pier</p>
                    <div className="grid grid-cols-3 gap-x-2">
                      <Field label="y1" unit="ft" value={fl.y1} onChange={(v) => setPier(k, (x) => ({ ...x, flow: flows(x.flow, fl).map((q, m) => (m === j ? { ...q, y1: v } : q)) }))} step={0.1} />
                      <Field label="V1" unit="ft/s" value={fl.V1} onChange={(v) => setPier(k, (x) => ({ ...x, flow: flows(x.flow, fl).map((q, m) => (m === j ? { ...q, V1: v } : q)) }))} step={0.1} />
                      <Field label="Attack" unit="°" value={fl.angle} onChange={(v) => setPier(k, (x) => ({ ...x, flow: flows(x.flow, fl).map((q, m) => (m === j ? { ...q, angle: v } : q)) }))} />
                    </div>
                  </div>
                ))}
                <Button size="xs" variant="ghost" className="mt-1 text-destructive" onClick={() => setInputs((s) => ({ ...s, piers: s.piers.filter((_, j) => j !== k) }))}>
                  <Trash2 className="size-3" /> Remove this pier
                </Button>
              </Section>
            ))}
            {inputs.abutments.map((a, k) => (
              <Section key={`a${k}`} title={a.name || `Abutment ${k + 1}`}>
                <label className="grid grid-cols-[1fr_7rem] items-center gap-2 py-0.5 text-xs">
                  <span className="text-muted-foreground">Name</span>
                  <input value={a.name} onChange={(e) => setAbut(k, (x) => ({ ...x, name: e.target.value }))} className="h-7 rounded-md border bg-transparent px-1 text-xs" aria-label="Abutment name" />
                </label>
                <Choice
                  label="Type"
                  value={a.type}
                  options={[
                    { value: "spill-through" as const, label: "Spill-through" },
                    { value: "wingwall" as const, label: "Wingwall (vertical wall)" },
                  ]}
                  onChange={(v) => setAbut(k, (x) => ({ ...x, type: v }))}
                />
                <Field label="Embankment length / floodplain width" value={a.LBf} onChange={(v) => setAbut(k, (x) => ({ ...x, LBf: v }))} step={0.05} hint="0.75 or more: condition (a), live-bed; less: (b), clear-water (HEC-18 8.6.3)" />
                <Field label="Datum (thalweg or floodplain)" unit="ft El." value={a.datum} onChange={(v) => setAbut(k, (x) => ({ ...x, datum: v }))} step={0.5} />
                <Field label="Top of non-erodible rock (0: none)" unit="ft El." value={a.rock ?? 0} onChange={(v) => setAbut(k, (x) => ({ ...x, rock: v > 0 ? v : null }))} step={0.5} />
                {flows(a.flow, a.flow[0]).map((fl, j) => (
                  <div key={j} className="pt-1">
                    <p className="text-[11px] font-medium text-muted-foreground">{inputs.floods[j].name}</p>
                    <div className="grid grid-cols-2 gap-x-2">
                      <Field label="q1 upstream" unit="ft²/s" value={fl.q1} onChange={(v) => setAbut(k, (x) => ({ ...x, flow: flows(x.flow, fl).map((q, m) => (m === j ? { ...q, q1: v } : q)) }))} step={0.5} />
                      <Field label="q2 at the abutment" unit="ft²/s" value={fl.q2} onChange={(v) => setAbut(k, (x) => ({ ...x, flow: flows(x.flow, fl).map((q, m) => (m === j ? { ...q, q2: v } : q)) }))} step={0.5} />
                      <Field label="y1 upstream" unit="ft" value={fl.y1} onChange={(v) => setAbut(k, (x) => ({ ...x, flow: flows(x.flow, fl).map((q, m) => (m === j ? { ...q, y1: v } : q)) }))} step={0.1} />
                      <Field label="y0 before scour" unit="ft" value={fl.y0} onChange={(v) => setAbut(k, (x) => ({ ...x, flow: flows(x.flow, fl).map((q, m) => (m === j ? { ...q, y0: v } : q)) }))} step={0.1} />
                    </div>
                  </div>
                ))}
                <Button size="xs" variant="ghost" className="mt-1 text-destructive" onClick={() => setInputs((s) => ({ ...s, abutments: s.abutments.filter((_, j) => j !== k) }))}>
                  <Trash2 className="size-3" /> Remove this abutment
                </Button>
              </Section>
            ))}
            <div className="flex gap-2 py-2">
              <Button size="xs" variant="outline" onClick={() => setInputs((s) => ({ ...s, piers: [...s.piers, { ...SCOUR_DEFAULTS.piers[0], name: `Pier ${s.piers.length + 2}` }] }))}>
                <Plus className="size-3" /> Pier
              </Button>
              <Button size="xs" variant="outline" onClick={() => setInputs((s) => ({ ...s, abutments: [...s.abutments, { ...SCOUR_DEFAULTS.abutments[0], name: `Abutment ${s.abutments.length + 1}` }] }))}>
                <Plus className="size-3" /> Abutment
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4">
          {outcome.error ? (
            <DesignErrorCard message={outcome.error} />
          ) : (
            r && (
              <>
                <Card>
                  <CardContent className="py-3">
                    <p className="mb-2 text-xs font-semibold">Total scour and minimum scour elevation</p>
                    <table className="w-full text-xs tabular-nums">
                      <thead className="text-muted-foreground">
                        <tr className="border-b text-left">
                          <th className="py-1 font-normal">Element</th>
                          <th className="font-normal">Flood</th>
                          <th className="text-right font-normal">LTD</th>
                          <th className="text-right font-normal">Contraction</th>
                          <th className="text-right font-normal">Local</th>
                          <th className="text-right font-normal">Total, ft</th>
                          <th className="text-right font-normal">Elevation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.elements.flatMap((e) =>
                          e.floods.map((f, k) => (
                            <tr key={`${e.name}-${k}`} className="border-b last:border-0">
                              <td className="py-1">{k === 0 ? e.name : ""}</td>
                              <td className="text-muted-foreground">{f.name}</td>
                              <td className="text-right">{fmt(f.ltd, 2)}</td>
                              <td className="text-right">{e.kind === "pier" ? fmt(f.contraction, 2) : "in local"}</td>
                              <td className="text-right">{fmt(f.local, 2)}</td>
                              <td className="text-right font-medium">{fmt(f.total, 2)}</td>
                              <td className="text-right">
                                {fmt(f.elevation, 2)}
                                {f.rockLimited ? " (rock)" : ""}
                              </td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[11px] text-muted-foreground">Design the foundations for the scour design flood at Strength and Service, and check them for the check flood at the Extreme Event (AASHTO 2.6.4.4.2, 3.7.5). Riprap and other countermeasures aren&apos;t counted (CDOT DDM 10.6.3).</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3">
                    <p className="mb-2 text-xs font-semibold">Scour elevations under each element</p>
                    <ScourPlot elements={r.elements} />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3">
                    <p className="mb-2 text-xs font-semibold">Contraction scour</p>
                    <div className="space-y-1 text-xs">
                      {r.contraction.map((c, k) => (
                        <p key={k}>
                          <span className="font-medium">{inputs.floods[k].name}:</span> V {fmt(c.V, 2)} ft/s against Vc {fmt(c.Vc, 2)} ft/s, {c.live ? `live-bed (k1 ${c.k1})` : "clear-water"}; {c.cohesive ? `cohesive bed: ultimate ${fmt(c.cohesive.ult, 2)} ft${c.cohesive.timed ? `, ${fmt(c.cohesive.ys, 2)} ft in the flood` : ""}` : `y2 ${fmt(c.y2, 2)} ft`}, scour {fmt(c.ys, 2)} ft
                          {c.pressure ? `; pressure flow: t ${fmt(c.pressure.t, 2)} ft, scour ${fmt(c.pressure.ys, 2)} ft${c.pressure.overtopping ? " (overtopping)" : ""}; ${c.governs} governs` : ""}.
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3">
                    <p className="mb-2 text-xs font-semibold">Piers and abutments</p>
                    <div className="space-y-1 text-xs">
                      {r.piers.map(({ pier, local }) =>
                        local.map((l, k) => (
                          <p key={`${pier.name}-${k}`}>
                            <span className="font-medium">
                              {pier.name}, {inputs.floods[k].name}:
                            </span>{" "}
                            {l.method === "hec18" ? (
                              <>
                                a {fmt(l.a, 2)} ft, Fr {fmt(l.Fr, 2)}, K1 {fmt(l.K1, 2)}, K2 {fmt(l.K2, 2)}, K3 {fmt(l.K3, 2)}
                                {l.Kw < 1 ? `, Kw ${fmt(l.Kw, 2)}` : ""}
                              </>
                            ) : (
                              { fdot: "FDOT method", complex: "complex pier", cohesive: "cohesive bed", rock: "erodible rock" }[l.method]
                            )}
                            : ys {fmt(l.ys, 2)} ft{l.notes.length ? ` (${l.notes.join("; ")})` : ""}.
                          </p>
                        )),
                      )}
                      {r.abutments.map(({ abutment, local }) =>
                        local.map((l, k) => (
                          <p key={`${abutment.name}-${k}`}>
                            <span className="font-medium">
                              {abutment.name}, {inputs.floods[k].name}:
                            </span>{" "}
                            condition ({l.condition.toLowerCase()}), q2/q1 {fmt(l.ratio, 2)}, yc {fmt(l.yc, 2)} ft, α {fmt(l.alpha, 2)}: ymax {fmt(l.ymax, 2)} ft, ys {fmt(l.ys, 2)} ft.
                          </p>
                        )),
                      )}
                    </div>
                  </CardContent>
                </Card>
                {r.checks.length > 0 && <ChecksTable checks={r.checks} groupOf={() => "Notes"} />}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
