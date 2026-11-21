"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { designSignBridge, type BridgeSign, type SignBridgeInputs } from "@/lib/design/signs/bridge";
import { signBridgeViews } from "@/lib/design/signs/bridge-detail";
import type { Weld } from "@/lib/design/signs/structure";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// Designing a monotube sign bridge: the layout, tubes, signs, wind, connections, fatigue and shafts on the left; the
// elevation, checks, loads and take-off on the right, saved as you go.

const EMPTY = schedule([], []);
const sizes = [5, 6, 7, 8, 9, 10, 11].map((b) => ({ value: b, label: `#${b}` }));
const welds: { value: Weld; label: string }[] = [
  { value: "groove", label: "Full-penetration groove weld, backing ring" },
  { value: "fillet", label: "Fillet-welded socket" },
];

export function SignBridgeEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: SignBridgeInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof SignBridgeInputs>(k: K) => (v: SignBridgeInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const sub = <K extends "base" | "flange" | "fatigue">(k: K) => <F extends keyof SignBridgeInputs[K]>(f: F) => (v: SignBridgeInputs[K][F]) => setInputs((s) => ({ ...s, [k]: { ...s[k], [f]: v } }));
  const setSign = (n: number, patch: Partial<BridgeSign>) => setInputs((s) => ({ ...s, signs: s.signs.map((x, k) => (k === n ? { ...x, ...patch } : x)) }));
  const outcome = useMemo(() => {
    try {
      return { result: designSignBridge(inputs), views: signBridgeViews(inputs), error: null as string | null };
    } catch (err) {
      return { result: null, views: [], error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const groupOf = (id: string) => (/^(post|beam|knee)/.test(id) ? "Tubes (LTS 5, 10.4.1)" : /^(rod|base|flange)/.test(id) ? "Connections (LTS 5.15, 5.16)" : id.startsWith("fat-") ? "Fatigue (LTS 11)" : "Shafts");

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Sign Bridge · AASHTO LRFD-LTS" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Layout and tubes" open>
              <Field label="Span, post to post" unit="ft" value={inputs.span} onChange={set("span")} />
              <Field label="Shaft top to the span's centerline" unit="ft" value={inputs.height} onChange={set("height")} step={0.5} />
              <Field label="Post diameter" unit="in" value={inputs.postD} onChange={set("postD")} step={0.25} />
              <Field label="Post wall" unit="in" value={inputs.postWall} onChange={set("postWall")} step={0.0625} />
              <Field label="Span diameter" unit="in" value={inputs.beamD} onChange={set("beamD")} step={0.25} />
              <Field label="Span wall" unit="in" value={inputs.beamWall} onChange={set("beamWall")} step={0.0625} />
              <Field label="Steel Fy" unit="ksi" value={inputs.Fy} onChange={set("Fy")} hint="ASTM A595 Grade A: 55 ksi" />
            </Section>
            <Section title="Signs" open>
              {inputs.signs.map((s, n) => (
                <div key={n} className="border-b py-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    Sign {n + 1}
                    <button type="button" aria-label={`Remove sign ${n + 1}`} className="text-muted-foreground hover:text-destructive" onClick={() => setInputs((x) => ({ ...x, signs: x.signs.filter((_, k) => k !== n) }))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <Field label="Length" unit="ft" value={s.length} onChange={(v) => setSign(n, { length: v })} step={0.5} />
                  <Field label="Height" unit="ft" value={s.height} onChange={(v) => setSign(n, { height: v })} step={0.5} />
                  <Field label="Center, from the left post" unit="ft" value={s.at} onChange={(v) => setSign(n, { at: v })} step={0.5} />
                  <Field label="Weight (0: aluminum panel)" unit="kip" value={s.weight} onChange={(v) => setSign(n, { weight: v })} step={0.25} />
                  <Field label="Depth (0: a flat panel)" unit="ft" value={s.depth} onChange={(v) => setSign(n, { depth: v })} step={0.25} />
                </div>
              ))}
              {inputs.signs.length < 6 && (
                <Button size="sm" variant="outline" className="my-1" onClick={() => setInputs((x) => ({ ...x, signs: [...x.signs, { length: 12, height: 8, at: x.span / 2, weight: 0, depth: 0 }] }))}>
                  <Plus className="size-3.5" /> Add a sign
                </Button>
              )}
              <Field label="Panel thickness" unit="in" value={inputs.signThickness} onChange={set("signThickness")} step={0.03125} />
              <Field label="Supports and walkway" unit="% of panels" value={inputs.miscPct} onChange={set("miscPct")} />
            </Section>
            <Section title="Wind (LTS 3.8)" open>
              <Field label="Basic wind speed (for the MRI)" unit="mph" value={inputs.V} onChange={set("V")} />
              <Field label="Directionality Kd" value={inputs.Kd} onChange={set("Kd")} step={0.05} />
              <Field label="Gust effect G" value={inputs.G} onChange={set("G")} step={0.01} />
              <Field label="Velocity conversion Cv" value={inputs.Cv} onChange={set("Cv")} step={0.05} />
            </Section>
            <Section title="Connections">
              <Field label="Base plate thickness" unit="in" value={inputs.base.plateT} onChange={sub("base")("plateT")} step={0.25} />
              <Field label="Base plate width" unit="in" value={inputs.base.plateW} onChange={sub("base")("plateW")} />
              <Field label="Base plate's center opening" unit="in" value={inputs.base.opening} onChange={sub("base")("opening")} />
              <Field label="Anchor bolts per post" value={inputs.base.rods} onChange={(v) => sub("base")("rods")(Math.max(4, Math.round(v)))} />
              <Field label="Bolt diameter" unit="in" value={inputs.base.rodD} onChange={sub("base")("rodD")} step={0.125} />
              <Field label="Bolt circle" unit="in" value={inputs.base.rodCircle} onChange={sub("base")("rodCircle")} />
              <Field label="Bolts' Fu" unit="ksi" value={inputs.base.rodFu} onChange={sub("base")("rodFu")} />
              <Field label="Span flange bolts" value={inputs.flange.bolts} onChange={(v) => sub("flange")("bolts")(Math.max(4, Math.round(v)))} />
              <Field label="Flange bolt diameter" unit="in" value={inputs.flange.boltD} onChange={sub("flange")("boltD")} step={0.125} />
              <Field label="Flange bolt circle" unit="in" value={inputs.flange.circle} onChange={sub("flange")("circle")} />
              <Field label="Flange plate thickness" unit="in" value={inputs.flange.plateT} onChange={sub("flange")("plateT")} step={0.25} />
              <Field label="Flange plate's center opening" unit="in" value={inputs.flange.opening} onChange={sub("flange")("opening")} />
            </Section>
            <Section title="Fatigue (LTS 11)">
              <Choice label="Importance category" value={inputs.fatigue.category} options={[{ value: "I", label: "I (critical, lifeline)" }, { value: "II", label: "II" }, { value: "III", label: "III" }]} onChange={sub("fatigue")("category")} />
              <Field label="Yearly mean wind speed" unit="mph" value={inputs.fatigue.vMean} onChange={sub("fatigue")("vMean")} />
              <Toggle label="Over traffic lanes (truck-induced gust)" value={inputs.fatigue.truck} onChange={sub("fatigue")("truck")} />
              <Field label="Road to the signs' bottom" unit="ft" value={inputs.fatigue.clearance} onChange={sub("fatigue")("clearance")} step={0.5} />
              <Choice label="Post-to-base-plate weld" value={inputs.fatigue.postWeld} options={welds} onChange={sub("fatigue")("postWeld")} />
              <Choice label="Span-to-flange weld" value={inputs.fatigue.beamWeld} options={welds} onChange={sub("fatigue")("beamWeld")} />
            </Section>
            <Section title="Drilled shafts (each post)">
              <Field label="Diameter" unit="in" value={inputs.shaftD} onChange={set("shaftD")} step={6} />
              <Field label="Length" unit="ft" value={inputs.shaftLength} onChange={set("shaftLength")} />
              <Field label="Longitudinal bars" value={inputs.bars} onChange={(v) => set("bars")(Math.round(v))} />
              <Choice label="Bar size" value={inputs.bar} options={sizes} onChange={set("bar")} />
              <Field label="Tie spacing" unit="in" value={inputs.tieSpacing} onChange={set("tieSpacing")} />
              <Field label="Concrete f′c" unit="ksi" value={inputs.fc} onChange={set("fc")} step={0.5} />
              <Field label="Unit tip resistance" unit="ksf" value={inputs.qp} onChange={set("qp")} />
              <Field label="Unit side resistance" unit="ksf" value={inputs.qs} onChange={set("qs")} step={0.25} />
              <Field label="Length counted for side resistance" unit="ft" value={inputs.sideLength} onChange={set("sideLength")} />
              <Field label="Largest moment from a p–y analysis (0: the base's)" unit="kip·ft" value={inputs.pyMoment} onChange={set("pyMoment")} />
              <Field label="Largest shear from a p–y analysis" unit="kip" value={inputs.pyShear} onChange={set("pyShear")} />
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
                <TakeoffPanel kind="sign-bridge" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <div className="grid gap-4 xl:grid-cols-2">
                  <KeyValues
                    title="Loads"
                    rows={[
                      ["Dead load (span, posts, signs)", `${fmt(r.dead.DC, 2)} kip`],
                      ["Wind on the signs", r.wind.signs.map((F) => `${fmt(F, 2)} kip`).join(", ")],
                      ["Kz; Cd span / posts", `${fmt(r.wind.kz, 3)}; ${fmt(r.wind.CdBeam, 3)} / ${fmt(r.wind.CdPost, 3)}`],
                      ["Each post's base across the frame (wind)", `${fmt(r.wind.postWindBase, 1)} kip·ft`],
                    ]}
                  />
                  <KeyValues
                    title="The portal (gravity)"
                    rows={[
                      ["Span at midspan (sagging)", `${fmt(r.frame.gravity.Mmid, 1)} kip·ft`],
                      ["Span at the knees", `${fmt(r.frame.knee, 1)} kip·ft`],
                      ["Each post's base", `${fmt(r.frame.postBase.M, 1)} kip·ft, ${fmt(r.frame.postBase.P, 2)} kip`],
                      ["Span's deflection (Service I)", `${fmt(r.deflection, 2)} in`],
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
