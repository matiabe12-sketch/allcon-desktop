"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { designHeadwall, M10_RIGID, type HeadwallInputs } from "@/lib/design/culverts/headwall";
import { headwallViews } from "@/lib/design/culverts/headwall-detail";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// Choosing a pipe's headwalls from CDOT's standard plans: the pipe, the count, the skew and the outlet paving on the left;
// the standard's drawings, dimensions, quantities and take-off on the right.

const EMPTY = schedule([], []);
const SIZES = [18, 24, 30, 36, 42, 48, ...M10_RIGID.map((r) => r.Ba)].map((d) => ({ value: d, label: `${d} in.${d <= 48 ? " (M-601-12)" : " (M-601-10)"}` }));

export function HeadwallEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: HeadwallInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof HeadwallInputs>(k: K) => (v: HeadwallInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const outcome = useMemo(() => {
    try {
      return { result: designHeadwall(inputs), views: headwallViews(inputs), error: null as string | null };
    } catch (err) {
      return { result: null, views: [], error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Pipe Headwall · CDOT M-601-10, M-601-12" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Pipe and headwalls" open>
              <Choice label="Pipe inside diameter" value={inputs.D} options={SIZES} onChange={set("D")} />
              <Choice
                label="Pipe"
                value={inputs.rigid ? "rigid" : "flexible"}
                options={[
                  { value: "rigid", label: "Rigid (reinforced concrete)" },
                  { value: "flexible", label: "Flexible (corrugated metal)" },
                ]}
                onChange={(v) => set("rigid")(v === "rigid")}
              />
              <Choice
                label="Pipes"
                value={inputs.pipes}
                options={[
                  { value: 1, label: "Single" },
                  { value: 2, label: "Double" },
                ]}
                onChange={set("pipes")}
              />
              <Field label="Headwalls (inlet and outlet: 2)" value={inputs.count} onChange={(v) => set("count")(Math.max(1, Math.round(v)))} />
              <Field label="Skew, headwall to the pipe (90: square)" unit="deg" value={inputs.skew} onChange={set("skew")} step={5} />
              {inputs.D > 48 ? (
                <Toggle label="Apron (M-601-10)" value={inputs.apron} onChange={set("apron")} />
              ) : (
                <Choice
                  label="Pipe outlet paving (M-601-12)"
                  value={inputs.paving}
                  options={[
                    { value: "none", label: "None" },
                    { value: "riprap", label: "18 in. riprap" },
                    { value: "concrete", label: "Concrete slope and ditch paving" },
                  ]}
                  onChange={set("paving")}
                />
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
                <ChecksTable checks={r.checks} groupOf={() => "The standard"} />
                <TakeoffPanel kind="pipe-headwall" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <KeyValues
                  title={`From CDOT ${r.standard}`}
                  rows={[
                    ["Concrete, each headwall", `${fmt(r.cy, 2)} CY`],
                    ["Steel, each headwall", r.lb > 0 ? `${fmt(r.lb, 0)} lb` : `about ${fmt(r.lbEstimate, 0)} lb, paid with the concrete`],
                    ["Skew factor", fmt(r.skewF, 3)],
                    ["Outlet paving", r.pave > 0 ? `${fmt(r.pave, 1)} CY` : "none"],
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
