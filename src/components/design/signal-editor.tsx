"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { designSignal, standardCaisson, type SignalInputs } from "@/lib/design/signals/foundation";
import { signalViews } from "@/lib/design/signals/detail";
import { cdotArmLoading, SIGNAL_STANDARDS, signalStandard, type Attachment } from "@/lib/design/signals/standards";
import { schedule } from "@/lib/design/rebar/schedule";
import { DesignError } from "@/lib/design/walls/cip";
import { ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { DetailSketch } from "./detail-sketch";
import { TakeoffPanel } from "./takeoff-panel";

// The caisson under a standard traffic signal support: pick CDOT's pole and arms, the site's soil and the caisson on
// the left; the schematic, checks, loads and take-off on the right, saved as you go.

const EMPTY = schedule([], []);
const sizes = [6, 7, 8, 9, 10, 11].map((b) => ({ value: b, label: `#${b}` }));
const standards = SIGNAL_STANDARDS.map((s) => ({ value: s.id, label: s.label }));

export function SignalEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: SignalInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof SignalInputs>(k: K) => (v: SignalInputs[K]) => setInputs((s) => ({ ...s, [k]: v }));
  const std = signalStandard(inputs.standard);
  // Choosing a standard brings its caisson with it (the cohesive depth in clay).
  const pick = (id: string) => setInputs((s) => ({ ...s, standard: id, arms: signalStandard(id).arms === 2 ? s.arms : 1, attachments: null, ...standardCaisson(signalStandard(id), s.soil) }));
  const useStandardCaisson = () => setInputs((s) => ({ ...s, ...standardCaisson(signalStandard(s.standard), s.soil) }));
  const items: Attachment[] = inputs.attachments ?? (std.kind === "mast-arm" ? cdotArmLoading(std.L, std.heads) : []);
  const setItem = (n: number, patch: Partial<Attachment>) => setInputs((s) => ({ ...s, attachments: items.map((x, k) => (k === n ? { ...x, ...patch } : x)) }));
  const outcome = useMemo(() => {
    try {
      return { result: designSignal(inputs), views: signalViews(inputs), error: null as string | null };
    } catch (err) {
      return { result: null, views: [], error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const groupOf = (id: string) => (id === "embedment" || id === "soil-torsion" ? "The soil (LTS 13.6.1)" : id.startsWith("cdot-") ? "On the standard's basis (advisory)" : "The caisson (AASHTO 5)");
  const stdC = standardCaisson(std, inputs.soil);
  const isStd = stdC.shaftD === inputs.shaftD && stdC.shaftLength === inputs.shaftLength && stdC.bars === inputs.bars && stdC.bar === inputs.bar;

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label="Traffic Signal Foundation · CDOT S-614 · AASHTO LRFD-LTS" canMakeCalc={!!r} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="The standard support" open>
              <Choice label="CDOT standard" value={inputs.standard} options={standards} onChange={pick} />
              {std.kind === "mast-arm" && (
                <>
                  <p className="py-1 text-[11px] text-muted-foreground">
                    Designed for {std.L} ft arms (used for {std.covers}); pole {fmt(std.poleBase!.trunk, 2)} in at the base, {std.heads} signal heads per arm.
                  </p>
                  {std.arms === 2 && <Choice label="Arms installed" value={inputs.arms} options={[{ value: 1, label: "One" }, { value: 2, label: "Two (both loaded alike)" }]} onChange={set("arms")} />}
                  {std.arms === 2 && inputs.arms === 2 && <Field label="Angle between the arms (60° to 120°)" unit="deg" value={inputs.secondAngle} onChange={(v) => set("secondAngle")(Math.min(120, Math.max(60, v)))} step={5} />}
                  <Field label="Base plate to the arm" unit="ft" value={inputs.armHeight} onChange={set("armHeight")} step={0.5} />
                  <Toggle label="Luminaire arm on the pole's top" value={inputs.luminaire} onChange={set("luminaire")} />
                  {inputs.luminaire && <Choice label="Luminaire arm" value={inputs.luminaireArm} options={[{ value: 10, label: "10 ft" }, { value: 15, label: "15 ft" }]} onChange={set("luminaireArm")} />}
                  <Toggle label="Camera" value={inputs.camera} onChange={set("camera")} />
                  <Toggle label="Signal head on the pole" value={inputs.poleSignal} onChange={set("poleSignal")} />
                </>
              )}
              {std.kind === "pedestal" && <p className="py-1 text-[11px] text-muted-foreground">The sheet gives the pole&apos;s service moment ({fmt(std.service!.M, 2)} kip·ft) and shear ({fmt(std.service!.V, 2)} kip) at 90 mph; they&apos;re scaled to the wind below.</p>}
            </Section>
            {std.kind === "mast-arm" && (
              <Section title="On each arm">
                <p className="py-1 text-[11px] text-muted-foreground">{inputs.attachments ? "As entered." : "CDOT's worst-case loading (sheet 2): heads every 10 ft from the tip, signs between them."} Positions from the pole.</p>
                {items.map((a, n) => (
                  <div key={n} className="border-b py-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      {a.name}
                      <button type="button" aria-label={`Remove ${a.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => setInputs((x) => ({ ...x, attachments: items.filter((_, k) => k !== n) }))}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <Field label="From the pole" unit="ft" value={a.at} onChange={(v) => setItem(n, { at: v })} step={0.5} />
                    <Field label="Weight" unit="lb" value={a.weight} onChange={(v) => setItem(n, { weight: v })} />
                    <Field label="Projected area" unit="ft²" value={a.area} onChange={(v) => setItem(n, { area: v })} step={0.5} />
                  </div>
                ))}
                <div className="flex gap-2 py-1">
                  <Button size="sm" variant="outline" onClick={() => setInputs((x) => ({ ...x, attachments: [...items, { name: "Signal head", at: Math.max(2, std.L - 10 * std.heads), weight: 46, area: 8.67, Cd: 1.2, plate: false }] }))}>
                    <Plus className="size-3.5" /> Head
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setInputs((x) => ({ ...x, attachments: [...items, { name: "Sign", at: std.L / 2, weight: 28, area: 7, Cd: 1.2, plate: true }] }))}>
                    <Plus className="size-3.5" /> Sign
                  </Button>
                  {inputs.attachments && (
                    <Button size="sm" variant="ghost" onClick={() => set("attachments")(null)}>
                      <RotateCcw className="size-3.5" /> CDOT&apos;s
                    </Button>
                  )}
                </div>
              </Section>
            )}
            <Section title="Wind (LTS 3.8)" open>
              <Field label="Basic wind speed (for the MRI)" unit="mph" value={inputs.V} onChange={set("V")} hint="700-yr MRI for a typical signal (Table 3.8.2-1)" />
              <Field label="Directionality Kd" value={inputs.Kd} onChange={set("Kd")} step={0.05} hint="Traffic signal structures: 0.85" />
              <Field label="Gust effect G" value={inputs.G} onChange={set("G")} step={0.01} />
              <Field label="Velocity conversion Cv" value={inputs.Cv} onChange={set("Cv")} step={0.05} />
            </Section>
            <Section title="The soil" open>
              <Choice label="Soil" value={inputs.soil} options={[{ value: "cohesive", label: "Cohesive (clay)" }, { value: "cohesionless", label: "Cohesionless (sand, gravel)" }]} onChange={(v) => setInputs((s) => ({ ...s, soil: v, ...(isStd ? { shaftLength: standardCaisson(std, v).shaftLength } : {}) }))} />
              {inputs.soil === "cohesive" ? (
                <Field label="Undrained shear strength c" unit="psf" value={inputs.c} onChange={set("c")} step={50} hint="CDOT's standards: 750 psf (medium stiff)" />
              ) : (
                <>
                  <Field label="Friction angle φ" unit="deg" value={inputs.phi} onChange={set("phi")} hint="CDOT's standards: 30° (medium dense)" />
                  <Field label="SPT N60 at the tip" unit="blows/ft" value={inputs.N60} onChange={set("N60")} />
                </>
              )}
              <Field label="Effective unit weight" unit="pcf" value={inputs.gamma} onChange={set("gamma")} hint="CDOT's standards: 110 pcf" />
              <Field label="φ, lateral (Broms, extreme event)" value={inputs.phiLateral} onChange={set("phiLateral")} step={0.05} />
              <Field label="φ, torsion (side resistance)" value={inputs.phiTorsion} onChange={set("phiTorsion")} step={0.05} />
              <Choice
                label="Torsion: side resistance"
                value={inputs.torsionMethod}
                options={[
                  { value: "cdot", label: inputs.soil === "cohesive" ? "As CDOT's standards (full cohesion)" : "As CDOT's standards (O'Neill–Reese β)" },
                  { value: "aashto", label: inputs.soil === "cohesive" ? "AASHTO's current (α = 0.55)" : "AASHTO's current (β, normally consolidated)" },
                ]}
                onChange={set("torsionMethod")}
              />
              <Toggle label="Also check on the standard's own basis" value={inputs.cdotBasis} onChange={set("cdotBasis")} />
            </Section>
            <Section title="The caisson" open>
              <p className="py-1 text-[11px] text-muted-foreground">
                {isStd ? `The standard's: ${stdC.shaftD} in, ${fmt(stdC.shaftLength, 2)} ft, ${stdC.bars} #${stdC.bar}.` : `The standard's is ${stdC.shaftD} in, ${fmt(stdC.shaftLength, 2)} ft, ${stdC.bars} #${stdC.bar}.`}
                {!isStd && (
                  <button type="button" className="ml-1 underline" onClick={useStandardCaisson}>
                    Use it
                  </button>
                )}
              </p>
              <Field label="Diameter" unit="in" value={inputs.shaftD} onChange={set("shaftD")} step={6} />
              <Field label="Embedded length" unit="ft" value={inputs.shaftLength} onChange={set("shaftLength")} step={0.5} />
              <Field label="Vertical bars" value={inputs.bars} onChange={(v) => set("bars")(Math.max(6, Math.round(v)))} />
              <Choice label="Bar size" value={inputs.bar} options={sizes} onChange={set("bar")} />
              <Choice label="Spiral" value={inputs.spiral} options={[3, 4, 5].map((b) => ({ value: b, label: `#${b}` }))} onChange={set("spiral")} />
              <Field label="Spiral pitch" unit="in" value={inputs.pitch} onChange={set("pitch")} />
              <Field label="Clear cover" unit="in" value={inputs.cover} onChange={set("cover")} step={0.5} />
              <Field label="Concrete f′c" unit="ksi" value={inputs.fc} onChange={set("fc")} step={0.5} hint="Class BZ" />
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
                <TakeoffPanel kind="signal-foundation" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <div className="grid gap-4 xl:grid-cols-2">
                  <KeyValues
                    title="At the top of the caisson (Extreme I)"
                    rows={[
                      ["Dead load", `${fmt(r.loads.W, 2)} kip`],
                      ["Largest moment", `${fmt(r.extreme.M, 1)} kip·ft (wind from ${r.extreme.deg}°)`],
                      ["Largest shear", `${fmt(r.Vu, 2)} kip`],
                      ...(std.kind === "mast-arm" ? ([["Largest torsion", `${fmt(r.Tu, 1)} kip·ft`]] as [string, string][]) : []),
                    ]}
                  />
                  <KeyValues
                    title="Broms (LTS 13.6.1.1)"
                    rows={[
                      ["Embedment needed", `${fmt(r.broms.L, 2)} ft of ${fmt(inputs.shaftLength, 2)} ft`],
                      ["Largest moment in the caisson", `${fmt(r.broms.Mu, 1)} kip·ft`],
                      ...(std.kind === "mast-arm" ? ([["Soil's torsional resistance φTn", `${fmt(inputs.phiTorsion * r.torsionSoil.Tn, 1)} kip·ft`]] as [string, string][]) : []),
                      ...(r.cdot ? ([[`On the standard's basis (${r.cdot.V} mph, F.S. ${r.cdot.sf.flexure})`, `${fmt(r.cdot.L, 2)} ft needed`]] as [string, string][]) : []),
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
