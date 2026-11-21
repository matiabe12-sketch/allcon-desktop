"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { designShoring, type Anchor, type ShoringInputs, type SoilLayer } from "@/lib/design/shoring/wall";
import { shoringViews } from "@/lib/design/shoring/detail";
import { BARS_150, CHANNELS, PILE_SECTIONS, SHEET_SECTIONS, TIMBER_GRADES, timberFb } from "@/lib/design/shoring/sections";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { Diagrams } from "./shoring-diagrams";
import { TakeoffPanel } from "./takeoff-panel";

// Designing a soldier pile or sheet pile wall: the wall, soil, element, lagging and anchors on the left; the section
// and plan, the pressure, shear and moment diagrams, the checks and the take-off on the right, saved as you go.

const EMPTY = schedule([], []);
const piles = Object.keys(PILE_SECTIONS).map((k) => ({ value: k, label: k }));
const sheets = Object.keys(SHEET_SECTIONS).map((k) => ({ value: k, label: `${k} (S = ${SHEET_SECTIONS[k].S} in³/ft)` }));
const grades = [...Object.entries(TIMBER_GRADES).map(([k, g]) => ({ value: k, label: g.label })), { value: "custom", label: "Other: Fb entered, adjusted" }];
const channels = Object.keys(CHANNELS).map((k) => ({ value: k, label: `2 ${k}` }));
const bars = Object.keys(BARS_150).map((k) => ({ value: k, label: `${k} Grade 150` }));
// Presumptive nominal bond stresses (AASHTO Tables C11.9.4.2-1 to -3), the low end of each range.
const BOND: { label: string; value: number }[] = [
  { label: "Sand or sand–gravel, gravity grouted (1.5–2.9 ksf)", value: 1.5 },
  { label: "Fine to medium sand, pressure grouted (1.7–7.9)", value: 1.7 },
  { label: "Medium to coarse sand with gravel, pressure grouted (2.3–14)", value: 2.3 },
  { label: "Silty sand, pressure grouted (3.5–8.5)", value: 3.5 },
  { label: "Sandy gravel, medium dense to dense (4.4–29)", value: 4.4 },
  { label: "Glacial till, dense (6.3–11)", value: 6.3 },
  { label: "Stiff to very stiff silt–clay, gravity grouted (0.6–1.5)", value: 0.6 },
  { label: "Medium plasticity clay, stiff, pressure grouted (2.0–5.2)", value: 2 },
  { label: "Soft shale (4.2–17)", value: 4.2 },
  { label: "Sandstone (17–36)", value: 17 },
];

