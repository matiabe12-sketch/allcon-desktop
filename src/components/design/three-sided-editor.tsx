"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { designThreeSided, type Bars, type ThreeSidedInputs } from "@/lib/design/culverts/three-sided";
import { threeSidedViews } from "@/lib/design/culverts/detail";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// Designing a precast three-sided culvert: the unit, fill, bars and footings on the left; the drawings, checks, forces
// and take-off on the right, saved as you go.

const EMPTY = schedule([], []);
const sizes = [4, 5, 6, 7, 8, 9, 10].map((b) => ({ value: b, label: `#${b}` }));
type BarKey = "slabBottom" | "slabTop" | "legOut" | "legIn" | "footBars";

export function ThreeSidedEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: ThreeSidedInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof ThreeSidedInputs>(k: K) => (v: ThreeSidedInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const bar = (k: BarKey) => <F extends keyof Bars>(f: F) => (v: Bars[F]) => setInputs((s) => ({ ...s, [k]: { ...s[k], [f]: v } }));
  const outcome = useMemo(() => {
    try {
      return { result: designThreeSided(inputs), views: threeSidedViews(inputs), error: null as string | null };
    } catch (err) {
      return { result: null, views: [], error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const bars = (k: BarKey, label: string) => (
    <div className="grid grid-cols-2 gap-x-2">
      <Choice label={label} value={inputs[k].bar} options={sizes} onChange={bar(k)("bar")} />
      <Field label="Spacing" unit="in" value={inputs[k].spacing} onChange={bar(k)("spacing")} />
    </div>
  );
  const groupOf = (id: string) => (id.startsWith("slab") ? "Top slab" : id.startsWith("leg") ? "Legs" : id.startsWith("foot") || id === "bearing" || id === "sliding" ? "Footings" : "Deflection");

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Three-Sided Culvert · AASHTO LRFD 12.14" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="The unit" open>
              <Field label="Clear span" unit="ft" value={inputs.span} onChange={set("span")} />
              <Field label="Clear rise" unit="ft" value={inputs.rise} onChange={set("rise")} step={0.5} />
              <Field label="Top slab" unit="in" value={inputs.ts} onChange={set("ts")} />
              <Field label="Legs" unit="in" value={inputs.tw} onChange={set("tw")} />
              <Choice
                label="Legs at the footings"
                value={inputs.base}
                options={[
                  { value: "pinned", label: "Pinned (grouted keyway)" },
                  { value: "fixed", label: "Fixed (doweled)" },
                ]}
                onChange={set("base")}
              />
              <Field label="Concrete f′c" unit="ksi" value={inputs.fc} onChange={set("fc")} step={0.5} />
              <Field label="Bars fy" unit="ksi" value={inputs.fy} onChange={set("fy")} />
              <Field label="Cover" unit="in" value={inputs.cover} onChange={set("cover")} step={0.25} />
            </Section>
            <Section title="Fill and live load" open>
              <Field label="Fill over the top slab" unit="ft" value={inputs.fill} onChange={set("fill")} step={0.5} />
              <Field label="Fill unit weight" unit="pcf" value={inputs.gamma} onChange={set("gamma")} />
              <Field label="Backfill friction angle" unit="deg" value={inputs.phi} onChange={set("phi")} />
              <Toggle label="HL-93 live load" value={inputs.traffic} onChange={set("traffic")} />
              <Field label="Live load distribution factor (3.6.1.2.6)" value={inputs.lldf} onChange={set("lldf")} step={0.05} hint="1.15 for granular fill, 1.0 otherwise" />
            </Section>
            <Section title="Bars" open>
              {bars("slabBottom", "Top slab, inside")}
              {bars("slabTop", "Top slab, outside")}
              {bars("legOut", "Legs, outside")}
              {bars("legIn", "Legs, inside")}
            </Section>
            <Section title="Footings">
              <Field label="Width" unit="ft" value={inputs.footW} onChange={set("footW")} step={0.5} />
              <Field label="Thickness" unit="in" value={inputs.footT} onChange={set("footT")} />
              <Field label="Base below the stream bed" unit="ft" value={inputs.footDepth} onChange={set("footDepth")} step={0.5} />
              {bars("footBars", "Bottom bars")}
              <Field label="Nominal bearing resistance" unit="ksf" value={inputs.qn} onChange={set("qn")} />
              <Field label="Base friction angle" unit="deg" value={inputs.baseFriction} onChange={set("baseFriction")} />
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
                <TakeoffPanel kind="three-sided-culvert" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <div className="grid gap-4 xl:grid-cols-2">
                  <KeyValues
                    title="Strength I moments (per ft)"
                    rows={[
                      ["Top slab, midspan", `${fmt(r.Mu.slabMid, 1)} kip·ft`],
                      ["Top slab, corners", `${fmt(r.Mu.slabCorner, 1)} kip·ft`],
                      ["Legs, outside face", `${fmt(r.Mu.legOut, 1)} kip·ft`],
                      ["Legs, inside face", `${fmt(r.Mu.legIn, 1)} kip·ft`],
                      ["Shear at d", `${fmt(r.Vu, 2)} kip`],
                    ]}
                  />
                  <KeyValues
                    title="Loads"
                    rows={[
                      ["Fe; k0", `${fmt(r.geometry.Fe, 3)}; ${fmt(r.geometry.k0, 3)}`],
                      ["Live load IM; patch", `${fmt(r.live.IM * 100, 1)}%; ${fmt(r.live.Lp, 2)} × ${fmt(r.live.Wp, 2)} ft`],
                      ["Live load deflection", `${fmt(r.deflection, 3)} in`],
                      ["Footing: Nu, Hu; q", `${fmt(r.footing.Nu, 1)}, ${fmt(r.footing.Hu, 1)} kip; ${fmt(r.footing.qu, 2)} ksf`],
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
