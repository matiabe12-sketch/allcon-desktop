"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CSP_SECTIONS, designPipe, GAUGE, RCP_CLASSES, type PipeInputs } from "@/lib/design/culverts/pipe";
import { pipeViews } from "@/lib/design/culverts/detail";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// Designing a pipe culvert: the pipe, its fill and installation on the left; the drawings, checks, loads and take-off on
// the right, saved as you go.

const EMPTY = schedule([], []);
const CLASS = { 2: "II", 3: "III", 4: "IV", 5: "V" } as const;

export function PipeCulvertEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: PipeInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof PipeInputs>(k: K) => (v: PipeInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const outcome = useMemo(() => {
    try {
      return { result: designPipe(inputs), views: pipeViews(inputs, inputs.takeoff?.length ?? 60), error: null as string | null };
    } catch (err) {
      return { result: null, views: [], error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const rcp = inputs.material === "rcp";
  const thicknesses = CSP_SECTIONS[inputs.corrugation].map((s) => ({ value: s.t, label: `${s.t} in (${GAUGE[s.t] ?? "-"} ga)` }));

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Pipe Culvert · AASHTO LRFD 12" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Pipe" open>
              <Choice
                label="Material"
                value={inputs.material}
                options={[
                  { value: "rcp", label: "Reinforced concrete pipe (12.10)" },
                  { value: "csp", label: "Corrugated steel pipe (12.7)" },
                ]}
                onChange={set("material")}
              />
              <Field label={rcp ? "Inside diameter" : "Nominal diameter"} unit="in" value={inputs.D} onChange={set("D")} step={6} />
              {rcp ? (
                <>
                  <Choice label="Class (AASHTO M 170)" value={inputs.rcpClass} options={([2, 3, 4, 5] as const).map((c) => ({ value: c, label: `Class ${CLASS[c]} (${RCP_CLASSES[c]} lb/ft/ft)` }))} onChange={set("rcpClass")} />
                  <Field label="Wall (0: Wall B, D/12 + 1 in)" unit="in" value={inputs.wall} onChange={set("wall")} step={0.25} />
                  <Choice
                    label="Standard installation (Table 12.10.2.1-1)"
                    value={inputs.installation}
                    options={[
                      { value: 1, label: "Type 1 (highest compaction)" },
                      { value: 2, label: "Type 2" },
                      { value: 3, label: "Type 3" },
                      { value: 4, label: "Type 4 (no compaction)" },
                    ]}
                    onChange={set("installation")}
                  />
                  <Toggle label="Fluid load, the pipe full (12.10.2.2)" value={inputs.full} onChange={set("full")} />
                </>
              ) : (
                <>
                  <Choice
                    label="Corrugation (Table A12-1)"
                    value={inputs.corrugation}
                    options={[
                      { value: "2-2/3x1/2", label: "2⅔ × ½ in" },
                      { value: "3x1", label: "3 × 1 in" },
                      { value: "5x1", label: "5 × 1 in" },
                    ]}
                    onChange={(v) => setInputs((s) => ({ ...s, corrugation: v, thickness: CSP_SECTIONS[v].some((x) => x.t === s.thickness) ? s.thickness : CSP_SECTIONS[v][1].t }))}
                  />
                  <Choice label="Thickness" value={inputs.thickness} options={thicknesses} onChange={set("thickness")} />
                  <Field label="Steel Fy" unit="ksi" value={inputs.Fy} onChange={set("Fy")} />
                  <Field label="Steel Fu" unit="ksi" value={inputs.Fu} onChange={set("Fu")} />
                </>
              )}
            </Section>
            <Section title="Fill and live load" open>
              <Field label="Least cover over the pipe" unit="ft" value={inputs.minFill} onChange={set("minFill")} step={0.5} />
              <Field label="Most cover" unit="ft" value={inputs.maxFill} onChange={set("maxFill")} step={0.5} />
              <Field label="Fill unit weight" unit="pcf" value={inputs.gamma} onChange={set("gamma")} />
              <Choice
                label="Surface"
                value={inputs.pavement}
                options={[
                  { value: "flexible", label: "Flexible pavement" },
                  { value: "rigid", label: "Rigid pavement" },
                  { value: "none", label: "Unpaved" },
                ]}
                onChange={set("pavement")}
              />
              <Toggle label="HL-93 live load" value={inputs.traffic} onChange={set("traffic")} />
              <Field label="Live load distribution factor (3.6.1.2.6)" value={inputs.lldf} onChange={set("lldf")} step={0.05} hint="1.15 for granular fill, 1.0 otherwise" />
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
                <ChecksTable checks={r.checks} groupOf={(id) => (id.startsWith("dload") || id === "wall" || id === "buckling" ? "Strength" : "Installation")} />
                <TakeoffPanel kind="pipe-culvert" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                {r.rcp && (
                  <KeyValues
                    title="Loads and D-load"
                    rows={[
                      ["Outside diameter Bc; VAF", `${fmt(r.rcp.Bc * 12, 1)} in; ${fmt(r.rcp.Fe, 2)}`],
                      ...r.rcp.cases.map((c) => [`At ${fmt(c.H, 1)} ft: WE, WL; D0.01`, `${fmt(c.WE, 2)}, ${fmt(c.WL, 2)} kip/ft; ${fmt(c.D01, 0)} lb/ft/ft`] as [string, string]),
                      ["Least class that works", r.rcp.needClass ? `Class ${CLASS[r.rcp.needClass as 2 | 3 | 4 | 5]}` : "a special design"],
                    ]}
                  />
                )}
                {r.csp && (
                  <KeyValues
                    title="Thrust and wall"
                    rows={[
                      ...r.csp.cases.map((c) => [`Thrust at ${fmt(c.H, 1)} ft`, `${fmt(c.TL, 2)} kip/ft`] as [string, string]),
                      ["φ·f·A (wall)", `${fmt(r.csp.fWall * r.csp.sec.A, 2)} kip/ft`],
                      ["Buckling fcr", `${fmt(r.csp.fcr, 2)} ksi`],
                      ["Flexibility factor", `${fmt(r.csp.FF, 1)} of ${r.csp.FFlim} in/kip`],
                    ]}
                  />
                )}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
