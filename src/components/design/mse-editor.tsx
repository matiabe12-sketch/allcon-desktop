"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DesignError } from "@/lib/design/walls/cip";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { designMseWall, embedmentRule, GEO_PRODUCTS, MSE_DEFAULTS, REINFORCEMENTS, type GeoProduct, type MseFactors, type MseInputs, type MseResult, type MseZone } from "@/lib/design/walls/mse";
import { RAIL_LEVELS, RAIL_NONE, type MseRail, type RailLevel } from "@/lib/design/walls/mse-rail";
import type { WallPoint } from "@/lib/design/walls/mse-quantities";
import { BarsField, ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { TakeoffPanel } from "./takeoff-panel";
import { MseSketch } from "./wall-sketch";

// Designing an MSE wall: the inputs on the left, worked out as they change (sketch, checks, the
// layers and the working) on the right, saved as you go.

const groupOf = (id: string) => (id.startsWith("geom") ? "Geometry" : id.startsWith("ext") ? "External stability" : id.startsWith("int-impact") ? "Barrier impact on the reinforcement" : id.startsWith("int") ? "Internal stability" : id.startsWith("rail") ? "Barrier and moment slab" : "Facing panel");
const PRODUCTS = GEO_PRODUCTS.map((g) => ({ value: g.id, label: g.name }));

export function MseEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: MseInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof MseInputs>(key: K) => (v: MseInputs[K]) => setInputs((s) => ({ ...s, [key]: v }));
  const setFactor = (key: keyof MseFactors) => (v: number) => setInputs((s) => ({ ...s, factors: { ...s.factors, [key]: v } }));
  const rail = inputs.rail ?? RAIL_NONE;
  const setRail = <K extends keyof MseRail>(key: K) => (v: MseRail[K]) => setInputs((s) => ({ ...s, rail: { ...(s.rail ?? RAIL_NONE), [key]: v } }));
  const zones = inputs.zones ?? [];
  const setZone = (k: number, z: Partial<MseZone>) => setInputs((s) => ({ ...s, zones: (s.zones ?? []).map((x, j) => (j === k ? { ...x, ...z } : x)) }));
  const points = inputs.segments ?? [];
  const setPoint = (k: number, z: Partial<WallPoint>) => setInputs((s) => ({ ...s, segments: (s.segments ?? []).map((x, j) => (j === k ? { ...x, ...z } : x)) }));
  const rf = inputs.rf ?? MSE_DEFAULTS.rf!;
  const hma = inputs.hma ?? { t: 0, gamma: 0.14 };
  const site = inputs.site ?? MSE_DEFAULTS.site!;

  const outcome = useMemo(() => {
    try {
      return { result: designMseWall(inputs), error: null };
    } catch (err) {
      return { result: null, error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const type = inputs.reinforcement;
  const steel = type === "steelstrip" || type === "steelgrid";

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="MSE Wall · AASHTO LRFD" canMakeCalc={!!r} />

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        {/* Inputs */}
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Geometry" open>
              <Field label="Design height H (top of leveling pad)" unit="ft" value={inputs.H} onChange={set("H")} step={0.25} />
              <Choice
                label="Base"
                value={inputs.base ?? "core"}
                options={[
                  { value: "core", label: "Core wall, 1:1 excavation (uniform length)" },
                  { value: "truncated-soil", label: "Truncated base, ¾:1 soil excavation" },
                  { value: "truncated-rock", label: "Truncated base, ½:1 rock excavation" },
                ]}
                onChange={set("base")}
              />
              <Field label={(inputs.base ?? "core") === "core" ? "Reinforcement length L" : "Length at the bottom L"} unit="ft" value={inputs.L} onChange={set("L")} step={0.5} hint={(inputs.base ?? "core") === "core" ? `0.7H = ${fmt(0.7 * inputs.H, 2)} ft` : `0.45H = ${fmt(0.45 * inputs.H, 2)} ft (4 ft least); it grows up the cut`} />
              <Field label="Embedment" unit="ft" value={inputs.embedment} onChange={set("embedment")} step={0.25} hint={`Least ${fmt(embedmentRule(inputs).required, 2)} ft: ${embedmentRule(inputs).note} (AASHTO 11.10.2.2)`} />
              <Field label="Ground in front (H:1V, 0 = level)" unit="H:1V" value={inputs.frontSlope ?? 0} onChange={set("frontSlope")} step={0.5} />
              <Toggle label="Soil in front may erode or be excavated" value={inputs.erosion ?? true} onChange={set("erosion")} />
              <Field label="Frost depth (0: not frost-susceptible)" unit="ft" value={inputs.frost ?? 0} onChange={set("frost")} step={0.5} />
              <Toggle label="On a rock foundation" value={!!inputs.onRock} onChange={set("onRock")} />
              <Field label="Backslope (H:1V, 0 = level)" unit="H:1V" value={inputs.backslope} onChange={set("backslope")} step={0.5} />
              <Choice
                label="Wall"
                value={inputs.wallType}
                options={[
                  { value: "wall", label: "Retaining wall" },
                  { value: "abutment", label: "Abutment / wingwall" },
                ]}
                onChange={set("wallType")}
              />
            </Section>
            <Section title="Soils" open>
              <Field label="Reinforced fill γr" unit="pcf" value={inputs.gammaR} scale={1000} onChange={set("gammaR")} />
              <Field label="Reinforced fill φr" unit="deg" value={inputs.phiR} onChange={set("phiR")} />
              <Field label="Retained fill γ" unit="pcf" value={inputs.gammaRet} scale={1000} onChange={set("gammaRet")} />
              <Field label="Retained fill φ" unit="deg" value={inputs.phiRet} onChange={set("phiRet")} />
              <Toggle label="Friction at the back of the reinforced zone δ = β" value={inputs.delta === null} onChange={(auto) => set("delta")(auto ? null : 0)} />
              {inputs.delta !== null && <Field label="δ" unit="deg" value={inputs.delta} onChange={set("delta")} />}
              <Field label="Foundation soil φ" unit="deg" value={inputs.phiF} onChange={set("phiF")} />
              <Field label="Nominal bearing resistance qn" unit="ksf" value={inputs.qn} onChange={set("qn")} step={0.1} />
            </Section>
            <Section title="Pavement">
              <Field label="Pavement (HMA) on the wall" unit="in" value={hma.t} onChange={(v) => set("hma")({ ...hma, t: v })} hint="CDOT's design charts take 12 in" />
              <Field label="Its unit weight" unit="pcf" value={hma.gamma} scale={1000} onChange={(v) => set("hma")({ ...hma, gamma: v })} />
            </Section>
            <Section title="Live load and seismic">
              <Toggle label="Live load surcharge" value={inputs.liveLoad} onChange={set("liveLoad")} />
              {inputs.liveLoad && inputs.wallType === "wall" && <Field label="Wall to edge of traffic" unit="ft" value={inputs.trafficDistance} onChange={set("trafficDistance")} />}
              <Toggle label="Seismic (Extreme Event I)" value={inputs.seismic} onChange={set("seismic")} />
              {inputs.seismic && <Toggle label={inputs.wallType === "abutment" ? "No analysis option (doesn't apply to an abutment: AASHTO 11.5.4.2)" : "No analysis: seismic zones 1–3 with CDOT's EQ details (B-504-A C)"} value={!!inputs.cdotSeismic} onChange={set("cdotSeismic")} />}
              {inputs.seismic && (!inputs.cdotSeismic || inputs.wallType === "abutment") && (
                <>
                  <Field label="PGA" unit="g" value={inputs.pga} onChange={set("pga")} step={0.005} />
                  <Field label="Site factor Fpga" value={inputs.fpga} onChange={set("fpga")} step={0.1} />
                  <Field label="kh / As (0.5 if it can move 1–2 in)" value={inputs.khFactor} onChange={set("khFactor")} step={0.5} />
                </>
              )}
            </Section>
            <Section title="Reinforcement" open>
              <Choice label="Type" value={type} options={REINFORCEMENTS.map((k) => ({ value: k.id, label: k.name }))} onChange={set("reinforcement")} />
              <Field label="Depth of the top layer" unit="ft" value={inputs.topLayer} onChange={set("topLayer")} step={0.25} />
              <Toggle label="Spacing and products by zones" value={!!inputs.zoned} onChange={set("zoned")} />
              {!inputs.zoned && <Field label="Vertical spacing Sv" unit="ft" value={inputs.Sv} onChange={set("Sv")} step={0.25} />}
              {inputs.zoned && (
                <div className="space-y-1 py-1">
                  <p className="text-[11px] text-muted-foreground">Each zone runs from the one above down to its bottom (ft below the top).</p>
                  {zones.map((zn, k) => (
                    <div key={k} className="grid grid-cols-[4rem_4rem_1fr_auto] items-center gap-1 text-xs">
                      <input type="number" value={zn.bottom} step={0.5} onChange={(e) => setZone(k, { bottom: Number(e.target.value) })} className="h-7 rounded-md border bg-transparent px-1" aria-label="Zone bottom, ft" title="Bottom, ft" />
                      <input type="number" value={zn.Sv} step={0.25} onChange={(e) => setZone(k, { Sv: Number(e.target.value) })} className="h-7 rounded-md border bg-transparent px-1" aria-label="Zone spacing, ft" title="Spacing, ft" />
                      <select value={zn.product} disabled={steel} onChange={(e) => setZone(k, { product: e.target.value as GeoProduct })} className="h-7 rounded-md border bg-transparent px-1" aria-label="Zone product">
                        {PRODUCTS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <Button size="icon-xs" variant="ghost" aria-label="Remove zone" onClick={() => setInputs((s) => ({ ...s, zones: (s.zones ?? []).filter((_, j) => j !== k) }))}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                  <Button size="xs" variant="outline" onClick={() => setInputs((s) => ({ ...s, zones: [...(s.zones ?? []), { bottom: (s.zones?.at(-1)?.bottom ?? 0) + 10, Sv: 2, product: "hdpe12000" }] }))}>
                    <Plus className="size-3" /> Zone
                  </Button>
                </div>
              )}
              <Toggle label="Top two layers twice as long (B-504-D1)" value={!!inputs.extendTop} onChange={set("extendTop")} />
              {!steel && (
                <>
                  <Choice label="Top two layers' product" value={inputs.topProduct ?? "same"} options={[{ value: "same", label: "As the zone (or Tal)" }, ...PRODUCTS]} onChange={set("topProduct")} />
                  <Field label="Long-term strength Tal (as entered)" unit="lb/ft" value={inputs.Tal} scale={1000} step={100} onChange={set("Tal")} hint="For layers without a listed product" />
                  <div className="grid grid-cols-3 gap-x-2">
                    <Field label="RF ID" value={rf.id} onChange={(v) => set("rf")({ ...rf, id: v })} step={0.05} />
                    <Field label="RF CR" value={rf.cr} onChange={(v) => set("rf")({ ...rf, cr: v })} step={0.05} hint="For Tal as entered" />
                    <Field label="RF D" value={rf.d} onChange={(v) => set("rf")({ ...rf, d: v })} step={0.05} />
                  </div>
                  <Field label="Coverage ratio Rc" value={inputs.Rc} onChange={set("Rc")} step={0.05} />
                </>
              )}
              {steel && (
                <>
                  <Field label="Steel yield Fy" unit="ksi" value={inputs.fyReinf} onChange={set("fyReinf")} />
                  <Field label="Design life (corrosion loss)" unit="yr" value={inputs.designLife} onChange={set("designLife")} step={25} />
                </>
              )}
              {type === "steelstrip" && (
                <>
                  <Field label="Strip width" unit="in" value={inputs.stripWidth} onChange={set("stripWidth")} step={0.25} />
                  <Field label="Strip thickness" unit="in" value={inputs.stripThickness} onChange={set("stripThickness")} step={0.01} />
                  <Field label="Strip spacing along the wall" unit="ft" value={inputs.stripSpacing} onChange={set("stripSpacing")} step={0.25} />
                  <Field label="Fill uniformity Cu = D60/D10" value={inputs.cu} onChange={set("cu")} step={0.5} />
                </>
              )}
              {type === "steelgrid" && (
                <>
                  <Field label="Longitudinal wire diameter" unit="in" value={inputs.gridLongDia} onChange={set("gridLongDia")} step={0.01} />
                  <Field label="Longitudinal wire spacing" unit="in" value={inputs.gridLongSpacing} onChange={set("gridLongSpacing")} />
                  <Field label="Transverse wire diameter t" unit="in" value={inputs.gridTransDia} onChange={set("gridTransDia")} step={0.01} />
                  <Field label="Transverse wire spacing St" unit="in" value={inputs.gridTransSpacing} onChange={set("gridTransSpacing")} />
                  <Field label="Coverage ratio Rc" value={inputs.Rc} onChange={set("Rc")} step={0.05} />
                </>
              )}
            </Section>
            <Section title="Barrier on top">
              <Choice
                label="Barrier"
                value={rail.kind}
                options={[
                  { value: "none", label: "None" },
                  { value: "anchor-slab", label: "Concrete barrier on a moment (rail anchor) slab" },
                  { value: "post-beam", label: "Post-and-beam (flexible) barrier" },
                ]}
                onChange={setRail("kind")}
              />
              {rail.kind === "anchor-slab" && (
                <>
                  <Choice label="Test level" value={rail.level} options={(Object.keys(RAIL_LEVELS) as RailLevel[]).map((k) => ({ value: k, label: RAIL_LEVELS[k].label }))} onChange={setRail("level")} />
                  <Field label="Impact height He (0: the table's)" unit="in" value={rail.He} onChange={setRail("He")} hint={`${RAIL_LEVELS[rail.level].He} in, Ls ${RAIL_LEVELS[rail.level].Ls} kip, Ld ${RAIL_LEVELS[rail.level].Ld} kip`} />
                  <Field label="Barrier weight" unit="plf" value={rail.barrierW} scale={1000} onChange={setRail("barrierW")} />
                  <div className="grid grid-cols-3 gap-x-2">
                    <Field label="Height" unit="in" value={rail.barrierH} onChange={setRail("barrierH")} />
                    <Field label="Base width" unit="in" value={rail.barrierWidth} onChange={setRail("barrierWidth")} />
                    <Field label="c.g. from face" unit="in" value={rail.barrierX} onChange={setRail("barrierX")} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-2">
                    <Field label="Slab width B" unit="ft" value={rail.B} onChange={setRail("B")} step={0.25} />
                    <Field label="Slab thickness" unit="in" value={rail.ts} onChange={setRail("ts")} />
                    <Field label="Coping depth below" unit="in" value={rail.copingDepth} onChange={setRail("copingDepth")} />
                    <Field label="Coping width" unit="in" value={rail.copingWidth} onChange={setRail("copingWidth")} />
                    <Field label="Cover on the slab" unit="in" value={rail.cover} onChange={setRail("cover")} />
                    <Field label="Length between joints" unit="ft" value={rail.Lj} onChange={setRail("Lj")} />
                  </div>
                  <Choice
                    label="Rotation point"
                    value={rail.rotation}
                    options={[
                      { value: "A", label: "A: coping isolated from the panel (its toe)" },
                      { value: "B", label: "B: coping bearing on the panel" },
                    ]}
                    onChange={setRail("rotation")}
                  />
                  {rail.rotation === "B" && <Field label="Point B from the slab's face" unit="in" value={rail.rotX} onChange={setRail("rotX")} />}
                  <Toggle label="Precast slab (smooth base: tan φr = ⅔ tan φ)" value={rail.precast} onChange={setRail("precast")} />
                  <div className="grid grid-cols-2 gap-x-2">
                    <Field label="Coping critical thickness" unit="in" value={rail.copingT} onChange={setRail("copingT")} />
                    <Field label="Its depth below the slab top" unit="in" value={rail.hCrit} onChange={setRail("hCrit")} />
                  </div>
                  <BarsField label="Coping bars" value={rail.copingBar} onChange={setRail("copingBar")} />
                </>
              )}
            </Section>
            <Section title="Site and segments (quantities)">
              <Field label="Excavation height at the layout line" unit="ft" value={site.excH} onChange={(v) => set("site")({ ...site, excH: v })} step={0.5} />
              <Field label="Existing ground's average angle θ" unit="deg" value={site.theta} onChange={(v) => set("site")({ ...site, theta: v })} />
              <p className="pt-1 text-[11px] text-muted-foreground">Points along the wall (station, design height, excavation height), for the segment table and its quantities.</p>
              {points.map((pt, k) => (
                <div key={k} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1 py-0.5 text-xs">
                  <input type="number" value={pt.station} onChange={(e) => setPoint(k, { station: Number(e.target.value) })} className="h-7 rounded-md border bg-transparent px-1" aria-label="Station, ft" title="Station, ft" />
                  <input type="number" value={pt.DH} step={0.5} onChange={(e) => setPoint(k, { DH: Number(e.target.value) })} className="h-7 rounded-md border bg-transparent px-1" aria-label="Design height, ft" title="Design height, ft" />
                  <input type="number" value={pt.excH} step={0.5} onChange={(e) => setPoint(k, { excH: Number(e.target.value) })} className="h-7 rounded-md border bg-transparent px-1" aria-label="Excavation height, ft" title="Excavation height, ft" />
                  <Button size="icon-xs" variant="ghost" aria-label="Remove point" onClick={() => setInputs((s) => ({ ...s, segments: (s.segments ?? []).filter((_, j) => j !== k) }))}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
              <Button size="xs" variant="outline" onClick={() => setInputs((s) => ({ ...s, segments: [...(s.segments ?? []), { station: (s.segments?.at(-1)?.station ?? -50) + 50, DH: s.H, excH: s.site?.excH ?? 0 }] }))}>
                <Plus className="size-3" /> Point
              </Button>
            </Section>
            <Section title="Facing panel">
              <Field label="Panel thickness" unit="in" value={inputs.panelT} onChange={set("panelT")} step={0.5} />
              <Field label="Span between connections" unit="in" value={inputs.panelSpan} onChange={set("panelSpan")} />
              <Field label="Clear cover (vertical bars)" unit="in" value={inputs.panelCover} onChange={set("panelCover")} step={0.25} />
              <BarsField label="Vertical bars" value={inputs.panelV} onChange={set("panelV")} />
              <BarsField label="Horizontal bars" value={inputs.panelH} onChange={set("panelH")} />
              <Field label="f'c" unit="ksi" value={inputs.fc} onChange={set("fc")} step={0.5} />
              <Field label="fy" unit="ksi" value={inputs.fy} onChange={set("fy")} />
              <Choice
                label="Exposure class"
                value={inputs.exposure}
                options={[
                  { value: 1, label: "Class 1" },
                  { value: 2, label: "Class 2" },
                ]}
                onChange={set("exposure")}
              />
            </Section>
            <Section title="Resistance factors and limits">
              <Field label="Bearing φb" value={inputs.phiB} onChange={set("phiB")} step={0.05} />
              <Field label="Bearing, extreme event" value={inputs.phiBEE} onChange={set("phiBEE")} step={0.05} />
              <Field label="Sliding φτ" value={inputs.phiS} onChange={set("phiS")} step={0.05} />
              <Field label="Sliding, extreme event" value={inputs.phiSEE} onChange={set("phiSEE")} step={0.05} />
              <Choice
                label="Eccentricity limit"
                value={inputs.eccDivisor}
                options={[
                  { value: 3, label: "L/3 (AASHTO 11.6.3.3)" },
                  { value: 4, label: "L/4 (older practice)" },
                ]}
                onChange={set("eccDivisor")}
              />
              <p className="pt-1 text-[11px] text-muted-foreground">Pullout and tensile resistance factors follow AASHTO 10th Table 11.5.7-1 and 11.5.8 for the reinforcement type (geosynthetics: tensile 0.80, geostrips 0.55, pullout 0.70).</p>
            </Section>
            <Section title="Load factors">
              <Field label="γEV, max" value={inputs.factors.evMax} onChange={setFactor("evMax")} step={0.05} />
              <Field label="γEV, min" value={inputs.factors.evMin} onChange={setFactor("evMin")} step={0.05} />
              <Field label="γEH" value={inputs.factors.eh} onChange={setFactor("eh")} step={0.05} />
              <Field label="γLS, Strength I" value={inputs.factors.ls} onChange={setFactor("ls")} step={0.05} />
              <Field label="γEQ (live load), Extreme Event I" value={inputs.factors.lsEE} onChange={setFactor("lsEE")} step={0.05} />
            </Section>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="min-w-0 space-y-4">
          {outcome.error ? (
            <DesignErrorCard message={outcome.error} />
          ) : (
            r && (
              <>
                <ChecksBanner checks={r.checks} />
                <Card>
                  <CardContent className="py-3">
                    <MseSketch inputs={inputs} result={r} />
                  </CardContent>
                </Card>
                <ChecksTable checks={r.checks} groupOf={groupOf} />
                <TakeoffPanel kind="mse-wall" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <Cdot r={r} />
                <Working r={r} seismic={!!r.groups.EEMax} />
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/** The working: soil, loads, load groups and each layer, for checking by hand. */
function Working({ r, seismic }: { r: MseResult; seismic: boolean }) {
  const g = r.groups;
  const groups = [
    ["Strength I, max (bearing)", g.StrMax],
    ["Strength I, min (sliding, eccentricity)", g.StrMin],
    ...(g.EEMax && g.EEMin
      ? [
          ["Extreme Event I, with LL (bearing)", g.EEMax],
          ["Extreme Event I (sliding, eccentricity)", g.EEMin],
        ]
      : []),
  ] as [string, NonNullable<typeof g.EEMax>][];
  const loads = r.loads;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <KeyValues
        title="Soil"
        rows={[
          ["Backslope β", `${fmt(r.soil.beta, 2)}°`],
          ["δ", `${fmt(r.soil.delta, 2)}°`],
          ["Ka, retained fill (Coulomb)", fmt(r.soil.Ka)],
          ["Ka, reinforced fill (internal)", fmt(r.soil.KaInt)],
          ["Height at the back h", `${fmt(r.soil.h, 3)} ft`],
          ...(r.soil.heq ? [["Live load surcharge heq", `${fmt(r.soil.heq, 2)} ft`] as [string, string]] : []),
          ["μ = tan(min φ)", fmt(r.soil.mu, 3)],
          ...(r.soil.kh !== undefined
            ? ([
                ["kh", fmt(r.soil.kh)],
                ["θMO", `${fmt(r.soil.thetaMO!, 3)}°`],
                ["KAE (Mononobe–Okabe)", fmt(r.soil.KAE!)],
              ] as [string, string][])
            : []),
        ]}
      />
      <KeyValues
        title="Unfactored loads (kip/ft)"
        rows={[
          ["EV1 reinforced zone", fmt(loads.EV1)],
          ["EV2 backslope over it", fmt(loads.EV2)],
          ["PEH earth pressure", fmt(loads.PEH)],
          ["  horizontal / vertical", `${fmt(loads.EHH)} / ${fmt(loads.EHV)}`],
          ["LS surcharge, vertical / horizontal", `${fmt(loads.LSV)} / ${fmt(loads.LSH)}`],
          ...(loads.PEQ !== undefined
            ? ([
                ["PIR inertia / PAE seismic pressure", `${fmt(loads.PIR!)} / ${fmt(loads.PAE!)}`],
                ["PEQ / MEQ (kip·ft/ft)", `${fmt(loads.PEQ)} / ${fmt(loads.MEQ!)}`],
              ] as [string, string][])
            : []),
        ]}
      />
      <Card className="xl:col-span-2">
        <CardContent className="overflow-x-auto py-3 text-xs">
          <p className="pb-1 font-semibold">Load groups (moments about the center of the base)</p>
          <table className="w-full">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-normal">Group</th>
                <th className="text-right font-normal">ΣV kip/ft</th>
                <th className="text-right font-normal">ΣH kip/ft</th>
                <th className="text-right font-normal">ΣM kip·ft/ft</th>
                <th className="text-right font-normal">e ft</th>
                <th className="text-right font-normal">σV ksf</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([name, x]) => (
                <tr key={name} className="border-b border-border/40">
                  <td>{name}</td>
                  <td className="text-right tabular-nums">{fmt(x.V)}</td>
                  <td className="text-right tabular-nums">{fmt(x.H)}</td>
                  <td className="text-right tabular-nums">{fmt(x.M)}</td>
                  <td className="text-right tabular-nums">{fmt(x.e)}</td>
                  <td className="text-right tabular-nums">{fmt(x.sigma)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardContent className="overflow-x-auto py-3 text-xs">
          <p className="pb-1 font-semibold">
            Layers: {r.internal.kind.name.toLowerCase()}, Tal {fmt(r.internal.Tal * 1000, 0)} lb/ft, Rc {fmt(r.internal.Rc, 3)}
            {r.internal.Es > 0 && `, corrosion loss ${fmt(r.internal.Es)} in`}
          </p>
          <table className="w-full">
            <thead>
              <tr className="text-right text-muted-foreground">
                <th className="text-left font-normal">z ft</th>
                <th className="font-normal">Sv ft</th>
                <th className="font-normal">kr</th>
                <th className="font-normal">F*</th>
                <th className="font-normal">σv ksf</th>
                <th className="font-normal">Tmax kip/ft</th>
                <th className="font-normal">L ft</th>
                <th className="font-normal">La ft</th>
                <th className="font-normal">Le ft</th>
                <th className="font-normal">Pr kip/ft</th>
                <th className="font-normal">Tr kip/ft</th>
                <th className="text-left font-normal">Product</th>
                {seismic && <th className="font-normal">Ttotal EE</th>}
                {seismic && <th className="font-normal">Pr EE</th>}
              </tr>
            </thead>
            <tbody>
              {r.internal.layers.map((l) => (
                <tr key={l.z} className="border-b border-border/40 text-right tabular-nums">
                  <td className="text-left">{fmt(l.z, 2)}</td>
                  <td>{fmt(l.Svi, 2)}</td>
                  <td>{fmt(l.kr)}</td>
                  <td>{fmt(l.Fstar, 3)}</td>
                  <td>{fmt(l.sigmaV)}</td>
                  <td className={l.Tstr > Math.min(l.Pr, l.Tr) ? "text-red-600" : ""}>{fmt(l.Tstr)}</td>
                  <td>{fmt(l.Lz, 2)}</td>
                  <td>{fmt(l.LA, 2)}</td>
                  <td>{fmt(l.Le, 2)}</td>
                  <td>{fmt(l.Pr)}</td>
                  <td>{fmt(l.Tr)}</td>
                  <td className="text-left">{l.product.name}</td>
                  {seismic && <td className={l.Tee > Math.min(l.PrEE, l.TrEE) ? "text-red-600" : ""}>{fmt(l.Tee)}</td>}
                  {seismic && <td>{fmt(l.PrEE)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <KeyValues
        title="Facing panel"
        rows={[
          ["Factored pressure pu", `${fmt(r.panel.pu)} ksf`],
          ["Service pressure ps", `${fmt(r.panel.ps)} ksf`],
          ["Spans: horizontal / vertical", `${fmt(r.panel.spanH, 2)} / ${fmt(r.panel.spanV, 2)} ft`],
          ["Mu horizontal / vertical", `${fmt(r.panel.horPos.Mu)} / ${fmt(r.panel.vertPos.Mu)} kip·ft/ft`],
          ["Mcr", `${fmt(r.panel.vertPos.Mcr)} kip·ft/ft`],
          ["φ (from εt), the four faces", [r.panel.vertPos, r.panel.vertNeg, r.panel.horPos, r.panel.horNeg].map((p) => fmt(p.phi, 3)).join(" / ")],
        ]}
      />
    </div>
  );
}

/** The barrier and moment slab, and CDOT's quantities per foot and along the wall. */
function Cdot({ r }: { r: MseResult }) {
  const a = r.rail.anchor;
  const q = r.quantities;
  const seg = q.segments;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {a && (
        <KeyValues
          title={`Barrier and moment slab (${a.level.label})`}
          rows={[
            ...a.weight.parts.map((p) => [p.name, `${fmt(p.w, 3)} klf at ${fmt(p.x * 12, 1)} in`] as [string, string]),
            ["W over the length between joints", `${fmt(a.W, 2)} kip (${fmt(a.Lj, 1)} ft)`],
            ["tan φr", fmt(a.tanPhiR, 3)],
            ["Sliding: Ls / φP", `${fmt(a.level.Ls, 1)} / ${fmt(a.phiP, 2)} kip`],
            ["Arms: l / h", `${fmt(a.l * 12, 2)} / ${fmt(a.h * 12, 2)} in`],
            ["Overturning: Ls·h / φM", `${fmt(a.Mo, 2)} / ${fmt(a.phiM, 2)} kip·ft`],
            ["Coping: Ld·hc / φMn", `${fmt(a.coping.Mu, 1)} / ${fmt(a.coping.phiMn, 1)} kip·ft`],
          ]}
        />
      )}
      {r.rail.impact.length > 0 && (
        <KeyValues
          title="Impact on the top two layers (kip/ft of wall)"
          rows={r.rail.impact.flatMap((m) => [
            [`Layer ${m.k + 1} (z ${fmt(m.z, 2)} ft): static + pullout load / resistance`, `${fmt(m.Fs, 3)} + ${fmt(m.Fp, 3)} / ${fmt(m.P, 3)}`],
            [`Layer ${m.k + 1}: rupture demand / resistance`, `${fmt(m.demandR, 3)} / ${fmt(m.R, 3)}`],
          ] as [string, string][])}
        />
      )}
      <KeyValues
        title={`CDOT quantities per foot of wall${q.cdot ? ` (${q.cdot.sheet})` : ""}`}
        rows={[
          ["Facing", `${fmt(q.facingSF, 2)} SF/LF`],
          ...(q.cdot
            ? ([
                ["Structure excavation EM1", `${fmt(q.cdot.EM1, 2)} CY/LF`],
                ["Structure backfill (Class 1) BM1", `${fmt(q.cdot.BM1, 2)} CY/LF`],
                ["Mechanical reinforcement of soil MRS", `${fmt(q.cdot.MRS, 2)} CY/LF`],
                [`Geomembrane (PLG ${fmt(q.cdot.PLG, 2)} ft)`, `${fmt(q.geomembraneSY, 2)} SY/LF`],
              ] as [string, string][])
            : [["Excavation", "the ground is too steep for the sheets' templates"] as [string, string]]),
          ["Reinforcement (for information)", `${fmt(q.reinfSY, 2)} SY/LF`],
          ...(q.slabCY > 0 ? [["Moment slab and coping, Class D", `${fmt(q.slabCY, 3)} CY/LF`] as [string, string]] : []),
          ...(q.cdot?.raised ? [["Note", `excavation height raised to the sheets' least, 1.5 + 4 tan θ = ${fmt(q.cdot.Hmin, 2)} ft`] as [string, string]] : []),
        ]}
      />
      {seg && seg.segments.length > 0 && (
        <Card className="xl:col-span-2">
          <CardContent className="overflow-x-auto py-3 text-xs">
            <p className="pb-1 font-semibold">Wall segments (B-504-I1/I3): {fmt(seg.length, 1)} ft, average height {fmt(seg.avgDH, 2)} ft</p>
            <table className="w-full">
              <thead>
                <tr className="text-right text-muted-foreground">
                  <th className="text-left font-normal">Stations</th>
                  <th className="font-normal">Length ft</th>
                  <th className="font-normal">DH ft</th>
                  <th className="font-normal">RL ft</th>
                  <th className="font-normal">Facing SF</th>
                  <th className="font-normal">EM1 CY</th>
                  <th className="font-normal">BM1 CY</th>
                  <th className="font-normal">MRS CY</th>
                  <th className="font-normal">Geomembrane SY</th>
                </tr>
              </thead>
              <tbody>
                {seg.segments.map((g) => (
                  <tr key={g.from} className="border-b border-border/40 text-right tabular-nums">
                    <td className="text-left">
                      {fmt(g.from, 2)} to {fmt(g.to, 2)}
                    </td>
                    <td>{fmt(g.length, 2)}</td>
                    <td>{fmt(g.DH, 2)}</td>
                    <td>{fmt(g.L, 2)}</td>
                    <td>{fmt(g.DH * g.length, 1)}</td>
                    <td>{fmt((g.q?.EM1 ?? 0) * g.length, 1)}</td>
                    <td>{fmt((g.q?.BM1 ?? 0) * g.length, 1)}</td>
                    <td>{fmt((g.q?.MRS ?? 0) * g.length, 1)}</td>
                    <td>{fmt(((g.q?.PLG ?? 0) * g.length) / 9, 1)}</td>
                  </tr>
                ))}
                <tr className="text-right font-medium tabular-nums">
                  <td className="text-left">Total</td>
                  <td>{fmt(seg.length, 2)}</td>
                  <td />
                  <td />
                  <td>{fmt(seg.facing, 1)}</td>
                  <td>{fmt(seg.EM1, 1)}</td>
                  <td>{fmt(seg.BM1, 1)}</td>
                  <td>{fmt(seg.MRS, 1)}</td>
                  <td>{fmt(seg.PLG / 9, 1)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <p className="text-[11px] text-muted-foreground xl:col-span-2">
        Factored bearing pressure at the base, for the geotechnical report: {fmt(r.geometry.bearingTsf, 2)} TSF (Strength I). CDOT&apos;s design charts add 900 lb/ft to the layers within 2 ft of the top; with a moment slab, CDOT BDM 11 uses NCHRP Web Doc 326&apos;s loads, as here. MSE panels are sacrificial for the collision load (CDOT BDM 11).
      </p>
    </div>
  );
}
