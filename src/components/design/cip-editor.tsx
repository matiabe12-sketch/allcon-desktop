"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { COMBOS, DesignError, designCipWall, type CipInputs, type Combo, type Factors } from "@/lib/design/walls/cip";
import { designCipAsd, type CipAsdResult } from "@/lib/design/walls/cip-asd";
import { designCipAsdU, type CipAsdUResult } from "@/lib/design/walls/cip-asd-u";
import { BarsField, ChecksBanner, ChecksTable, Choice, DesignErrorCard, DesignHeader, Field, fmt, KeyValues, Section, Toggle } from "./design-kit";
import { TakeoffPanel } from "./takeoff-panel";
import { CipSketch, UStairSketch } from "./wall-sketch";

// Designing a CIP cantilever wall: the inputs on the left, worked out as they change (sketch,
// checks, and the working) on the right, saved as you go. "Create calc" writes the calc package
// as a Calcs worksheet.

export function CipEditor({ design, projects }: { design: { id: string; name: string; projectId: string | null; inputs: CipInputs }; projects: { id: string; name: string }[] }) {
  const [inputs, setInputs] = useState(design.inputs);
  const set = <K extends keyof CipInputs>(key: K) => (v: CipInputs[K]) => setInputs((s) => ({ ...s, [key]: v }));
  const setFactor = (combo: Combo, key: keyof Factors, v: number) => setInputs((s) => ({ ...s, factors: { ...s.factors, [combo]: { ...s.factors[combo], [key]: v } } }));

  const outcome = useMemo(() => {
    try {
      return { result: designCipWall(inputs), error: null };
    } catch (err) {
      return { result: null, error: err instanceof DesignError ? err.message : "These inputs can't be worked out" };
    }
  }, [inputs]);
  const r = outcome.result;
  const uMode = inputs.asd && inputs.asdLayout === "u";
  const asd = useMemo(() => (r && inputs.asd && inputs.asdLayout !== "u" ? designCipAsd(inputs, r) : null), [r, inputs]);
  const asdU = useMemo(() => (r && inputs.asd && inputs.asdLayout === "u" ? designCipAsdU(inputs, r) : null), [r, inputs]);
  const uGroupOf = (id: string) => (/^asd-(ot|ecc|brg|sl)/.test(id) ? "Stability (service loads)" : /^asd-(stem|hook|u-prop)/.test(id) ? "Stems, ACI 318-19 strength design" : "Base slab, ACI 318-19 strength design");
  const groupOf = (id: string) => (/^(ecc|brg|slide)/.test(id) ? "Stability" : id.startsWith("stem") ? "Stem" : id.startsWith("heel") ? "Heel" : id.startsWith("toe") ? "Toe" : "Shear key");
  const asdGroupOf = (id: string) => (/^asd-(ot|ecc|brg)/.test(id) ? "Overturning, eccentricity and bearing (service loads)" : /^asd-(sl|st-|unbal|short|pb)/.test(id) ? (inputs.strut ? "Sliding and the slab strut" : "Sliding") : "Members, ACI 318-19 strength design");

  return (
    <div className="space-y-4">
      <DesignHeader design={design} projects={projects} inputs={inputs} label={`CIP Cantilever Wall · AASHTO LRFD${inputs.asd ? (uMode ? " · IRC/IBC ASD, U-shaped stairwell" : " · IRC/IBC ASD") : ""}`} canMakeCalc={!!r} extraCalc={inputs.asd ? { variant: "asd", label: "Create ASD calc package" } : undefined} />

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_1fr]">
        {/* Inputs */}
        <Card className="self-start">
          <CardContent className="py-2">
            <Section title="Geometry" open>
              <Field label="Exposed height He" unit="ft" value={inputs.He} onChange={set("He")} step={0.25} />
              <Field label="Footing cover Df (to footing bottom)" unit="ft" value={inputs.Df} onChange={set("Df")} step={0.25} />
              <Field label="Footing thickness D" unit="in" value={inputs.D} onChange={set("D")} />
              <Field label="Footing width B" unit="in" value={inputs.B} onChange={set("B")} />
              <Field label="Toe A" unit="in" value={inputs.A} onChange={set("A")} />
              <Field label="Stem thickness at top" unit="in" value={inputs.Tt} onChange={set("Tt")} />
              <Field label="Front batter" unit="in/ft" value={inputs.frontBatter} onChange={set("frontBatter")} step={0.125} />
              <Field label="Back batter" unit="in/ft" value={inputs.backBatter} onChange={set("backBatter")} step={0.125} />
              <Field label="Backslope (H:1V, 0 = level)" unit="H:1V" value={inputs.backslope} onChange={set("backslope")} step={0.5} />
              <Toggle label="Shear key" value={inputs.shearKey} onChange={set("shearKey")} />
              {inputs.shearKey && (
                <>
                  <Field label="Key depth below footing" unit="in" value={inputs.keyDepth} onChange={set("keyDepth")} />
                  <Field label="Key width" unit="in" value={inputs.keyWidth} onChange={set("keyWidth")} />
                  <Toggle label="Key centerline at B/3 from the heel" value={inputs.keyFromHeel === null} onChange={(third) => set("keyFromHeel")(third ? null : Math.round(inputs.B / 3))} />
                  {inputs.keyFromHeel !== null && <Field label="Heel to key centerline" unit="in" value={inputs.keyFromHeel} onChange={set("keyFromHeel")} />}
                  <Field label="Fill over toe neglected (may be removed)" unit="ft" value={inputs.toeFillIgnored} onChange={set("toeFillIgnored")} step={0.25} />
                </>
              )}
            </Section>
            <Section title="Backfill and subgrade" open>
              <Field label="Backfill unit weight γs" unit="pcf" value={inputs.gammaS} scale={1000} onChange={set("gammaS")} />
              <Field label="Backfill friction angle φ" unit="deg" value={inputs.phi} onChange={set("phi")} />
              <Toggle label="Wall–backfill friction δ = 2/3 φ" value={inputs.delta === null} onChange={(auto) => set("delta")(auto ? null : (2 * inputs.phi) / 3)} />
              {inputs.delta !== null && <Field label="Wall–backfill friction δ" unit="deg" value={inputs.delta} onChange={set("delta")} />}
              <Toggle label="Kp from AASHTO Fig. 3.11.5.4-1 (else Coulomb)" value={inputs.kpOverride !== null} onChange={(fig) => set("kpOverride")(fig ? 9 : null)} />
              {inputs.kpOverride !== null && <Field label="Passive coefficient Kp" value={inputs.kpOverride} onChange={set("kpOverride")} step={0.1} />}
              <Field label="Minimum active EFW, if required (0 = none)" unit="pcf" value={inputs.efwMin} scale={1000} onChange={set("efwMin")} />
              <Field label="Nominal bearing resistance qn" unit="ksf" value={inputs.qn} onChange={set("qn")} step={0.1} />
              <Field label="Subgrade friction angle φsub" unit="deg" value={inputs.phiSub} onChange={set("phiSub")} />
            </Section>
            <Section title="Live load and pavement">
              <Toggle label="Live load surcharge" value={inputs.liveLoad} onChange={set("liveLoad")} />
              {inputs.liveLoad && <Field label="Wall back face to edge of traffic" unit="ft" value={inputs.trafficDistance} onChange={set("trafficDistance")} />}
              <Field label="Pavement thickness" unit="in" value={inputs.pavementThickness} onChange={set("pavementThickness")} />
              <Field label="Pavement unit weight" unit="pcf" value={inputs.gammaPavement} scale={1000} onChange={set("gammaPavement")} />
            </Section>
            <Section title="Barrier and vehicle collision">
              <Field label="Barrier weight (0 = none)" unit="plf" value={inputs.railWeight} scale={1000} onChange={set("railWeight")} />
              {inputs.railWeight > 0 && <Field label="Barrier c.g. from stem front face" unit="in" value={inputs.railCg} onChange={set("railCg")} step={0.25} />}
              <Toggle label="Vehicle collision (Extreme Event II)" value={inputs.collision} onChange={set("collision")} />
              {inputs.collision && (
                <>
                  <Field label="Transverse force Ft (Table A13.2-1)" unit="kip" value={inputs.ctForce} onChange={set("ctForce")} />
                  <Field label="Length Lt (Table A13.2-1)" unit="ft" value={inputs.ctLength} onChange={set("ctLength")} step={0.5} />
                  <Field label="Top of wall to point of impact" unit="ft" value={inputs.ctHeight} onChange={set("ctHeight")} step={0.25} />
                  <Toggle label="Near the wall's end (spread one way)" value={inputs.ctAtEnd} onChange={set("ctAtEnd")} />
                </>
              )}
            </Section>
            <Section title="Concrete and steel">
              <Field label="f'c" unit="ksi" value={inputs.fc} onChange={set("fc")} step={0.5} />
              <Field label="Concrete unit weight γc" unit="pcf" value={inputs.gammaC} scale={1000} onChange={set("gammaC")} />
              <Field label="fy" unit="ksi" value={inputs.fy} onChange={set("fy")} />
              <Field label="Es" unit="ksi" value={inputs.Es} onChange={set("Es")} step={100} />
            </Section>
            <Section title="Reinforcement">
              <BarsField label="Stem, back face (vertical)" value={inputs.stemBars} onChange={set("stemBars")} />
              <BarsField label="Stem, shrinkage & temp." value={inputs.stemTemp} onChange={set("stemTemp")} />
              <BarsField label="Heel, top" value={inputs.heelBars} onChange={set("heelBars")} />
              <BarsField label="Heel, shrinkage & temp." value={inputs.heelTemp} onChange={set("heelTemp")} />
              <BarsField label="Toe, bottom" value={inputs.toeBars} onChange={set("toeBars")} />
              <BarsField label="Toe, shrinkage & temp." value={inputs.toeTemp} onChange={set("toeTemp")} />
              {inputs.shearKey && <BarsField label="Shear key U bars" value={inputs.keyBars} onChange={set("keyBars")} />}
              {inputs.shearKey && <BarsField label="Shear key, shrinkage & temp." value={inputs.keyTemp} onChange={set("keyTemp")} />}
              <Field label="Cover, stem" unit="in" value={inputs.coverStem} onChange={set("coverStem")} step={0.25} />
              <Field label="Cover, heel" unit="in" value={inputs.coverHeel} onChange={set("coverHeel")} step={0.25} />
              <Field label="Cover, toe (cast against soil)" unit="in" value={inputs.coverToe} onChange={set("coverToe")} step={0.25} />
              <Field label="Cover, shear key" unit="in" value={inputs.coverKey} onChange={set("coverKey")} step={0.25} />
              <Field label="Exposure class, stem (1 or 2)" value={inputs.exposureStem} onChange={(v) => set("exposureStem")(v >= 1.5 ? 2 : 1)} />
              <Field label="Exposure class, footing (1 or 2)" value={inputs.exposureFooting} onChange={(v) => set("exposureFooting")(v >= 1.5 ? 2 : 1)} />
            </Section>
            <Section title="Resistance factors">
              <Field label="Bearing φb" value={inputs.phiB} onChange={set("phiB")} step={0.05} />
              <Field label="Sliding, concrete on soil φτ" value={inputs.phiT} onChange={set("phiT")} step={0.05} />
              <Field label="Sliding, soil on soil φτ" value={inputs.phiTss} onChange={set("phiTss")} step={0.05} />
              <Field label="Passive pressure φep" value={inputs.phiEp} onChange={set("phiEp")} step={0.05} />
              <Field label="Extreme event φ" value={inputs.phiEE} onChange={set("phiEE")} step={0.05} />
              <Field label="Flexure φf" value={inputs.phiF} onChange={set("phiF")} step={0.05} />
              <Field label="Shear φv" value={inputs.phiV} onChange={set("phiV")} step={0.05} />
            </Section>
            <Section title="IRC/IBC ASD check (separate from AASHTO)" open={inputs.asd}>
              <Toggle label="Check by IRC/IBC allowable stress (ACI 318 members)" value={inputs.asd} onChange={set("asd")} />
              {inputs.asd && (
                <>
                  <p className="py-1 text-[11px] text-muted-foreground">Uses the wall, soil and dead and earth loads above at service level. The AASHTO traffic surcharge, collision and resistance factors don&apos;t apply.</p>
                  <Field label="Allowable bearing qa" unit="ksf" value={inputs.asdQa} onChange={set("asdQa")} step={0.1} hint="IRC Table R401.4.1, IBC Table 1806.2, or the geotechnical report" />
                  <Field label="FS against overturning" value={inputs.asdFsOverturning} onChange={set("asdFsOverturning")} step={0.1} hint="IRC R404.4 and IBC 1807.2.3: 1.5" />
                  <Field label="FS against sliding" value={inputs.asdFsSliding} onChange={set("asdFsSliding")} step={0.1} hint="IRC R404.4 and IBC 1807.2.3: 1.5" />
                  <Choice label="Eccentricity limit" value={inputs.asdEccLimit} options={[{ value: 6, label: "B/6 (whole base in contact)" }, { value: 3, label: "B/3" }]} onChange={set("asdEccLimit")} />
                  <Toggle label="Base friction μ = tan φsub" value={inputs.asdMu === null} onChange={(auto) => set("asdMu")(auto ? null : 0.35)} />
                  {inputs.asdMu !== null && <Field label="Base friction coefficient μ" value={inputs.asdMu} onChange={set("asdMu")} step={0.05} hint="IBC Table 1806.2 lateral sliding coefficient, or the geotechnical report" />}
                  <Field label="Surcharge for Case 2 (0 = Case 1 only)" unit="psf" value={inputs.asdSurcharge} scale={1000} onChange={set("asdSurcharge")} step={10} />
                  <Field label="Member load factor, dead γD" value={inputs.asdGammaD} onChange={set("asdGammaD")} step={0.1} hint="ACI 318-19 Table 5.3.1: 1.2 (0.9 is also checked for the toe)" />
                  <Field label="Member load factor, earth γH" value={inputs.asdGammaH} onChange={set("asdGammaH")} step={0.1} hint="ACI 318-19 Table 5.3.1: 1.6" />
                  <Choice label="Layout" value={inputs.asdLayout} options={[{ value: "single", label: "Single wall on its own footing" }, { value: "u", label: "U-shaped stairwell (shared base slab)" }]} onChange={set("asdLayout")} />
                  {uMode && (
                    <>
                      <p className="py-1 text-[11px] text-muted-foreground">Two stems (He, Df, stem thickness and the bars above) on one continuous base slab of thickness D, soil on both outer faces. Footing width B and toe A don&apos;t apply. Base slab bottom bars are the toe bars, top bars the heel bars.</p>
                      <Field label="Clear between the stems" unit="ft" value={inputs.uClear} onChange={set("uClear")} step={0.25} />
                      <Field label="Base slab beyond each stem" unit="in" value={inputs.uOuter} onChange={set("uOuter")} />
                      <Field label="Stairs and landing on the base" unit="kip/ft" value={inputs.uStairs} onChange={set("uStairs")} step={0.1} hint="Per foot along the stairwell: adds to the bearing pressure and offsets the base slab's upward load" />
                      <Toggle label="Landing or stair slab doweled to both stems (props them)" value={inputs.uProp} onChange={set("uProp")} />
                      {inputs.uProp && (
                        <>
                          <Field label="Slab thickness" unit="in" value={inputs.strutThickness} onChange={set("strutThickness")} step={0.5} />
                          <Field label="Slab f'c" unit="ksi" value={inputs.strutFc} onChange={set("strutFc")} step={0.5} />
                          <Toggle label="Prop at the landing (Df − D − t/2 above the base)" value={inputs.uPropHeight === null} onChange={(auto) => set("uPropHeight")(auto ? null : Math.max(0.5, +(inputs.Df - inputs.D / 12 - inputs.strutThickness / 24).toFixed(2)))} />
                          {inputs.uPropHeight !== null && <Field label="Prop height above the base slab's top" unit="ft" value={inputs.uPropHeight} onChange={set("uPropHeight")} step={0.25} hint="For a section through the stairs: the stair slab's mid-depth there" />}
                          <BarsField label="Stem, inside face (vertical)" value={inputs.uInnerBars} onChange={set("uInnerBars")} />
                        </>
                      )}
                    </>
                  )}
                  {!uMode && <Toggle label="Slab strut (slab cast tight against the stem)" value={inputs.strut} onChange={set("strut")} />}
                  {!uMode && inputs.strut && (
                    <>
                      <Field label="Slab thickness" unit="in" value={inputs.strutThickness} onChange={set("strutThickness")} step={0.5} />
                      <Field label="Slab f'c" unit="ksi" value={inputs.strutFc} onChange={set("strutFc")} step={0.5} />
                      <Field label="Clear span between the stems" unit="ft" value={inputs.strutSpan} onChange={set("strutSpan")} step={0.5} />
                      <Toggle label="Identical wall opposite (thrusts balance)" value={inputs.strutOpposite} onChange={set("strutOpposite")} />
                      <Field label="Allowable base movement" unit="in" value={inputs.strutMoveLimit} onChange={set("strutMoveLimit")} step={0.05} />
                      <Toggle label="Slab also props the wall against overturning" value={inputs.strutProp} onChange={set("strutProp")} />
                      {inputs.strutProp && (
                        <>
                          <p className="py-1 text-[11px] text-muted-foreground">The prop force is found by compatibility: the wall rocks and slides on soil springs, and the slab, at its mid-depth above the footing&apos;s bottom (cover Df − t/2), barely shortens. It depends mostly on kh/kv, so both bounds are checked.</p>
                          <Toggle label="Slab cast before the backfill" value={inputs.strutBeforeBackfill} onChange={set("strutBeforeBackfill")} />
                          <Field label="Subgrade modulus kv" unit="pci" value={inputs.strutKv} onChange={set("strutKv")} step={10} hint="Under the footing; it matters little on its own" />
                          <Field label="kh/kv, lower bound" value={inputs.strutKhLo} onChange={set("strutKhLo")} step={0.025} hint="Elastic theory for a strip footing gives about 0.17" />
                          <Field label="kh/kv, upper bound" value={inputs.strutKhHi} onChange={set("strutKhHi")} step={0.1} />
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </Section>
            <Section title="Load factors">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-normal">Group</th>
                    {(["dc", "ev", "lsv", "lsh", "eh", "ct"] as const).map((k) => (
                      <th key={k} className="font-normal">
                        γ{k.toUpperCase().replace("LSV", "LS,V").replace("LSH", "LS,H")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMBOS.filter((c) => inputs.collision || !c.id.startsWith("Ext")).map((c) => (
                    <tr key={c.id} title={c.use}>
                      <td className="pr-1 whitespace-nowrap">{c.name}</td>
                      {(["dc", "ev", "lsv", "lsh", "eh", "ct"] as const).map((k) => (
                        <td key={k}>
                          <input type="number" step={0.05} value={inputs.factors[c.id][k]} onChange={(e) => e.target.value !== "" && setFactor(c.id, k, Number(e.target.value))} className="h-6 w-full min-w-0 rounded border border-input bg-transparent px-0 text-right text-[10px] tabular-nums" aria-label={`${c.name} ${k}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="min-w-0 space-y-4">
          {outcome.error ? (
            <DesignErrorCard message={outcome.error} />
          ) : (
            r && (
              <>
                <ChecksBanner checks={r.checks} extra={r.stability.keyNeeded && <span className="ml-auto text-xs">Sliding needs {inputs.shearKey ? "the" : "a"} shear key</span>} />
                <Card>
                  <CardContent className="py-3">
                    <CipSketch inputs={inputs} result={r} />
                  </CardContent>
                </Card>
                <ChecksTable checks={r.checks} groupOf={groupOf} />
                <TakeoffPanel kind="cip-cantilever-wall" design={design} inputs={inputs} ok={r.checks.every((c) => c.advisory || c.ok)} onSettings={(t) => setInputs((s) => ({ ...s, takeoff: t }))} />
                <Working r={r} collision={inputs.collision} />
                {asd && (
                  <>
                    <h2 className="pt-2 text-sm font-semibold">IRC/IBC allowable stress check</h2>
                    <ChecksBanner checks={asd.checks} />
                    <ChecksTable checks={asd.checks} groupOf={asdGroupOf} />
                    <AsdWorking a={asd} strutOn={inputs.strut} />
                  </>
                )}
                {asdU && (
                  <>
                    <h2 className="pt-2 text-sm font-semibold">IRC/IBC allowable stress check · U-shaped stairwell</h2>
                    <ChecksBanner checks={asdU.checks} />
                    <Card>
                      <CardContent className="py-3">
                        <UStairSketch inputs={inputs} result={asdU} />
                      </CardContent>
                    </Card>
                    <ChecksTable checks={asdU.checks} groupOf={uGroupOf} />
                    <AsdUWorking a={asdU} />
                  </>
                )}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/** The U-shaped stairwell's working: the service cases, the stems with the prop, the base slab. */
function AsdUWorking({ a }: { a: CipAsdUResult }) {
  const st = a.stem;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <KeyValues
        title="Service load cases"
        rows={a.cases.map((c): [string, string] => [c.name, `ΣV ${fmt(c.V)} kip/ft · q ${fmt(c.qmax)} ksf${c.id === 3 ? ` · e ${fmt(c.e)} ft · FS ot ${fmt(c.FSot)} · FS sl ${fmt(c.FSsl)}` : ""}`])}
      />
      <KeyValues
        title="Stems (factored)"
        rows={[
          ...(st.prop
            ? ([
                ["Prop above the base slab", `${fmt(st.a!)} ft`],
                ["Prop force Ru / bearing strength", `${fmt(st.prop.R)} / ${fmt(a.prop!.capacity)} kip/ft`],
                ["M at the base / at the prop", `${fmt(st.prop.Mb)} / ${fmt(st.prop.Mp)} kip·ft/ft`],
                ["Inside-face M / φMn", `${fmt(st.Min)} / ${fmt(st.inner.phiMn)} kip·ft/ft`],
              ] as [string, string][])
            : ([["Prop", "none (cantilever)"]] as [string, string][])),
          ["Soil-face Mu / φMn", `${fmt(st.Mout)} / ${fmt(st.flex.phiMn)} kip·ft/ft`],
          ["Vu / φVc", `${fmt(st.Vu)} / ${fmt(st.shear.phiVc)} kip/ft`],
          ["Hook ldh / room", `${fmt(st.ldh)} / ${fmt(st.hookRoom)} in`],
        ]}
      />
      <KeyValues
        title="Base slab (factored)"
        rows={[
          ["Width", `${fmt(a.geometry.Bu)} ft`],
          ["Corner moment from the stem", `${fmt(st.Mc)} kip·ft/ft`],
          ["Bottom Mu / φMn", `${fmt(a.base.Mbot)} / ${fmt(a.base.bot.phiMn)} kip·ft/ft`],
          ["Top Mu / φMn", `${fmt(a.base.Mtop)} / ${fmt(a.base.top.phiMn)} kip·ft/ft`],
          ["Vu / φVc", `${fmt(a.base.V)} / ${fmt(a.base.shear.phiVc)} kip/ft`],
        ]}
      />
    </div>
  );
}

/** The ASD working: the service cases and the slab strut. */
function AsdWorking({ a, strutOn }: { a: CipAsdResult; strutOn: boolean }) {
  const s = a.strut;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="xl:col-span-2">
        <CardContent className="overflow-x-auto py-3 text-xs">
          <p className="pb-1 font-semibold">Service load cases (about the toe){a.prop ? ", without the prop" : ""}</p>
          <table className="w-full">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-normal">Case</th>
                <th className="text-right font-normal">ΣV kip/ft</th>
                <th className="text-right font-normal">MR kip·ft/ft</th>
                <th className="text-right font-normal">ΣH kip/ft</th>
                <th className="text-right font-normal">MO kip·ft/ft</th>
                <th className="text-right font-normal">FS overturning</th>
                <th className="text-right font-normal">e ft</th>
                <th className="text-right font-normal">qmax ksf</th>
                <th className="text-right font-normal">μΣV kip/ft</th>
              </tr>
            </thead>
            <tbody>
              {a.cases.map((c) => (
                <tr key={c.id} className="border-b border-border/40">
                  <td>{c.name}</td>
                  <td className="text-right tabular-nums">{fmt(c.V)}</td>
                  <td className="text-right tabular-nums">{fmt(c.MR)}</td>
                  <td className="text-right tabular-nums">{fmt(c.H)}</td>
                  <td className="text-right tabular-nums">{fmt(c.MO)}</td>
                  <td className="text-right tabular-nums">{fmt(c.FSot)}</td>
                  <td className="text-right tabular-nums">{fmt(c.e)}</td>
                  <td className="text-right tabular-nums">{fmt(c.qmax)}</td>
                  <td className="text-right tabular-nums">{fmt(c.friction)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <KeyValues
        title="Members (factored)"
        rows={[
          ["Stem Mu / φMn", `${fmt(a.stem.Mu)} / ${fmt(a.stem.flex.phiMn)} kip·ft/ft`],
          ["Stem Vu / φVc", `${fmt(a.stem.Vu)} / ${fmt(a.stem.shear.phiVc)} kip/ft`],
          ["Toe Mu / φMn", `${fmt(a.toe.gov.toe.M)} / ${fmt(a.toe.flex.phiMn)} kip·ft/ft`],
          ["Toe Vu / φVc", `${fmt(a.toe.gov.toe.F)} / ${fmt(a.toe.shear.phiVc)} kip/ft`],
          ["Heel Mu / φMn", `${fmt(a.heel.Mu)} / ${fmt(a.heel.flex.phiMn)} kip·ft/ft`],
        ]}
      />
      {strutOn && s && (
        <KeyValues
          title="Slab strut"
          rows={[
            ["Area per foot", `${fmt(s.Ag)} in²`],
            ["Capacity φ(0.85 f'c)A", `${fmt(s.capacity)} kip/ft`],
            ["Ec = 57,000 √f'c", `${fmt(s.Ec, 0)} ksi`],
            ["Axial stiffness k = Ec A / L", `${fmt(s.k, 0)} kip/in per ft`],
            ["Shortening under ΣH", `${fmt(s.shortening, 5)} in`],
            ...(s.unbalanced && s.unbalanced.dH > 0 ? ([["Unbalanced thrust / both footings' friction", `${fmt(s.unbalanced.dH)} / ${fmt(s.unbalanced.R)} kip/ft`]] as [string, string][]) : []),
          ]}
        />
      )}
      {a.prop && (
        <KeyValues
          title="Slab prop (compatibility)"
          rows={[
            ["Prop above the footing's bottom", `${fmt(a.prop.y)} ft`],
            ["Rocking stiffness kv B³/12", `${fmt(a.prop.Kr, 0)} kip·ft/rad per ft`],
            ["Sliding stiffness kh B (bounds)", `${fmt(a.prop.Kh[0], 0)} to ${fmt(a.prop.Kh[1], 0)} ksf`],
            ["Slab spring", `${fmt(a.prop.Kp, 0)} ksf`],
            ...a.prop.cases.map((p): [string, string] => {
              const c = a.cases.find((x) => x.id === p.id)!;
              return [`${c.name}: F (H = ${fmt(c.H)})`, `${p.bounds.map((b) => fmt(b.F)).join(" to ")} kip/ft; e ${p.bounds.map((b) => fmt(b.e)).join(" / ")} ft; q ${p.bounds.map((b) => fmt(b.qmax)).join(" / ")} ksf`];
            }),
            ...(a.stem.prop ? ([["Stem Mu at the base / at the slab", `${fmt(a.stem.prop.baseMu)} / ${fmt(a.stem.prop.propMu)} kip·ft/ft`]] as [string, string][]) : []),
          ]}
        />
      )}
    </div>
  );
}

/** The working: soil, loads and load groups, for checking by hand. */
function Working({ r, collision }: { r: NonNullable<ReturnType<typeof designCipWall>>; collision: boolean }) {
  const loads = [...Object.values(r.loads.vertical), ...Object.values(r.loads.horizontal)].filter((l) => Math.abs(l.force) > 1e-12);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <KeyValues
        title="Soil and geometry"
        rows={[
          ["Ka (Coulomb, Eq. 3.11.5.3-1)", fmt(r.soil.Ka)],
          ["Kp", `${fmt(r.soil.Kp, 3)}${r.soil.Kp !== r.soil.KpCoulomb ? ` (Coulomb ${fmt(r.soil.KpCoulomb, 3)})` : ""}`],
          ["δ", `${fmt(r.soil.delta, 2)}°`],
          ["Active EFW", `${fmt(r.soil.efwA * 1000, 1)} pcf`],
          ["Passive EFW", `${fmt(r.soil.efwP * 1000, 1)} pcf`],
          ["μn = tan φsub", fmt(r.soil.mu, 3)],
          ["Design height H", `${fmt(r.geometry.H, 3)} ft`],
          ["Retained height at the heel h", `${fmt(r.geometry.h, 3)} ft`],
          ["Heel C", `${fmt(r.geometry.C * 12, 2)} in`],
          ["Pa = ½ EFW h²", `${fmt(r.loads.Pa, 3)} kip/ft`],
          ...(r.geometry.heq ? [["Live load surcharge heq", `${fmt(r.geometry.heq, 2)} ft`]] : []),
        ] as [string, string][]}
      />
      <Card>
        <CardContent className="overflow-x-auto py-3 text-xs">
          <p className="pb-1 font-semibold">Unfactored loads (about the toe)</p>
          <table className="w-full">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-normal">Load</th>
                <th className="text-right font-normal">kip/ft</th>
                <th className="text-right font-normal">Arm ft</th>
                <th className="text-right font-normal">kip·ft/ft</th>
              </tr>
            </thead>
            <tbody>
              {loads.map((l) => (
                <tr key={l.id} className="border-b border-border/40" title={l.desc}>
                  <td>
                    {l.id} <span className="text-muted-foreground">{l.desc}</span>
                  </td>
                  <td className="text-right tabular-nums">{fmt(l.force)}</td>
                  <td className="text-right tabular-nums">{fmt(l.arm)}</td>
                  <td className="text-right tabular-nums">{fmt(l.moment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardContent className="overflow-x-auto py-3 text-xs">
          <p className="pb-1 font-semibold">Load groups</p>
          <table className="w-full">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-normal">Group</th>
                <th className="text-right font-normal">ΣV kip/ft</th>
                <th className="text-right font-normal">ΣMV kip·ft/ft</th>
                <th className="text-right font-normal">ΣH kip/ft</th>
                <th className="text-right font-normal">ΣMH kip·ft/ft</th>
                <th className="text-right font-normal">e ft</th>
                <th className="text-right font-normal">σV ksf</th>
              </tr>
            </thead>
            <tbody>
              {COMBOS.filter((c) => collision || !c.id.startsWith("Ext")).map((c) => {
                const g = r.groups[c.id];
                const X = (g.MV - g.MH) / g.V;
                const e = Math.abs(r.geometry.B / 2 - X);
                return (
                  <tr key={c.id} className="border-b border-border/40" title={c.use}>
                    <td>{c.name}</td>
                    <td className="text-right tabular-nums">{fmt(g.V)}</td>
                    <td className="text-right tabular-nums">{fmt(g.MV)}</td>
                    <td className="text-right tabular-nums">{fmt(g.H)}</td>
                    <td className="text-right tabular-nums">{fmt(g.MH)}</td>
                    <td className="text-right tabular-nums">{fmt(e)}</td>
                    <td className="text-right tabular-nums">{r.geometry.B - 2 * e > 0 ? fmt(g.V / (r.geometry.B - 2 * e)) : "outside the base"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
