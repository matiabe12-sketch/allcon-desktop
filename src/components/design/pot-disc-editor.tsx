"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { designHlmr, sizeHlmr, type HlmrInputs } from "@/lib/design/bearings/pot-disc";
import { HLMR_GROUPS } from "@/lib/design/bearings/pot-disc-calc";
import { bearingHeight, bearingViews } from "@/lib/design/bearings/pot-disc-detail";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// Designing a pot or disc bearing: the loads, rotation and parts on the left; the section and plan, the checks and the
// working on the right, saved as you go. "Size from the loads" fills in the least parts that meet the provisions.

const groupOf = (id: string) => HLMR_GROUPS.find((g) => g.of(id))?.title ?? "Other";
const EMPTY = schedule([], []);

export function PotDiscEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: HlmrInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof HlmrInputs>(key: K) => (v: HlmrInputs[K]) => setInputs((s) => ({ ...s, [key]: v }));
  const part = <K extends "pot" | "disc" | "ptfe" | "guides" | "masonry" | "sole" | "anchors">(k: K) => <F extends keyof HlmrInputs[K]>(f: F) => (v: HlmrInputs[K][F]) => setInputs((s) => ({ ...s, [k]: { ...s[k], [f]: v } }));
  const outcome = useMemo(() => {
    try {
      return { result: designHlmr(inputs), views: bearingViews(inputs), height: bearingHeight(inputs), error: null };
    } catch (err) {
      return { result: null, views: [], height: 0, error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const pot = inputs.kind === "pot";
  const p = part("pot");
  const d = part("disc");

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label={`${pot ? "Pot" : "Disc"} Bearing · AASHTO LRFD ${pot ? "14.7.4" : "14.7.8"}, ${inputs.fixity}`} canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Bearing" open>
              <Choice label="Type" value={inputs.kind} options={[{ value: "pot", label: "Pot bearing (14.7.4)" }, { value: "disc", label: "Disc bearing (14.7.8)" }]} onChange={set("kind")} />
              <Choice label="Movement" value={inputs.fixity} options={[{ value: "fixed", label: "Fixed" }, { value: "guided", label: "Guided (slides along the bridge)" }, { value: "free", label: "Free (slides any way)" }]} onChange={set("fixity")} />
              <Button size="sm" variant="outline" className="my-1" onClick={() => setInputs((s) => sizeHlmr(s))}>
                Size from the loads
              </Button>
            </Section>
            <Section title="Loads and rotation" open>
              <Field label="Permanent load (DC + DW), service" unit="kip" value={inputs.DL} onChange={set("DL")} />
              <Field label="Live load with IM, service" unit="kip" value={inputs.LL} onChange={set("LL")} />
              <Field label="The least vertical load" unit="kip" value={inputs.minLoad} onChange={set("minLoad")} hint="For lift-off and the pot's 20% (14.7.4.1)" />
              <Field label="Horizontal force, factored" unit="kip" value={inputs.Hu} onChange={set("Hu")} />
              <Field label="Horizontal force, service" unit="kip" value={inputs.Hs} onChange={set("Hs")} />
              <Field label="Rotation, strength limit state" unit="rad" value={inputs.rotation} onChange={set("rotation")} step={0.001} hint="0.005 rad is added for uncertainty (14.4.2.1)" />
              <Field label="Construction tolerance" unit="rad" value={inputs.construction} onChange={set("construction")} step={0.001} />
              <Field label="Steel Fy" unit="ksi" value={inputs.Fy} onChange={set("Fy")} />
              <Field label="Seat concrete f'c" unit="ksi" value={inputs.fc} onChange={set("fc")} step={0.5} />
              <Field label="Girder concrete f'c (0: steel girder)" unit="ksi" value={inputs.fcGirder} onChange={set("fcGirder")} step={0.5} />
            </Section>
            {pot ? (
              <Section title="Pot" open>
                <Field label="Pot inside diameter Dp" unit="in" value={inputs.pot.Dp} onChange={p("Dp")} step={0.25} />
                <Field label="Elastomeric pad hr" unit="in" value={inputs.pot.hr} onChange={p("hr")} step={0.125} />
                <Choice label="Sealing rings" value={inputs.pot.rings.type} options={[{ value: "flat", label: "Flat brass rings" }, { value: "circular", label: "One circular brass ring" }]} onChange={(v) => p("rings")({ ...inputs.pot.rings, type: v })} />
                {inputs.pot.rings.type === "flat" && <Field label="Flat rings, how many" value={inputs.pot.rings.count} onChange={(v) => p("rings")({ ...inputs.pot.rings, count: Math.max(1, Math.round(v)) })} />}
                <Field label={inputs.pot.rings.type === "flat" ? "Each ring's width" : "The ring's diameter"} unit="in" value={inputs.pot.rings.width} onChange={(v) => p("rings")({ ...inputs.pot.rings, width: v })} step={0.0625} />
                {inputs.pot.rings.type === "flat" && <Field label="Each ring's thickness" unit="in" value={inputs.pot.rings.thickness} onChange={(v) => p("rings")({ ...inputs.pot.rings, thickness: v })} step={0.03125} />}
                <Field label="Pot wall" unit="in" value={inputs.pot.tw} onChange={p("tw")} step={0.125} />
                <Field label="Pot base" unit="in" value={inputs.pot.tBase} onChange={p("tBase")} step={0.125} />
                <Field label="Pot's inside depth" unit="in" value={inputs.pot.cavity} onChange={p("cavity")} step={0.125} />
                <Field label="Piston" unit="in" value={inputs.pot.tPiston} onChange={p("tPiston")} step={0.125} />
                <Field label="Piston rim's contact width" unit="in" value={inputs.pot.rim} onChange={p("rim")} step={0.0625} />
                <Field label="Rim to the wall" unit="in" value={inputs.pot.clearance} onChange={p("clearance")} step={0.01} />
              </Section>
            ) : (
              <Section title="Disc" open>
                <Field label="Urethane disc diameter Dd" unit="in" value={inputs.disc.Dd} onChange={d("Dd")} step={0.25} />
                <Field label="Its thickness" unit="in" value={inputs.disc.td} onChange={d("td")} step={0.125} />
                <Field label="Its apparent modulus (manufacturer)" unit="ksi" value={inputs.disc.E} onChange={d("E")} hint="For the deflection and lift-off; typically 40–80 ksi for the usual compounds" />
                <Field label="Upper steel plate" unit="in" value={inputs.disc.tUpper} onChange={d("tUpper")} step={0.125} />
                <Field label="Lower steel plate" unit="in" value={inputs.disc.tLower} onChange={d("tLower")} step={0.125} />
                <Field label="Shear pin diameter" unit="in" value={inputs.disc.pin} onChange={d("pin")} step={0.125} />
              </Section>
            )}
            {inputs.fixity !== "fixed" && (
              <Section title="Sliding surface" open>
                <Field label="PTFE diameter (recessed)" unit="in" value={inputs.ptfe.D} onChange={part("ptfe")("D")} step={0.25} />
                <Field label="PTFE thickness" unit="in" value={inputs.ptfe.t} onChange={part("ptfe")("t")} step={0.0625} />
                <Field label="Friction coefficient" value={inputs.ptfe.mu} onChange={part("ptfe")("mu")} step={0.01} hint="AASHTO Table 14.7.2.5-1" />
                <Field label="Movement, each way" unit="in" value={inputs.ptfe.movement} onChange={part("ptfe")("movement")} step={0.25} />
              </Section>
            )}
            {inputs.fixity === "guided" && (
              <Section title="Guide bars" open>
                <Field label="Width" unit="in" value={inputs.guides.b} onChange={part("guides")("b")} step={0.125} />
                <Field label="Height" unit="in" value={inputs.guides.h} onChange={part("guides")("h")} step={0.125} />
                <Field label="Length" unit="in" value={inputs.guides.L} onChange={part("guides")("L")} />
              </Section>
            )}
            <Section title="Plates and anchor rods" open>
              <Field label="Masonry plate, along the bridge" unit="in" value={inputs.masonry.B} onChange={part("masonry")("B")} />
              <Field label="Masonry plate, across" unit="in" value={inputs.masonry.L} onChange={part("masonry")("L")} />
              <Field label="Masonry plate thickness" unit="in" value={inputs.masonry.t} onChange={part("masonry")("t")} step={0.125} />
              <Field label="Supporting concrete's area A2" unit="in²" value={inputs.masonry.A2} onChange={part("masonry")("A2")} />
              <Field label="Sole plate, along the bridge" unit="in" value={inputs.sole.L} onChange={part("sole")("L")} />
              <Field label="Sole plate, across" unit="in" value={inputs.sole.B} onChange={part("sole")("B")} />
              <Field label="Sole plate thickness" unit="in" value={inputs.sole.t} onChange={part("sole")("t")} step={0.125} />
              <Field label="Anchor rods" value={inputs.anchors.n} onChange={(v) => part("anchors")("n")(Math.max(0, Math.round(v)))} />
              <Field label="Their diameter" unit="in" value={inputs.anchors.d} onChange={part("anchors")("d")} step={0.125} />
              <Field label="Their Fu" unit="ksi" value={inputs.anchors.Fu} onChange={part("anchors")("Fu")} />
            </Section>
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4">
          {outcome.error ? (
            <DesignErrorCard message={outcome.error} />
          ) : (
            r && (
              <>
                <ChecksBanner checks={r.checks} extra={<span className="ml-auto text-xs">θu {fmt(r.tu, 4)} rad · height {fmt(outcome.height, 2)} in</span>} />
                <div className="grid gap-4 xl:grid-cols-2">
                  {outcome.views.map((v) => (
                    <Card key={v.title}>
                      <CardContent className="py-3">
                        <p className="mb-1 text-xs font-semibold">{v.title}</p>
                        <DetailSketch view={v} schedule={EMPTY} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <ChecksTable checks={r.checks} groupOf={groupOf} />
                <TakeoffPanel kind="pot-disc-bearing" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <KeyValues
                  title="For the plans"
                  rows={[
                    ["Fixity", inputs.fixity],
                    ["Vertical load, max / min (service)", `${fmt(r.P, 1)} / ${fmt(inputs.minLoad, 1)} kip`],
                    ["Horizontal load (service / factored)", `${fmt(inputs.Hs, 1)} / ${fmt(inputs.Hu, 1)} kip`],
                    ["Design rotation θu", `${fmt(r.tu, 4)} rad`],
                    ["Assumed bearing height", `${fmt(outcome.height, 2)} in`],
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
