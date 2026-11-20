"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { designSlabBridge, type SlabBridgeInputs, type SlabBridgeResult } from "@/lib/design/slabs/slab-bridge";
import { SLAB_BRIDGE_GROUPS } from "@/lib/design/slabs/slab-bridge-calc";
import { DesignError } from "@/lib/design/walls/cip";
import { BarsField, ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { TakeoffPanel } from "./takeoff-panel";

// Designing a cast-in-place slab bridge: the inputs on the left, worked out as they change (the sketch, the checks,
// the strips and the reactions) on the right, saved as you go.

const groupOf = (id: string) => SLAB_BRIDGE_GROUPS.find((g) => g.of(id))?.title ?? "Other";

function SlabSketch({ i, r }: { i: SlabBridgeInputs; r: SlabBridgeResult }) {
  const spans = i.spans.filter((L) => L > 0);
  const total = spans.reduce((t, L) => t + L, 0);
  const W = 560;
  const s = (W - 40) / total;
  const tY = 40;
  const h = Math.max(6, (i.t / 12) * s);
  const sup = [20, ...spans.map((_, k) => 20 + spans.slice(0, k + 1).reduce((t, L) => t + L, 0) * s)];
  // The section: the width to the same scale as the depth, exaggerated.
  const sw = 260 / i.W;
  const sh = Math.max(8, (i.t / 12) * sw * 3);
  return (
    <svg viewBox={`0 0 ${W} 200`} className="w-full" role="img" aria-label="Slab bridge elevation and section">
      <rect x={20} y={tY} width={total * s} height={h} className="fill-muted stroke-foreground" strokeWidth={1} />
      {sup.map((px, k) => (
        <g key={k}>
          <path d={`M${px} ${tY + h} l-7 12 h14 z`} className="fill-none stroke-foreground" strokeWidth={1} />
          <text x={px} y={tY + h + 24} textAnchor="middle" className="fill-muted-foreground text-[10px]">{k === 0 || k === spans.length ? "Abut" : `Pier ${k}`}</text>
        </g>
      ))}
      {spans.map((L, k) => (
        <text key={k} x={sup[k] + (L * s) / 2} y={tY - 6} textAnchor="middle" className="fill-foreground text-[11px]">{`${fmt(L, 1)} ft`}</text>
      ))}
      <text x={20} y={tY - 22} className="fill-muted-foreground text-[10px]">{r.continuous ? "Continuous over the piers" : "Simple spans"}</text>
      <g transform="translate(150 120)">
        <rect x={0} y={0} width={i.W * sw} height={sh} className="fill-muted stroke-foreground" strokeWidth={1} />
        <rect x={0} y={-14} width={i.barrierWidth * sw} height={14} className="fill-foreground/30" />
        <rect x={(i.W - i.barrierWidth) * sw} y={-14} width={i.barrierWidth * sw} height={14} className="fill-foreground/30" />
        <rect x={0} y={sh + 4} width={(r.strips[0].Eedge / 12) * sw} height={4} className="fill-amber-500/60" />
        <rect x={(i.W - r.strips[0].Eedge / 12) * sw} y={sh + 4} width={(r.strips[0].Eedge / 12) * sw} height={4} className="fill-amber-500/60" />
        <text x={(i.W * sw) / 2} y={sh + 22} textAnchor="middle" className="fill-muted-foreground text-[10px]">{`${fmt(i.W, 1)} ft wide, ${fmt(i.t, 1)} in deep; edge strips ${fmt(r.strips[0].Eedge, 1)} in`}</text>
      </g>
    </svg>
  );
}

export function SlabBridgeEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: SlabBridgeInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof SlabBridgeInputs>(key: K) => (v: SlabBridgeInputs[K]) => setInputs((s) => ({ ...s, [key]: v }));
  const outcome = useMemo(() => {
    try {
      return { result: designSlabBridge(inputs), error: null };
    } catch (err) {
      return { result: null, error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const n = inputs.spans.length;
  const setSpans = (k: number) => setInputs((s) => ({ ...s, spans: Array.from({ length: k }, (_, j) => s.spans[j] ?? s.spans[s.spans.length - 1] ?? 30) }));

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Slab Bridge · AASHTO LRFD 4.6.2.3, 5.6, 5.12.2.1, 9.7.3.2" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Spans" open>
              <Choice label="Spans" value={n} options={[1, 2, 3, 4].map((k) => ({ value: k, label: String(k) }))} onChange={setSpans} />
              {inputs.spans.map((L, k) => (
                <Field key={k} label={`Span ${k + 1}, support to support`} unit="ft" value={L} onChange={(v) => setInputs((s) => ({ ...s, spans: s.spans.map((x, j) => (j === k ? v : x)) }))} />
              ))}
              {n > 1 && <Toggle label="Continuous over the piers (cast monolithic)" value={inputs.continuous} onChange={set("continuous")} />}
              <Field label="Skew" unit="deg" value={inputs.skew} onChange={set("skew")} />
            </Section>
            <Section title="Slab" open>
              <Field label="Width, out to out" unit="ft" value={inputs.W} onChange={set("W")} />
              <Field label="Depth" unit="in" value={inputs.t} onChange={set("t")} step={0.5} />
              <Field label="Edge to the barrier's inside face" unit="ft" value={inputs.barrierWidth} onChange={set("barrierWidth")} step={0.25} />
              <Field label="Each barrier's weight" unit="klf" value={inputs.barrierWeight} onChange={set("barrierWeight")} step={0.01} />
              <Field label="Overlay (0 for none)" unit="in" value={inputs.wearing} onChange={set("wearing")} step={0.5} />
            </Section>
            <Section title="Concrete and bars" open>
              <Field label="f'c" unit="ksi" value={inputs.fc} onChange={set("fc")} step={0.5} />
              <Field label="fy" unit="ksi" value={inputs.fy} onChange={set("fy")} />
              <Field label="Concrete unit weight" unit="pcf" value={inputs.gammaC} scale={1000} onChange={set("gammaC")} />
              <Field label="Cover, top" unit="in" value={inputs.coverTop} onChange={set("coverTop")} step={0.25} />
              <Field label="Cover, bottom" unit="in" value={inputs.coverBot} onChange={set("coverBot")} step={0.25} />
              <Field label="Exposure class (1 or 2)" value={inputs.exposure} onChange={(v) => set("exposure")(v >= 1.5 ? 2 : 1)} />
              <BarsField label="Main, bottom along the roadway" value={inputs.bottom} onChange={set("bottom")} />
              {r?.continuous && <BarsField label="Main, top over the piers" value={inputs.top} onChange={set("top")} />}
              <BarsField label="Bottom transverse (distribution)" value={inputs.dist} onChange={set("dist")} />
              <BarsField label="Top transverse" value={inputs.topTrans} onChange={set("topTrans")} />
              <BarsField label="Top longitudinal (elsewhere)" value={inputs.topLong} onChange={set("topLong")} />
              <Toggle label="Bars added in each edge strip (edge beam)" value={!!inputs.edgeBars} onChange={(v) => set("edgeBars")(v ? { count: 2, bar: 8 } : null)} />
              {inputs.edgeBars && (
                <>
                  <Field label="Added bars, each edge, top and bottom" value={inputs.edgeBars.count} onChange={(v) => set("edgeBars")({ ...inputs.edgeBars!, count: Math.max(0, Math.round(v)) })} />
                  <Choice label="Their size" value={inputs.edgeBars.bar} options={[5, 6, 7, 8, 9, 10, 11].map((b) => ({ value: b, label: `#${b}` }))} onChange={(v) => set("edgeBars")({ ...inputs.edgeBars!, bar: v })} />
                </>
              )}
            </Section>
            <Section title="Deflection (2.5.2.6.2)">
              <Toggle label="Check the live load deflection" value={inputs.llDeflection} onChange={set("llDeflection")} />
              {inputs.llDeflection && <Field label="Limit, L /" value={inputs.deflectionLimit} onChange={set("deflectionLimit")} />}
            </Section>
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4">
          {outcome.error ? (
            <DesignErrorCard message={outcome.error} />
          ) : (
            r && (
              <>
                <ChecksBanner checks={r.checks} extra={<span className="ml-auto text-xs">{r.NL} design lanes</span>} />
                <Card>
                  <CardContent className="py-3">
                    <SlabSketch i={inputs} r={r} />
                  </CardContent>
                </Card>
                <ChecksTable checks={r.checks} groupOf={groupOf} />
                <TakeoffPanel kind="slab-bridge" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <div className="grid gap-4 xl:grid-cols-2">
                  <KeyValues title="Strips (AASHTO 4.6.2.3)" rows={r.strips.map((s, k) => [`Span ${k + 1}: E / edge`, `${fmt(s.E, 1)} / ${fmt(s.Eedge, 1)} in`] as [string, string]).concat([["Skew factor r", fmt(r.r)]])} />
                  <KeyValues title="Reactions per foot (kip/ft, unfactored)" rows={r.reactions.map((x, k) => [`Support ${k + 1}`, `DC ${fmt(x.DC)}, DW ${fmt(x.DW)}, LL ${fmt(x.LL)}`] as [string, string])} />
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
