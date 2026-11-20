"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { designFinger, sizeFinger, type FatigueCategory, type FingerJointInputs } from "@/lib/design/joints/finger";
import { designModular, type ModularJointInputs } from "@/lib/design/joints/modular";
import { fingerViews, modularViews } from "@/lib/design/joints/detail";
import { schedule } from "@/lib/design/rebar/schedule";
import type { DetailView } from "@/lib/design/takeoff/types";
import { DesignError, type Check } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// The modular and finger joints' editors: the movement and the joint's inputs on the left; the section and plan, the
// checks, the settings by installation temperature and the take-off on the right, saved as you go.

const EMPTY = schedule([], []);
type Design<I> = { id: string; name: string; projectId: string | null; inputs: I };

/** The superstructure's movement inputs both joints share with the strip seal. */
type Movement = { L: number; skew: number; alpha: number; creepShrink: number; Tmax: number; Tmin: number; gammaTU: number; Ti: number; tableFrom: number; tableTo: number; tableStep: number };
function MovementFields<I extends Movement>({ inputs, set }: { inputs: I; set: <K extends keyof I>(k: K) => (v: I[K]) => void }) {
  const s = set as unknown as <K extends keyof Movement>(k: K) => (v: number) => void;
  return (
    <>
      <Section title="Superstructure" open>
        <Field label="Length from the neutral point" unit="ft" value={inputs.L} onChange={s("L")} />
        <Field label="Skew" unit="deg" value={inputs.skew} onChange={s("skew")} />
        <Field label="Thermal coefficient" unit="×10⁻⁶/°F" value={inputs.alpha} scale={1e6} onChange={s("alpha")} step={0.5} />
        <Field label="Creep and shrinkage strain to come" unit="×10⁻⁶" value={inputs.creepShrink} scale={1e6} onChange={s("creepShrink")} step={10} />
        <Field label="Maximum design temperature (3.12.2)" unit="°F" value={inputs.Tmax} onChange={s("Tmax")} />
        <Field label="Minimum design temperature" unit="°F" value={inputs.Tmin} onChange={s("Tmin")} />
        <Field label="Load factor γTU" value={inputs.gammaTU} onChange={s("gammaTU")} step={0.05} />
      </Section>
      <Section title="Installation" open>
        <Field label="Planned installation temperature" unit="°F" value={inputs.Ti} onChange={s("Ti")} />
        <Field label="Table from" unit="°F" value={inputs.tableFrom} onChange={s("tableFrom")} />
        <Field label="Table to" unit="°F" value={inputs.tableTo} onChange={s("tableTo")} />
        <Field label="Table step" unit="°F" value={inputs.tableStep} onChange={s("tableStep")} />
      </Section>
    </>
  );
}

