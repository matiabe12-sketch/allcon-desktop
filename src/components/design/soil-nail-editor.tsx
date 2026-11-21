"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { designSoilNail, NAIL_BARS, type NailLayer, type SoilNailInputs } from "@/lib/design/soilnail/wall";
import { soilNailViews } from "@/lib/design/soilnail/detail";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// Designing a soil nail wall by FHWA GEC 7: the wall, soil, nails and facings on the left; the section, face elevation,
// nail head and nail drawings, the checks, results and take-off on the right, saved as you go.

const EMPTY = schedule([], []);
const bars = Object.keys(NAIL_BARS).map((b) => ({ value: Number(b), label: `#${b}` }));
const small = [3, 4, 5, 6].map((b) => ({ value: b, label: `#${b}` }));
const meshes = [
  { value: 0.028, label: "6×6–W1.4×W1.4 (0.028 in²/ft)" },
  { value: 0.042, label: "6×6–W2.1×W2.1 (0.042 in²/ft)" },
  { value: 0.058, label: "6×6–W2.9×W2.9 (0.058 in²/ft)" },
  { value: 0.08, label: "6×6–W4.0×W4.0 (0.080 in²/ft)" },
];

export function SoilNailEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: SoilNailInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof SoilNailInputs>(k: K) => (v: SoilNailInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const setLayer = (n: number, patch: Partial<NailLayer>) => setInputs((s) => ({ ...s, layers: s.layers.map((x, k) => (k === n ? { ...x, ...patch } : x)) }));
  const outcome = useMemo(() => {
    try {
      return { result: designSoilNail(inputs), views: soilNailViews(inputs), error: null as string | null };
    } catch (err) {
      return { result: null, views: [], error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const groupOf = (id: string) => (["internal", "stages", "global", "eq-internal", "eq-global", "sliding", "heave"].includes(id) ? "Stability (GEC 7 6.5)" : id === "pullout" || id === "tendon" ? "Nails (GEC 7 6.6.2, 6.6.4)" : id.endsWith("-i") || id === "rho-i-max" ? "Initial facing" : "Final facing and studs");
  const lengthsText = inputs.lengths.join(", ");

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Soil Nail Wall · FHWA GEC 7 · AASHTO LRFD" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="The wall" open>
              <Field label="Height H" unit="ft" value={inputs.H} onChange={set("H")} step={0.5} />
              <Field label="Face batter (from vertical)" unit="deg" value={inputs.batter} onChange={(v) => set("batter")(Math.max(0, v))} />
              <Field label="Backslope" unit="deg" value={inputs.backslope} onChange={(v) => set("backslope")(Math.max(0, v))} />
              <Field label="Surcharge behind" unit="psf" value={inputs.surcharge} onChange={set("surcharge")} step={50} />
              <Toggle label="Permanent (final facing)" value={inputs.permanent} onChange={set("permanent")} />
              <Toggle label="Critical structure (Table 5.1)" value={inputs.critical} onChange={set("critical")} />
              <Toggle label="Water table" value={inputs.water !== null} onChange={(v) => set("water")(v ? inputs.H + 5 : null)} />
              {inputs.water !== null && <Field label="Water, below the top" unit="ft" value={inputs.water} onChange={set("water")} step={0.5} hint="GEC 7: drain the wall; pore pressure in the stability analyses" />}
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
                  <Field label="Friction angle φ′" unit="deg" value={l.phi} onChange={(v) => setLayer(n, { phi: v })} />
                  <Field label="Cohesion c′" unit="psf" value={l.c} onChange={(v) => setLayer(n, { c: v })} step={50} />
                  <Field label="Nominal bond qu" unit="psi" value={l.bond} onChange={(v) => setLayer(n, { bond: v })} step={0.5} hint="CDOT BDM 11.5.6: typically 10 to 15 psi dry, 30 psi at most" />
                </div>
              ))}
              {inputs.layers.length < 6 && (
                <Button size="sm" variant="outline" className="my-1" onClick={() => setInputs((x) => ({ ...x, layers: [...x.layers, { ...x.layers[x.layers.length - 1], name: `Layer ${x.layers.length + 1}`, thickness: 10 }] }))}>
                  <Plus className="size-3.5" /> Add a layer
                </Button>
              )}
            </Section>
            <Section title="Nails" open>
              <Field label="Rows" value={inputs.rows} onChange={(v) => set("rows")(Math.max(1, Math.round(v)))} />
              <Field label="Top to row 1, SV0" unit="ft" value={inputs.sv0} onChange={set("sv0")} step={0.5} />
              <Field label="Vertical spacing SV" unit="ft" value={inputs.sv} onChange={set("sv")} step={0.5} />
              <Field label="Horizontal spacing SH" unit="ft" value={inputs.sh} onChange={set("sh")} step={0.5} />
              <label className="grid grid-cols-[1fr_auto] items-center gap-2 py-0.5 text-xs">
                <span className="text-muted-foreground">Lengths, from the top (ft)</span>
                <input
                  className="h-7 w-36 rounded-md border border-input bg-transparent px-1 text-right"
                  defaultValue={lengthsText}
                  onBlur={(e) => {
                    const v = e.target.value.split(/[,\s]+/).map(Number).filter((x) => x > 0);
                    if (v.length) set("lengths")(v);
                  }}
                  aria-label="Nail lengths"
                />
              </label>
              <Field label="Inclination below horizontal" unit="deg" value={inputs.incline} onChange={set("incline")} />
              <Field label="Drill hole" unit="in" value={inputs.hole} onChange={set("hole")} />
              <Choice label="Bar" value={inputs.bar} options={bars} onChange={set("bar")} />
              <Choice label="Grade" value={inputs.fy} options={[{ value: 60, label: "Grade 60" }, { value: 75, label: "Grade 75" }]} onChange={set("fy")} />
              <Field label="Excavation below a row before it's nailed" unit="ft" value={inputs.stageOver} onChange={set("stageOver")} step={0.5} />
            </Section>
            <Section title="Initial facing (shotcrete)">
              <Field label="Thickness hi" unit="in" value={inputs.hi} onChange={set("hi")} />
              <Field label="Shotcrete f′c" unit="ksi" value={inputs.fcI} onChange={set("fcI")} step={0.5} />
              <Choice label="Welded wire mesh" value={inputs.wwm} options={meshes} onChange={set("wwm")} />
              <Field label="Waler bars at each head, each way" value={inputs.headBars} onChange={(v) => set("headBars")(Math.max(0, Math.round(v)))} />
              <Choice label="Waler bar" value={inputs.headBar} options={small} onChange={set("headBar")} />
              <Field label="Bearing plate side" unit="in" value={inputs.plate} onChange={set("plate")} />
              <Field label="Bearing plate thickness" unit="in" value={inputs.plateT} onChange={set("plateT")} step={0.125} />
            </Section>
            {inputs.permanent && (
              <Section title="Final facing and headed studs">
                <Field label="Thickness hf" unit="in" value={inputs.hf} onChange={set("hf")} />
                <Field label="Concrete f′c" unit="ksi" value={inputs.fcF} onChange={set("fcF")} step={0.5} />
                <Choice label="Bars each way" value={inputs.finalBar} options={small} onChange={set("finalBar")} />
                <Field label="Bar spacing" unit="in" value={inputs.finalSpacing} onChange={set("finalSpacing")} />
                <Field label="Studs per head" value={inputs.studs} onChange={(v) => set("studs")(Math.max(1, Math.round(v)))} />
                <Field label="Stud shaft diameter" unit="in" value={inputs.studD} onChange={set("studD")} step={0.125} />
                <Field label="Stud head diameter" unit="in" value={inputs.studHeadD} onChange={set("studHeadD")} step={0.125} />
                <Field label="Stud head thickness" unit="in" value={inputs.studHeadT} onChange={set("studHeadT")} step={0.0625} />
                <Field label="Stud length" unit="in" value={inputs.studL} onChange={set("studL")} step={0.125} />
                <Field label="Stud spacing" unit="in" value={inputs.studSpacing} onChange={set("studSpacing")} />
                <Toggle label="A325 studs (else A307)" value={inputs.studA325} onChange={set("studA325")} />
              </Section>
            )}
            <Section title="Displacement, heave, seismic">
              <Toggle label="Weathered rock or stiff soil (δh/H 1/1000)" value={inputs.stiff} onChange={set("stiff")} />
              <Field label="Excavation width (basal heave in clay)" unit="ft" value={inputs.excavationWidth} onChange={set("excavationWidth")} />
              <Toggle label="Seismic (GEC 7 6.8)" value={inputs.seismic} onChange={set("seismic")} />
              {inputs.seismic && (
                <>
                  <Field label="As = Fpga·PGA" value={inputs.As} onChange={set("As")} step={0.01} hint="CDOT BDM 11.5.16: not required unless the wall supports an abutment or liquefaction is expected" />
                  <Toggle label="kh = 0.5·As" value={inputs.khHalf} onChange={set("khHalf")} />
                </>
              )}
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
                {outcome.views.map((v) => (
                  <Card key={v.title}>
                    <CardContent className="py-3">
                      <p className="mb-1 text-xs font-semibold">{v.title}</p>
                      <DetailSketch view={v} schedule={EMPTY} />
                    </CardContent>
                  </Card>
                ))}
                <ChecksTable checks={r.checks} groupOf={groupOf} />
                <TakeoffPanel kind="soil-nail-wall" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <div className="grid gap-4 xl:grid-cols-2">
                  <KeyValues
                    title="Stability and nails"
                    rows={[
                      ["Internal FS (final)", `${fmt(r.internal.FS, 2)} (≥ ${r.fsMin})`],
                      ["Lowest stage FS", `${fmt(Math.min(...r.stages.map((s) => s.FS)), 2)} (≥ ${r.fsStage})`],
                      ["Global FS", fmt(r.global.FS, 2)],
                      ["Tmax", `${fmt(r.Tmax, 2)} kip, row ${r.top.row} (${r.top.mode})`],
                      ...r.internal.forces.map((x) => [`Row ${x.row}`, `${fmt(x.T, 2)} kip, ${x.mode}, Lp ${fmt(x.Lp, 1)} ft`] as [string, string]),
                    ]}
                  />
                  <KeyValues
                    title="Facing and service"
                    rows={[
                      ["Nail head force To", `${fmt(r.To, 2)} kip`],
                      ["Initial facing RFF / RFP", `${fmt(r.facing.initial.RFF, 1)} / ${fmt(r.facing.initial.RFP, 1)} kip`],
                      ...(r.facing.final ? ([["Final facing RFF / RFP / RFH", `${fmt(r.facing.final.RFF, 1)} / ${fmt(r.facing.final.RFP, 1)} / ${fmt(r.facing.final.RFH, 1)} kip`]] as [string, string][]) : []),
                      ["Displacement at the top δh ≈ δv", `${fmt(r.deflection.dh, 2)} in`],
                      ["Ground moves over DDEF", `${fmt(r.deflection.DDEF, 1)} ft`],
                    ]}
                  />
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