export function ShoringEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: ShoringInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof ShoringInputs>(k: K) => (v: ShoringInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const setLayer = (n: number, patch: Partial<SoilLayer>) => setInputs((s) => ({ ...s, layers: s.layers.map((x, k) => (k === n ? { ...x, ...patch } : x)) }));
  const setAnchor = (n: number, patch: Partial<Anchor>) => setInputs((s) => ({ ...s, anchors: s.anchors.map((x, k) => (k === n ? { ...x, ...patch } : x)) }));
  const outcome = useMemo(() => {
    try {
      return { result: designShoring(inputs), views: shoringViews(inputs), error: null as string | null };
    } catch (err) {
      return { result: null, views: [], error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const groupOf = (id: string) => (id.startsWith("eq-") ? "Seismic (Extreme Event I)" : id === "piping" ? "Seepage" : id === "embedment" || id.startsWith("stage") ? "Embedment and the cantilever stage" : id === "axial" ? "Vertical capacity" : id === "heave" || id === "stability" ? "Stability" : id === "deflection" ? "Deflection" : id.startsWith("wale") ? "Wales" : id.startsWith("lagging") ? "Lagging" : id.startsWith("anchor") ? `Anchor ${id.match(/anchor(\d+)/)?.[1]}` : id === "lagging" ? "Lagging" : inputs.wall === "soldier" ? "Soldier pile" : "Sheet pile");
  const soldier = inputs.wall === "soldier";

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Soldier Pile and Sheet Pile Wall · AASHTO LRFD 11.8, 11.9 · FHWA GEC 4" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="The wall" open>
              <Choice label="Wall" value={inputs.wall} options={[{ value: "soldier", label: "Soldier piles and lagging" }, { value: "sheet", label: "Steel sheet piles" }]} onChange={set("wall")} />
              <Choice label="Support" value={inputs.support} options={[{ value: "cantilever", label: "Cantilever (11.8)" }, { value: "anchored", label: "Ground anchors (11.9)" }]} onChange={set("support")} />
              <Toggle label="Temporary (shoring)" value={inputs.temporary} onChange={set("temporary")} />
              <Field label="Excavation depth H" unit="ft" value={inputs.H} onChange={set("H")} step={0.5} />
              <Field label="Embedment D below the excavation" unit="ft" value={inputs.D} onChange={set("D")} step={0.5} />
            </Section>
            <Section title="The soil" open>
              {inputs.layers.map((l, n) => (
                <div key={n} className="border-b py-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <input className="w-48 bg-transparent" value={l.name} onChange={(e) => setLayer(n, { name: e.target.value })} aria-label={`Layer ${n + 1} name`} />
                    {inputs.layers.length > 1 && (
                      <button type="button" aria-label={`Remove layer ${n + 1}`} className="text-muted-foreground hover:text-destructive" onClick={() => setInputs((x) => ({ ...x, layers: x.layers.filter((_, k) => k !== n) }))}>
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  {n < inputs.layers.length - 1 ? <Field label="Thickness" unit="ft" value={l.thickness} onChange={(v) => setLayer(n, { thickness: v })} /> : <p className="text-[11px] text-muted-foreground">Continues down</p>}
                  <Field label="Unit weight γ" unit="pcf" value={l.gamma} onChange={(v) => setLayer(n, { gamma: v })} />
                  <Field label="Friction angle φ" unit="deg" value={l.phi} onChange={(v) => setLayer(n, { phi: v })} />
                  <Field label="Cohesion c (undrained: φ = 0)" unit="psf" value={l.c} onChange={(v) => setLayer(n, { c: v })} step={50} />
                  {inputs.flowNet && inputs.seepage && !soldier && (
                    <>
                      <Field label="Permeability k (horizontal)" unit="ft/day" value={l.k ?? 1} onChange={(v) => setLayer(n, { k: Math.max(1e-6, v) })} step={0.1} />
                      <Field label="Anisotropy kh/kv" value={l.kRatio ?? 1} onChange={(v) => setLayer(n, { kRatio: Math.max(0.01, v) })} step={0.5} />
                    </>
                  )}
                  {inputs.seismic && inputs.liquefaction && l.phi > 0 && (
                    <>
                      <Field label="SPT N60 (liquefaction)" unit="blows/ft" value={l.n60 ?? inputs.N60} onChange={(v) => setLayer(n, { n60: v })} />
                      <Field label="Fines content" unit="%" value={l.fines ?? 10} onChange={(v) => setLayer(n, { fines: v })} />
                    </>
                  )}
                </div>
              ))}
              {inputs.layers.length < 6 && (
                <Button size="sm" variant="outline" className="my-1" onClick={() => setInputs((x) => ({ ...x, layers: [...x.layers, { ...x.layers[x.layers.length - 1], name: `Layer ${x.layers.length + 1}`, thickness: 10 }] }))}>
                  <Plus className="size-3.5" /> Add a layer
                </Button>
              )}
              <Field label="Backslope behind the wall" unit="deg" value={inputs.backslope} onChange={(v) => set("backslope")(Math.max(0, v))} hint="0: level; Coulomb ka (Eq. 3.11.5.3-1) for a slope" />
              <Field label="SPT N60 below the excavation" unit="blows/ft" value={inputs.N60} onChange={set("N60")} hint="End bearing and side resistance in sand (GEC 4 5.6)" />
              <Field label="Excavation width (basal heave)" unit="ft" value={inputs.excavationWidth} onChange={set("excavationWidth")} />
              <Field label="Uniform surcharge" unit="psf" value={inputs.surcharge} onChange={set("surcharge")} step={50} />
              <Toggle label="Traffic behind (live load surcharge)" value={inputs.traffic} onChange={set("traffic")} />
              <Toggle label="Water table behind" value={inputs.water !== null} onChange={(v) => set("water")(v ? inputs.H / 2 : null)} />
              {!soldier && inputs.water !== null && <Toggle label="Steady seepage under the wall (and piping)" value={inputs.seepage} onChange={set("seepage")} />}
              {!soldier && inputs.water !== null && inputs.seepage && <Toggle label="Flow net through the layers (each layer's k)" value={inputs.flowNet} onChange={set("flowNet")} />}
              {!soldier && inputs.water !== null && inputs.seepage && inputs.flowNet && <Field label="Impervious base, below the top (0: twice the wall)" unit="ft" value={inputs.baseDepth} onChange={set("baseDepth")} />}
              {inputs.water !== null && <Field label="Water, below the top" unit="ft" value={inputs.water} onChange={set("water")} step={0.5} hint={soldier ? "Soldier pile walls drain through the lagging: γ′ below it only" : "Differential water to the excavation"} />}
            </Section>
            <Section title={soldier ? "Soldier piles" : "Sheet piles"} open>
              {soldier ? (
                <>
                  <Choice label="Section" value={inputs.section} options={piles} onChange={set("section")} />
                  <Field label="Spacing" unit="ft" value={inputs.spacing} onChange={set("spacing")} step={0.5} />
                  <Toggle label="In drilled holes with concrete" value={inputs.drilled} onChange={set("drilled")} />
                  {inputs.drilled && <Field label="Hole diameter" unit="in" value={inputs.holeDia} onChange={set("holeDia")} step={6} />}
                </>
              ) : (
                <Choice label="Section" value={inputs.sheet} options={sheets} onChange={set("sheet")} />
              )}
              <Field label="Steel Fy" unit="ksi" value={inputs.Fy} onChange={set("Fy")} />
              {!inputs.temporary && <Field label="Corrosion loss, each face" unit="in" value={inputs.corrosionLoss} onChange={set("corrosionLoss")} step={0.0625} hint="Over the design life (11.8.7, 11.9.7)" />}
            </Section>
            {soldier && (
              <Section title="Lagging">
                <Choice label="Facing" value={inputs.lagging} options={[{ value: "timber", label: "Timber lagging" }, { value: "precast", label: "Precast concrete panels" }, { value: "cip", label: "Cast-in-place concrete facing" }]} onChange={set("lagging")} />
                {(inputs.lagging !== "timber" || !inputs.temporary) && (
                  <>
                    <Choice label="Spans (C11.8.5.2)" value={inputs.facingSupport} options={[{ value: "simple", label: "Simple between piles" }, { value: "continuous", label: "Continuous over the piles" }]} onChange={set("facingSupport")} />
                    <Toggle label="Soil arching (0.083·p·L²)" value={inputs.arching} onChange={set("arching")} />
                  </>
                )}
                {inputs.lagging === "timber" && (
                  <>
                    <Field label="Thickness (roughcut)" unit="in" value={inputs.laggingT} onChange={set("laggingT")} />
                    <Choice label="Soil (GEC 4 Table 12)" value={inputs.laggingSoil} options={[{ value: "competent", label: "Competent" }, { value: "difficult", label: "Difficult" }, { value: "dangerous", label: "Potentially dangerous" }]} onChange={set("laggingSoil")} />
                    {!inputs.temporary && (
                      <>
                        <Choice label="Species and grade (AASHTO Table 8.4.1.1.4-1)" value={inputs.timberGrade} options={grades} onChange={set("timberGrade")} />
                        {inputs.timberGrade === "custom" ? (
                          <Field label="Timber Fb (adjusted)" unit="ksi" value={inputs.timberFb} onChange={set("timberFb")} step={0.05} />
                        ) : (
                          <>
                            <Choice label="Board width (nominal)" value={inputs.timberWidth} options={[6, 8, 10, 12].map((w) => ({ value: w, label: `${w} in` }))} onChange={set("timberWidth")} />
                            <Toggle label="Wet service (CM)" value={inputs.timberWet} onChange={set("timberWet")} />
                            <Toggle label="Incised for treatment (Ci 0.80)" value={inputs.timberIncised} onChange={set("timberIncised")} />
                            <Choice label="Time effect Cλ (Table 8.4.4.9-1)" value={inputs.timberCl} options={[{ value: 0.8, label: "0.8, Strength I" }, { value: 0.6, label: "0.6, Strength IV (permanent loads only)" }, { value: 1, label: "1.0, Extreme Event" }]} onChange={set("timberCl")} />
                            {(() => {
                              const fb = timberFb(inputs.timberGrade, inputs.laggingT, inputs.timberWidth, { wet: inputs.timberWet, incised: inputs.timberIncised, cLambda: inputs.timberCl });
                              return fb ? <p className="py-1 text-[11px] text-muted-foreground">Fb = {fmt(fb.Fbo, 3)} × CKF {fmt(fb.CKF, 3)} × CM {fb.CM} × CF {fb.CF} × Cfu {fb.Cfu} × Ci {fb.Ci} × Cλ {fb.Cl} = {fmt(fb.Fb, 3)} ksi</p> : null;
                            })()}
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
                {inputs.lagging !== "timber" && (
                  <>
                    <Field label={inputs.lagging === "cip" ? "Facing thickness" : "Panel thickness"} unit="in" value={inputs.precastT} onChange={set("precastT")} step={0.5} />
                    <Field label="Concrete f′c" unit="ksi" value={inputs.precastFc} onChange={set("precastFc")} step={0.5} />
                    <Choice label="Bars spanning the piles" value={inputs.precastBar} options={[3, 4, 5, 6].map((b) => ({ value: b, label: `#${b}` }))} onChange={set("precastBar")} />
                    <Field label="Bar spacing" unit="in" value={inputs.precastBarSpacing} onChange={set("precastBarSpacing")} />
                  </>
                )}
              </Section>
            )}
            {inputs.support === "anchored" && (
              <Section title="Ground anchors" open>
                <Choice label="Apparent pressure" value={inputs.aepSoil} options={[{ value: "auto", label: "From the soil" }, { value: "sand", label: "Sand (3.11.5.7.1)" }, { value: "stiff-clay", label: "Stiff to hard clay (3.11.5.7.2a)" }, { value: "soft-clay", label: "Soft to medium clay (3.11.5.7.2b)" }]} onChange={set("aepSoil")} />
                {inputs.aepSoil === "stiff-clay" && <Field label="pa = k·γ·H, k" value={inputs.kStiffClay} onChange={set("kStiffClay")} step={0.05} hint="0.2 to 0.4; 0.3 without local experience" />}
                <Choice label="Anchor loads" value={inputs.method} options={[{ value: "tributary", label: "Tributary area" }, { value: "hinge", label: "Hinge method" }]} onChange={set("method")} />
                {inputs.anchors.map((a, n) => (
                  <div key={n} className="border-b py-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      Anchor {n + 1}
                      {inputs.anchors.length > 1 && (
                        <button type="button" aria-label={`Remove anchor ${n + 1}`} className="text-muted-foreground hover:text-destructive" onClick={() => setInputs((x) => ({ ...x, anchors: x.anchors.filter((_, k) => k !== n) }))}>
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <Field label="Depth below the top" unit="ft" value={a.depth} onChange={(v) => setAnchor(n, { depth: v })} step={0.5} />
                    <Field label="Angle below horizontal" unit="deg" value={a.angle} onChange={(v) => setAnchor(n, { angle: v })} />
                    <Field label="Unbonded length" unit="ft" value={a.unbondedLength} onChange={(v) => setAnchor(n, { unbondedLength: v })} />
                    <Field label="Bond length" unit="ft" value={a.bondLength} onChange={(v) => setAnchor(n, { bondLength: v })} />
                  </div>
                ))}
                {inputs.anchors.length < 6 && (
                  <Button size="sm" variant="outline" className="my-1" onClick={() => setInputs((x) => ({ ...x, anchors: [...x.anchors, { ...x.anchors[x.anchors.length - 1], depth: Math.min(x.H - 2, x.anchors[x.anchors.length - 1].depth + 8) }] }))}>
                    <Plus className="size-3.5" /> Add an anchor
                  </Button>
                )}
                {!soldier && <Field label="Horizontal spacing" unit="ft" value={inputs.anchorSpacing} onChange={set("anchorSpacing")} />}
                {!soldier && <Choice label="Wales" value={inputs.wale} options={channels} onChange={set("wale")} />}
                {!soldier && <Field label="Wale Fy" unit="ksi" value={inputs.waleFy} onChange={set("waleFy")} />}
                <Toggle label="Construction sequence in the deflection" value={inputs.staged} onChange={set("staged")} />
                <Field label="Lock-off load" unit="× design load" value={inputs.lockOff} onChange={set("lockOff")} step={0.05} hint="GEC 4: 0.75 to 1.0; for the beam model's deflection" />
                <Field label="Excavated below an anchor before stressing" unit="ft" value={inputs.stageOver} onChange={set("stageOver")} step={0.5} hint="The cantilever stage (GEC 4: about 2 ft)" />
                <Choice label="Tendon" value={inputs.tendon} options={[{ value: "strand", label: "0.6 in strands (270 ksi)" }, { value: "bar", label: "Grade 150 bar" }]} onChange={set("tendon")} />
                {inputs.tendon === "strand" ? <Field label="Strands" value={inputs.strands} onChange={(v) => set("strands")(Math.max(1, Math.round(v)))} /> : <Choice label="Bar" value={inputs.bar} options={bars} onChange={set("bar")} />}
                <Field label="Drill hole" unit="in" value={inputs.holeDiaAnchor} onChange={set("holeDiaAnchor")} />
                <Choice label="Presumptive bond (low end)" value={BOND.find((b) => b.value === inputs.bond)?.value ?? -1} options={[{ value: -1, label: "As entered" }, ...BOND]} onChange={(v) => v > 0 && set("bond")(v)} />
                <Field label="Nominal bond stress τn" unit="ksf" value={inputs.bond} onChange={set("bond")} step={0.1} />
                <Toggle label="Every anchor proof tested (φ = 1.0)" value={inputs.proofTested} onChange={set("proofTested")} />
              </Section>
            )}
            <Section title="Seismic (Extreme Event I)">
              <Toggle label="Check seismic (AASHTO 11.8.6, 11.9.6)" value={inputs.seismic} onChange={set("seismic")} />
              {inputs.seismic && (
                <>
                  <Field label="As = Fpga·PGA" value={inputs.As} onChange={set("As")} step={0.01} hint={inputs.As <= 0.4 ? "As ≤ 0.4: not mandatory unless the wall supports a structure or the soil may lose strength (11.5.4.2)" : undefined} />
                  <Toggle label="kh = 0.5·As (1 to 2 in. of movement shown acceptable)" value={inputs.khHalf} onChange={set("khHalf")} />
                  {inputs.water !== null && <Toggle label="Pore water in the seismic pressures" value={inputs.seismicWater} onChange={set("seismicWater")} />}
                  {inputs.water !== null && inputs.seismicWater && <Toggle label="Free water (pervious soil): hydrodynamic pressure" value={inputs.freeWater} onChange={set("freeWater")} />}
                  {inputs.water !== null && inputs.seismicWater && inputs.freeWater && <Field label="Porosity n" value={inputs.porosity} onChange={set("porosity")} step={0.05} />}
                  {inputs.water !== null && <Toggle label="Liquefaction (Idriss and Boulanger 2008)" value={inputs.liquefaction} onChange={set("liquefaction")} />}
                  {inputs.water !== null && inputs.liquefaction && <Field label="Earthquake magnitude Mw" value={inputs.Mw} onChange={set("Mw")} step={0.1} />}
                </>
              )}
            </Section>
            <Section title="Factors">
              <Field label="EH, active (cantilever)" value={inputs.gEH} onChange={set("gEH")} step={0.05} />
              <Field label="EH, apparent pressure (anchored)" value={inputs.gAEP} onChange={set("gAEP")} step={0.05} />
              <Field label="ES, surcharge" value={inputs.gES} onChange={set("gES")} step={0.05} />
              <Field label="LS, live load surcharge" value={inputs.gLS} onChange={set("gLS")} step={0.05} />
              <Field label="φ, passive" value={inputs.phiP} onChange={set("phiP")} step={0.05} />
              <Field label="φ, flexure" value={inputs.phiF} onChange={set("phiF")} step={0.05} />
              <Field label="φ, overall stability" value={inputs.phiStability} onChange={set("phiStability")} step={0.05} hint="0.75; 0.65 where the wall supports a structure (11.6.3.7)" />
              <Field label="Deflection limit (service)" unit="in" value={inputs.deflectionLimit} onChange={set("deflectionLimit")} step={0.25} />
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
                    <Diagrams i={inputs} r={r} />
                  </CardContent>
                </Card>
                {outcome.views.map((v) => (
                  <Card key={v.title}>
                    <CardContent className="py-3">
                      <p className="mb-1 text-xs font-semibold">{v.title}</p>
                      <DetailSketch view={v} schedule={EMPTY} />
                    </CardContent>
                  </Card>
                ))}
                <ChecksTable checks={r.checks} groupOf={groupOf} />
                <TakeoffPanel kind="shoring-wall" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <KeyValues
                  title={r.cant ? "Cantilever" : "Anchored"}
                  rows={[
                    ...(r.cant
                      ? ([
                          ["Embedment D0 (moment about the toe)", `${fmt(r.cant.D0, 2)} ft`],
                          ["Needed, 1.2·D0", `${fmt(r.cant.Dreq, 2)} ft`],
                        ] as [string, string][])
                      : ([
                          ["Apparent pressure pa (unfactored)", `${fmt(r.anch!.pa, 3)} ksf (${r.anch!.aep})`],
                          ...r.anch!.rows.map((x, k) => [`Anchor ${k + 1}: design load T`, `${fmt(x.T, 1)} kip (bond needs ${fmt(x.bondReq, 1)} ft)`] as [string, string]),
                          ["Toe embedment needed", `${fmt(r.anch!.Dreq, 2)} ft`],
                        ] as [string, string][])),
                    [soldier ? "Largest moment, one pile" : "Largest moment per foot", `${fmt(r.element.Mu, 1)} kip·ft`],
                    ...(r.lagging ? ([["Lagging", r.lagging.tReq === null ? "outside GEC 4 Table 12" : `${r.lagging.tReq} in recommended, ${fmt(r.lagging.clear, 2)} ft clear`]] as [string, string][]) : []),
                    ...(r.stage ? ([["Cantilever stage", `excavated to ${fmt(r.stage.Hs, 1)} ft: needs ${fmt(r.stage.Dreq, 2)} of ${fmt(r.stage.avail, 2)} ft, ${fmt(r.stage.Mmax, 1)} kip·ft`]] as [string, string][]) : []),
                    ...(r.axial ? ([["Vertical load / resistance", `${fmt(r.axial.Pu, 1)} / ${fmt(r.axial.Rr, 1)} ${soldier ? "kip" : "kip/ft"}`]] as [string, string][]) : []),
                    ...(r.heave ? ([["Basal heave FS", `${fmt(r.heave.FS, 2)} (Nc ${fmt(r.heave.Nc, 2)})`]] as [string, string][]) : []),
                    ["Overall stability FS (Bishop)", fmt(r.stability.FS, 2)],
                    ...(r.deflection ? ([["Deflection at the top (service)", `${fmt(r.deflection.top, 2)} in`]] as [string, string][]) : []),
                    ...(r.beam ? ([["Deflection, beam on springs (service)", `${fmt(Math.abs(r.beam.max), 2)} in at ${fmt(r.beam.zMax, 1)} ft`], ...r.beam.anchors.map((a, k) => [`Anchor ${k + 1}: locked off → in service`, `${fmt(a.lockOff, 1)} → ${fmt(a.T, 1)} kip`] as [string, string])] as [string, string][]) : []),
                    ...(r.staged ? (r.staged.stages.map((st) => [`Stage: ${st.name}`, `${fmt(Math.abs(st.max), 2)} in${st.anchors.length ? `; anchors ${st.anchors.map((a) => fmt(a, 1)).join(", ")} kip` : ""}`]) as [string, string][]) : []),
                    ...(r.quakeStab ? ([["Seismic overall stability FS", fmt(r.quakeStab.FS, 2)]] as [string, string][]) : []),
                    ...(r.liquefaction.length ? ([["Liquefaction, the lowest FS", (() => { const w = r.liquefaction.reduce((a, x) => (x.FS < a.FS ? x : a)); return `${fmt(w.FS, 2)} at ${w.z} ft ${w.front ? "in front" : "behind"}`; })()]] as [string, string][]) : []),
                    ...(r.net ? ([["Flow net: exit gradient, flow", `${fmt(r.net.exitGradient, 3)}; ${fmt(r.net.flow, 3)} ft³/day per ft`]] as [string, string][]) : []),
                    ...(r.piping ? ([["Piping FS (exit gradient " + fmt(r.piping.grad, 3) + ")", fmt(r.piping.FS, 2)]] as [string, string][]) : []),
                  ]}
                />
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