function Views({ views }: { views: DetailView[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {views.map((v) => (
        <Card key={v.title}>
          <CardContent className="py-3">
            <p className="mb-1 text-xs font-semibold">{v.title}</p>
            <DetailSketch view={v} schedule={EMPTY} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SettingsTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <Card>
      <CardContent className="overflow-x-auto py-3 text-xs">
        <p className="pb-1 font-semibold">Settings by installation temperature</p>
        <table className="w-full">
          <thead>
            <tr className="text-left text-muted-foreground">
              {head.map((h, k) => (
                <th key={h} className={k === 0 ? "font-normal" : k === head.length - 1 ? "pl-3 font-normal" : "text-right font-normal"}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => (
              <tr key={k} className="tabular-nums">
                {r.map((c, j) => (
                  <td key={j} className={j === 0 ? "" : j === r.length - 1 ? "pl-3 text-muted-foreground" : "text-right"}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** The design worked out, or the reason it can't be. */
function attempt<R>(work: () => R) {
  try {
    return { result: work(), error: null as string | null };
  } catch (err) {
    return { result: null, error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
  }
}

function Body({ left, error, checks, banner, children }: { left: ReactNode; error: string | null; checks: Check[] | null; banner: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
      <Card className="self-start">
        <CardContent className="py-2">{left}</CardContent>
      </Card>
      <div className="min-w-0 space-y-4">
        {error ? (
          <DesignErrorCard message={error} />
        ) : (
          checks && (
            <>
              <ChecksBanner checks={checks} extra={banner} />
              {children}
            </>
          )
        )}
      </div>
    </div>
  );
}

const NOTE: Record<string, string> = { ok: "", outside: "outside the design temperatures", "too small": "can't take the movements from here" };

export function ModularJointEditor({ design, projects }: { design: Design<ModularJointInputs>; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof ModularJointInputs>(key: K) => (v: ModularJointInputs[K]) => setInputs((s) => ({ ...s, [key]: v }));
  const o = useMemo(() => attempt(() => ({ r: designModular(inputs), views: modularViews(inputs) })), [inputs]);
  const r = o.result?.r ?? null;
  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label={`Modular Expansion Joint · AASHTO LRFD 14.5.6.9${r ? `, 0–${r.size} in` : ""}`} canMakeCalc={!!r} />
      <Body
        error={o.error}
        checks={r?.checks ?? null}
        banner={r && <span className="ml-auto text-xs">Movement {fmt(r.total, 3)} in + {fmt(r.extra, 2)} in · {r.seals} seals · 0–{r.size} in</span>}
        left={
          <>
            <MovementFields inputs={inputs} set={set} />
            <Section title="Joint (manufacturer's)" open>
              <Field label="Each seal's largest opening" unit="in" value={inputs.gap} onChange={set("gap")} step={0.25} hint="3.0 in at most (AASHTO 14.5.3.2)" />
              <Field label="Added longitudinal range" unit="in" value={inputs.extra} onChange={set("extra")} step={0.25} hint="1.0 to 2.0 in (Table 14.5.6.9.2-1)" />
              <Field label="Centerbeam top width" unit="in" value={inputs.centerbeam} onChange={set("centerbeam")} step={0.25} />
              <Field label="Edgebeam top width" unit="in" value={inputs.edgebeam} onChange={set("edgebeam")} step={0.25} />
              <Field label="Edgebeam thickness" unit="in" value={inputs.edgeT} onChange={set("edgeT")} step={0.125} />
              <Field label="Blockout depth" unit="in" value={inputs.blockoutDepth} onChange={set("blockoutDepth")} />
              <Field label="Blockout beyond the edgebeams" unit="in" value={inputs.blockoutClear} onChange={set("blockoutClear")} />
            </Section>
            <Section title="Site" open>
              <Field label="Deck width, square" unit="ft" value={inputs.width} onChange={set("width")} />
              <Toggle label="A new bridge" value={inputs.newBridge} onChange={set("newBridge")} />
              <Toggle label="At an end of an approach slab" value={inputs.atApproachSlab} onChange={set("atApproachSlab")} />
              <Toggle label="Snow region (snowplows)" value={inputs.snow} onChange={set("snow")} />
            </Section>
          </>
        }
      >
        {o.result && r && (
          <>
            <Views views={o.result.views} />
            <ChecksTable checks={r.checks} groupOf={(id) => (["range", "gap", "fits"].includes(id) ? "Movement and seals" : ["edge-t", "snowplow", "plow-skew"].includes(id) ? "Joint" : "CDOT")} />
            <SettingsTable head={["Temperature", "Opening in", "Each seal in", ""]} rows={r.table.map((row) => [`${row.Ti}°F`, row.status === "too small" ? "—" : fmt(row.A, 3), row.status === "too small" ? "—" : fmt(row.perGap, 3), NOTE[row.status]])} />
            <TakeoffPanel kind="modular-joint" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
            <KeyValues
              title="For the plans and the manufacturer"
              rows={[
                ["Size", `0–${r.size} in, ${r.seals} seals, ${r.centerbeams} centerbeams`],
                ["Longitudinal movement (with the added range)", `${fmt(r.range, 3)} in`],
                ["Transverse, vertical (total)", "1.0 in, 1.0 in"],
                ["Rotations (total)", "1° about the two horizontal axes, 0.5° about the vertical"],
                ["Blockout", `${fmt(r.blockout.width, 2)} in wide × ${fmt(inputs.blockoutDepth, 2)} in deep`],
                ["Joint length", `${fmt(r.length, 2)} ft, one continuous unit`],
              ]}
            />
          </>
        )}
      </Body>
    </div>
  );
}

const CATEGORIES: FatigueCategory[] = ["A", "B", "B'", "C", "C'", "D", "E", "E'"];

export function FingerJointEditor({ design, projects }: { design: Design<FingerJointInputs>; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof FingerJointInputs>(key: K) => (v: FingerJointInputs[K]) => setInputs((s) => ({ ...s, [key]: v }));
  const bolt = <K extends keyof FingerJointInputs["bolt"]>(k: K) => (v: number) => setInputs((s) => ({ ...s, bolt: { ...s.bolt, [k]: v } }));
  const o = useMemo(() => attempt(() => ({ r: designFinger(inputs), views: fingerViews(inputs) })), [inputs]);
  const r = o.result?.r ?? null;
  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Finger Expansion Joint · AASHTO LRFD 14.5.3" canMakeCalc={!!r} />
      <Body
        error={o.error}
        checks={r?.checks ?? null}
        banner={r && <span className="ml-auto text-xs">Movement {fmt(r.total, 3)} in · root to root {fmt(r.design.D, 3)} in at {inputs.Ti}°F</span>}
        left={
          <>
            <MovementFields inputs={inputs} set={set} />
            <Section title="Fingers" open>
              <Button size="sm" variant="outline" className="my-1" onClick={() => setInputs((s) => sizeFinger(s))}>
                Size the fingers
              </Button>
              <Field label="Finger length, root to tip" unit="in" value={inputs.Lf} onChange={set("Lf")} step={0.5} />
              <Field label="Finger width" unit="in" value={inputs.b} onChange={set("b")} step={0.125} />
              <Field label="Gap between fingers" unit="in" value={inputs.g} onChange={set("g")} step={0.125} />
              <Field label="Plate thickness at the root" unit="in" value={inputs.t} onChange={set("t")} step={0.25} />
              <Field label="Support's edge to the root" unit="in" value={inputs.rootOffset} onChange={set("rootOffset")} step={0.5} />
              <Field label="Least tip clearance, hottest" unit="in" value={inputs.tipClear} onChange={set("tipClear")} step={0.25} hint="1.0 in on steel (AASHTO 14.5.3.2)" />
              <Field label="Movement across the bridge, each way" unit="in" value={inputs.transverse} onChange={set("transverse")} step={0.125} />
              <Field label="Steel Fy" unit="ksi" value={inputs.Fy} onChange={set("Fy")} />
              <Choice label="Root's fatigue category" value={inputs.rootCategory} options={CATEGORIES.map((c) => ({ value: c, label: c === "A" ? "A (cut from the plate)" : c }))} onChange={set("rootCategory")} />
            </Section>
            <Section title="Bolts" open>
              <Field label="Diameter" unit="in" value={inputs.bolt.d} onChange={bolt("d")} step={0.125} />
              <Field label="Spacing along the joint" unit="in" value={inputs.bolt.spacing} onChange={bolt("spacing")} />
              <Field label="Behind the support's edge" unit="in" value={inputs.bolt.e} onChange={bolt("e")} step={0.5} />
              <Field label="Tensile strength Fub" unit="ksi" value={inputs.bolt.Fub} onChange={bolt("Fub")} />
            </Section>
            <Section title="Site" open>
              <Field label="Deck width, square" unit="ft" value={inputs.width} onChange={set("width")} />
              <Field label="Fabricated section length" unit="ft" value={inputs.sectionLength} onChange={set("sectionLength")} />
              <Toggle label="A trough under the fingers" value={inputs.trough} onChange={set("trough")} />
              <Toggle label="Replacing an existing finger joint" value={inputs.replacement} onChange={set("replacement")} />
              <Toggle label="Snow region (snowplows)" value={inputs.snow} onChange={set("snow")} />
            </Section>
          </>
        }
      >
        {o.result && r && (
          <>
            <Views views={o.result.views} />
            <ChecksTable checks={r.checks} groupOf={(id) => (/^(range|fits|overlap|tip|finger-gap|side)$/.test(id) ? "Movement and gaps" : /^(finger|plate)-/.test(id) ? "Fingers and plate" : id.startsWith("bolt") ? "Bolts" : "CDOT and details")} />
            <SettingsTable head={["Temperature", "Root to root in", ""]} rows={r.table.map((row) => [`${row.Ti}°F`, row.status === "too small" ? "—" : fmt(row.D, 3), NOTE[row.status]])} />
            <TakeoffPanel kind="finger-joint" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
            <KeyValues
              title="For the plans"
              rows={[
                ["Root to root at installation", `${fmt(r.design.D, 3)} in at ${inputs.Ti}°F`],
                ["Coldest, hottest", `${fmt(r.D.cold, 3)} in, ${fmt(r.D.hot, 3)} in`],
                ["Overlap at the coldest", `${fmt(2 * inputs.Lf - r.D.cold, 3)} in`],
                ["Wheel on one finger (Strength I)", `${fmt(r.strength.load, 2)} kip`],
                ["Joint length", `${fmt(r.length, 2)} ft`],
              ]}
            />
          </>
        )}
      </Body>
    </div>
  );
}
