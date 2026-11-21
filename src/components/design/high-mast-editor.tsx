"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { designHighMast, type HighMastInputs } from "@/lib/design/signals/highmast";
import { highMastViews } from "@/lib/design/signals/highmast-detail";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// Designing a high-mast tower's caisson: the loads (the supplier's or estimated), the caisson and the soil on the left;
// the drawings, checks, loads and take-off on the right.

const EMPTY = schedule([], []);
const sizes = [5, 6, 7, 8, 9, 10, 11].map((b) => ({ value: b, label: `#${b}` }));

export function HighMastEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: HighMastInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof HighMastInputs>(k: K) => (v: HighMastInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const outcome = useMemo(() => {
    try {
      return { result: designHighMast(inputs), views: highMastViews(inputs), error: null as string | null };
    } catch (err) {
      return { result: null, views: [], error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="High-Mast Light Foundation · AASHTO LRFD-LTS" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Loads at the base" open>
              <Toggle label="Use the supplier's base reactions" value={inputs.fromSupplier} onChange={set("fromSupplier")} />
              {inputs.fromSupplier ? (
                <>
                  <Field label="Dead load P" unit="kip" value={inputs.P} onChange={set("P")} />
                  <Field label="Wind moment M (Extreme I)" unit="kip·ft" value={inputs.M} onChange={set("M")} step={10} />
                  <Field label="Wind shear V" unit="kip" value={inputs.V} onChange={set("V")} step={0.5} />
                  <Field label="Torsion T" unit="kip·ft" value={inputs.T} onChange={set("T")} />
                </>
              ) : (
                <>
                  <Field label="Mounting height" unit="ft" value={inputs.H} onChange={set("H")} step={5} />
                  <Field label="Tube diameter at the base" unit="in" value={inputs.dBase} onChange={set("dBase")} />
                  <Field label="Tube diameter at the top" unit="in" value={inputs.dTop} onChange={set("dTop")} />
                  <Field label="Tube wall" unit="in" value={inputs.wall} onChange={set("wall")} step={0.0625} />
                  <Field label="Luminaires" value={inputs.luminaires} onChange={(v) => set("luminaires")(Math.max(0, Math.round(v)))} />
                  <Field label="EPA, each luminaire" unit="ft²" value={inputs.epa} onChange={set("epa")} step={0.1} />
                  <Field label="Weight, each luminaire" unit="lb" value={inputs.lumWt} onChange={set("lumWt")} />
                  <Field label="Ring and lowering device EPA" unit="ft²" value={inputs.ringEpa} onChange={set("ringEpa")} />
                  <Field label="Ring and lowering device weight" unit="lb" value={inputs.ringWt} onChange={set("ringWt")} step={50} />
                  <Field label="Wind speed (LTS Figure 3.8-1)" unit="mph" value={inputs.wind} onChange={set("wind")} />
                  <Field label="Directionality Kd" value={inputs.Kd} onChange={set("Kd")} step={0.05} />
                  <Field label="Gust effect G" value={inputs.G} onChange={set("G")} step={0.01} />
                </>
              )}
              <Field label="Anchor bolt circle (the supplier's)" unit="in" value={inputs.boltCircle} onChange={set("boltCircle")} />
            </Section>
            <Section title="Caisson" open>
              <Field label="Diameter" unit="in" value={inputs.shaftD} onChange={set("shaftD")} step={6} />
              <Field label="Length" unit="ft" value={inputs.shaftLength} onChange={set("shaftLength")} step={0.5} />
              <div className="grid grid-cols-2 gap-x-2">
                <Field label="Bars" value={inputs.bars} onChange={(v) => set("bars")(Math.max(6, Math.round(v)))} />
                <Choice label="Size" value={inputs.bar} options={sizes} onChange={set("bar")} />
              </div>
              <div className="grid grid-cols-2 gap-x-2">
                <Choice label="Spiral" value={inputs.spiral} options={[3, 4, 5].map((b) => ({ value: b, label: `#${b}` }))} onChange={set("spiral")} />
                <Field label="Pitch" unit="in" value={inputs.pitch} onChange={set("pitch")} />
              </div>
              <Field label="Cover" unit="in" value={inputs.cover} onChange={set("cover")} step={0.5} />
              <Field label="Concrete f′c" unit="ksi" value={inputs.fc} onChange={set("fc")} step={0.5} />
            </Section>
            <Section title="Soil">
              <Choice
                label="Soil"
                value={inputs.soil}
                options={[
                  { value: "cohesionless", label: "Cohesionless (sand)" },
                  { value: "cohesive", label: "Cohesive (clay)" },
                ]}
                onChange={set("soil")}
              />
              {inputs.soil === "cohesive" ? (
                <Field label="Undrained shear strength" unit="psf" value={inputs.c} onChange={set("c")} step={50} />
              ) : (
                <>
                  <Field label="Friction angle" unit="deg" value={inputs.phi} onChange={set("phi")} />
                  <Field label="Unit weight" unit="pcf" value={inputs.gamma} onChange={set("gamma")} />
                  <Field label="SPT N60" value={inputs.N60} onChange={set("N60")} />
                </>
              )}
              <Field label="φ on the lateral resistance (extreme event)" value={inputs.phiLateral} onChange={set("phiLateral")} step={0.05} />
              <Choice
                label="Soil torsion"
                value={inputs.torsionMethod}
                options={[
                  { value: "cdot", label: "As CDOT's standard caissons" },
                  { value: "aashto", label: "AASHTO's side resistance" },
                ]}
                onChange={set("torsionMethod")}
              />
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
                <ChecksTable checks={r.checks} groupOf={(id) => (id === "embedment" || id === "soil-torsion" || id === "axial" ? "Soil" : id === "bolts" || id === "height" ? "Layout" : "The caisson")} />
                <TakeoffPanel kind="high-mast-foundation" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <KeyValues
                  title="At the base"
                  rows={[
                    ["Dead load", `${fmt(r.base.P, 2)} kip`],
                    ["Wind moment, shear", `${fmt(r.base.M, 1)} kip·ft, ${fmt(r.base.V, 2)} kip`],
                    ["Embedment needed (Broms)", `${fmt(r.broms.L, 2)} ft`],
                    ["Largest moment in the shaft", `${fmt(r.broms.Mu, 1)} kip·ft`],
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
