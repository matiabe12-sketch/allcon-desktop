"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { designGrs, type GrsInputs } from "@/lib/design/grs/abutment";
import { grsViews } from "@/lib/design/grs/detail";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// Designing a GRS abutment: the layout, loads, fill and reinforcement, and the soils on the left; the drawings, checks,
// the layer-by-layer reinforcement and the take-off on the right, saved as you go.

const EMPTY = schedule([], []);
const LAYOUT = new Set(["sv", "tf", "b", "ab", "de", "base", "resultant", "height", "span"]);

export function GrsEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: GrsInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof GrsInputs>(k: K) => (v: GrsInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const outcome = useMemo(() => {
    try {
      return { result: designGrs(inputs), views: grsViews(inputs), error: null as string | null };
    } catch (err) {
      return { result: null, views: [], error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const groupOf = (id: string) => (LAYOUT.has(id) ? "Layout (Guide 4.3.4, BDM 11.3.5.5)" : ["sliding", "bearing", "global"].includes(id) ? "External stability" : "Internal stability");

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="GRS Abutment · FHWA-HRT-11-026, CDOT BDM 11.3.5" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Layout" open>
              <Field label="Height, the RSF's top to the girders (with the clear space)" unit="ft" value={inputs.H} onChange={set("H")} step={0.5} />
              <Field label="Superstructure depth, the girders' bottom to the roadway" unit="ft" value={inputs.dSup} onChange={set("dSup")} step={0.25} />
              <Field label="Span" unit="ft" value={inputs.span} onChange={set("span")} />
              <Field label="Beam seat (bearing) width" unit="ft" value={inputs.b} onChange={set("b")} step={0.25} />
              <Field label="Setback, the facing's back to the seat" unit="ft" value={inputs.ab} onChange={set("ab")} step={0.05} />
              <Field label="Clear space, the facing's top to the girders" unit="ft" value={inputs.de} onChange={set("de")} step={0.25} />
              <Field label="Reinforcement length at the base (without the facing)" unit="ft" value={inputs.B} onChange={set("B")} step={0.25} />
              <Field label="Facing block depth" unit="ft" value={inputs.tf} onChange={set("tf")} step={0.01} />
              <Field label="Facing weight" unit="lb/ft per ft" value={inputs.faceW} onChange={set("faceW")} />
            </Section>
            <Section title="Loads (unfactored)" open>
              <Field label="Bridge dead load on the seat" unit="psf" value={inputs.qb} onChange={set("qb")} step={50} />
              <Field label="Bridge live load on the seat" unit="psf" value={inputs.qLL} onChange={set("qLL")} step={50} />
              <Field label="Road base dead load" unit="psf" value={inputs.qrb} onChange={set("qrb")} step={10} />
              <Field label="Roadway live load surcharge" unit="psf" value={inputs.qt} onChange={set("qt")} step={10} />
            </Section>
            <Section title="Reinforced fill and geosynthetic" open>
              <Field label="Fill unit weight" unit="pcf" value={inputs.gr} onChange={set("gr")} />
              <Field label="Fill friction angle" unit="deg" value={inputs.phir} onChange={set("phir")} />
              <Field label="Largest grain dmax" unit="in" value={inputs.dmax} onChange={set("dmax")} step={0.125} />
              <Field label="Primary spacing Sv" unit="in" value={inputs.Sv} onChange={set("Sv")} />
              <Field label="Ultimate strength Tf" unit="lb/ft" value={inputs.Tf} onChange={set("Tf")} step={100} />
              <Field label="Strength at 2% strain" unit="lb/ft" value={inputs.T2} onChange={set("T2")} step={50} />
              <Field label="Fill–geotextile friction angle (sliding)" unit="deg" value={inputs.delta} onChange={set("delta")} />
              <Field label="Performance test capacity (0: the analytical method)" unit="psf" value={inputs.qTest} onChange={set("qTest")} step={500} />
              <Field label="Vertical strain under the dead load (0: the Guide's envelope)" unit="%" value={inputs.strain} onChange={set("strain")} step={0.05} />
            </Section>
            <Section title="Retained soil and foundation">
              <Field label="Retained soil unit weight" unit="pcf" value={inputs.gb} onChange={set("gb")} />
              <Field label="Retained soil friction angle" unit="deg" value={inputs.phib} onChange={set("phib")} />
              <Field label="RSF unit weight" unit="pcf" value={inputs.gRSF} onChange={set("gRSF")} />
              <Field label="Foundation unit weight" unit="pcf" value={inputs.gf} onChange={set("gf")} />
              <Field label="Foundation cohesion" unit="psf" value={inputs.cf} onChange={set("cf")} step={100} />
              <Field label="Foundation friction angle" unit="deg" value={inputs.phif} onChange={set("phif")} />
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
                <TakeoffPanel kind="grs-abutment" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <div className="grid gap-4 xl:grid-cols-2">
                  <KeyValues
                    title="Stability"
                    rows={[
                      ["Sliding FR / RR", `${fmt(r.sliding.FR, 0)} / ${fmt(r.sliding.RR, 0)} lb/ft`],
                      ["Bearing σv / φqn", `${fmt(r.bearing.sigma, 0)} / ${fmt(0.65 * r.bearing.qn, 0)} psf (e ${fmt(r.bearing.eB, 2)} ft)`],
                      ["Global FS", fmt(r.global.FS, 2)],
                      ["Vertical capacity", `${fmt(r.capacity.Vapp, 0)} / ${fmt(0.45 * r.capacity.qnUse, 0)} psf`],
                      ["Settlement; face bulge", `${fmt(r.deform.Dv * 12, 2)} in; ${fmt(r.deform.DL * 12, 2)} in`],
                    ]}
                  />
                  <KeyValues
                    title="Reinforcement by layer (at Sv)"
                    rows={r.reinf.layers
                      .filter((_, k) => k < 6)
                      .map((l) => [`z ${fmt(l.z, 2)} ft`, `Treq,f ${fmt(l.Treqf, 0)}, Treq ${fmt(l.Treq, 0)} lb/ft`] as [string, string])
                      .concat([["Bearing bed", `${r.reinf.bedLayers} layers at ${inputs.Sv / 2} in to ${fmt(r.reinf.bedDepth, 2)} ft`]])}
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
