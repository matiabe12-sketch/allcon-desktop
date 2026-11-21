"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { designNoiseWall, type NoiseWallInputs } from "@/lib/design/noisewall/wall";
import { noiseWallViews } from "@/lib/design/noisewall/detail";
import { PILE_SECTIONS } from "@/lib/design/shoring/sections";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// Designing a noise wall: the wall, panels, posts, loads and shafts on the left; the drawings, checks, loads and
// take-off on the right, saved as you go.

const EMPTY = schedule([], []);
const W_SHAPES = Object.keys(PILE_SECTIONS)
  .filter((k) => k.startsWith("W"))
  .map((k) => ({ value: k, label: k }));
const sizes = [4, 5, 6, 7, 8, 9, 10, 11].map((b) => ({ value: b, label: `#${b}` }));

export function NoiseWallEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: NoiseWallInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof NoiseWallInputs>(k: K) => (v: NoiseWallInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const outcome = useMemo(() => {
    try {
      return { result: designNoiseWall(inputs), views: noiseWallViews(inputs), error: null as string | null };
    } catch (err) {
      return { result: null, views: [], error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const groupOf = (id: string) => (id.startsWith("panel") ? "Panels" : id.startsWith("post") ? "Posts" : id === "deflection" ? "Service" : "Shafts");

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Noise Wall · AASHTO 15, CDOT BDM 15" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Wall and panels" open>
              <Field label="Height above the ground" unit="ft" value={inputs.H} onChange={set("H")} />
              <Field label="Post spacing" unit="ft" value={inputs.spacing} onChange={set("spacing")} />
              <Field label="Panel thickness" unit="in" value={inputs.tp} onChange={set("tp")} step={0.5} />
              <Field label="Each panel's height" unit="ft" value={inputs.panelH} onChange={set("panelH")} step={0.5} />
              <div className="grid grid-cols-2 gap-x-2">
                <Choice label="Horizontal bars, each face" value={inputs.bar} options={sizes} onChange={set("bar")} />
                <Field label="Spacing" unit="in" value={inputs.barSpacing} onChange={set("barSpacing")} />
              </div>
              <Field label="Cover" unit="in" value={inputs.cover} onChange={set("cover")} step={0.25} />
              <Field label="Concrete f′c" unit="ksi" value={inputs.fc} onChange={set("fc")} step={0.5} />
            </Section>
            <Section title="Posts" open>
              <Choice label="W shape" value={inputs.post} options={W_SHAPES} onChange={set("post")} />
              <Field label="Steel Fy" unit="ksi" value={inputs.Fy} onChange={set("Fy")} />
              <Field label="Top deflection limit, H /" value={inputs.deflRatio} onChange={set("deflRatio")} step={10} />
            </Section>
            <Section title="Loads" open>
              <Field label="Wind speed, 3-second gust" unit="mph" value={inputs.V} onChange={set("V")} hint="AASHTO Figure 3.8.1.1.2-1; CDOT BDM Section 32 in the special wind region" />
              <Choice
                label="Exposure"
                value={inputs.exposure}
                options={[
                  { value: "B", label: "B (urban, wooded)" },
                  { value: "C", label: "C (open terrain)" },
                  { value: "D", label: "D (flat, unobstructed)" },
                ]}
                onChange={set("exposure")}
              />
              <Toggle label="In the clear zone, behind a railing (collision, 15.8.4)" value={inputs.collision} onChange={set("collision")} />
              {inputs.collision && (
                <>
                  <Field label="Setback, the railing's face to the wall" unit="ft" value={inputs.setback} onChange={set("setback")} step={0.5} />
                  <Choice
                    label="Railing test level"
                    value={inputs.testLevel}
                    options={[
                      { value: 3, label: "TL-3 (CDOT)" },
                      { value: 4, label: "TL-4" },
                      { value: 5, label: "TL-5" },
                    ]}
                    onChange={set("testLevel")}
                  />
                </>
              )}
              <Field label="Seismic kh (0: none)" value={inputs.kh} onChange={set("kh")} step={0.01} />
            </Section>
            <Section title="Drilled shafts">
              <Field label="Diameter" unit="in" value={inputs.shaftD} onChange={set("shaftD")} step={6} />
              <Field label="Length below the ground" unit="ft" value={inputs.shaftL} onChange={set("shaftL")} step={0.5} />
              <div className="grid grid-cols-2 gap-x-2">
                <Field label="Bars" value={inputs.shaftBars} onChange={(v) => set("shaftBars")(Math.max(6, Math.round(v)))} />
                <Choice label="Size" value={inputs.shaftBar} options={sizes} onChange={set("shaftBar")} />
              </div>
              <Field label="Shaft f′c" unit="ksi" value={inputs.shaftFc} onChange={set("shaftFc")} step={0.5} />
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
                <Field label="Undrained shear strength" unit="ksf" value={inputs.c} onChange={set("c")} step={0.25} />
              ) : (
                <>
                  <Field label="Unit weight" unit="pcf" value={inputs.gamma} onChange={set("gamma")} />
                  <Field label="Friction angle" unit="deg" value={inputs.phi} onChange={set("phi")} />
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
                <TakeoffPanel kind="noise-wall" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <KeyValues
                  title="Loads on a post"
                  rows={[
                    ["Wind Pz (Strength III); Kz", `${fmt(r.wind.Pz * 1000, 1)} psf; ${fmt(r.wind.Kz, 3)}`],
                    ["Wind on a post, at 0.55H", `${fmt(r.wind.Fw, 2)} kip`],
                    ["Collision", r.col ? `${fmt(r.col.F, 1)} kip at ${fmt(r.col.h, 1)} ft (Case ${r.col.case})` : "not applied"],
                    ["Earthquake", r.eq ? `${fmt(r.eq.F, 2)} kip at ${fmt(r.eq.h, 1)} ft` : "not applied"],
                    ["Embedment needed", r.shaft.cases.map((c) => `${fmt(c.b.L, 2)} ft`).join(", ")],
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
