"use client";

import { Card, CardContent } from "@/components/ui/card";
import { LRFR_DEFAULTS, type LrfrResult, type LrfrSettings, type RatingAt } from "@/lib/design/girders/lrfr";
import { Choice, Field, fmt, Toggle } from "./design-kit";

// The girder check's Load and Resistance Factor Rating (MBE 6A, CDOT BRM): its settings in the inputs, and its
// results: the HL-93 rating factors, each vehicle's RF and tons with where it controls, the posting and color code.

export function LrfrSettingsFields({ value, onChange }: { value: LrfrSettings | undefined; onChange: (v: LrfrSettings) => void }) {
  const s = { ...LRFR_DEFAULTS, ...(value ?? {}) };
  const set = <K extends keyof LrfrSettings>(k: K) => (v: LrfrSettings[K]) => onChange({ ...s, [k]: v });
  return (
    <>
      <Toggle label="Rate the girders (LRFR)" value={s.on} onChange={set("on")} />
      {s.on && (
        <>
          <Choice label="Legal trucks" value={s.route} options={[{ value: "state", label: "Colorado (state highways)" }, { value: "interstate", label: "Interstate (routes and ramps)" }]} onChange={set("route")} />
          <Field label="ADTT, one direction (0: unknown)" value={s.adtt ?? 0} onChange={(v) => set("adtt")(v > 0 ? Math.round(v) : null)} hint="ADT × % trucks from the SIA (BRM 15-6)" />
          <Choice label="Condition (φc)" value={s.condition} options={[{ value: "good", label: "Good or satisfactory, 1.00" }, { value: "fair", label: "Fair, 0.95" }, { value: "poor", label: "Poor, 0.85" }]} onChange={set("condition")} />
          <Field label="System factor φs" value={s.system} onChange={set("system")} step={0.05} hint="1.00 for multi-girder bridges (MBE Table 6A.4.2.4-1)" />
          <Toggle label="Wearing surface measured (γDW 1.25)" value={s.dwMeasured} onChange={set("dwMeasured")} />
          <Choice label="Legal load factors" value={s.edition} options={[{ value: "3rd", label: "MBE 3rd edition (1.30–1.45)" }, { value: "2nd", label: "MBE 2nd edition (1.40–1.80)" }]} onChange={set("edition")} />
          <Choice label="Legal and permit distribution" value={s.lanes} options={[{ value: "multi", label: "Multi-lane (BRM 1.3 C)" }, { value: "single", label: "One lane (BRM 1.3 D, with approval)" }]} onChange={set("lanes")} />
          <Toggle label="Emergency vehicles at γL 1.30 (BRM 1.3 L)" value={s.evAt130} onChange={set("evAt130")} />
          <Toggle label="Rate shear (BRM 1.4 M)" value={s.shear} onChange={set("shear")} />
        </>
      )}
    </>
  );
}

const where = (a: RatingAt) => `${a.girder}, span ${a.span + 1}, ${fmt(a.x, 1)} ft: ${a.limit.toLowerCase()}`;
const LEVEL: Record<string, string> = { legal: "Legal", su: "Specialized hauling", ev: "Emergency", permit: "Permit" };

export function LrfrResults({ rating }: { rating: LrfrResult }) {
  const q = rating;
  const f = q.factors;
  return (
    <Card>
      <CardContent className="space-y-3 py-3 text-xs">
        <div className="flex flex-wrap items-baseline gap-x-4">
          <p className="text-sm font-semibold">Load rating (LRFR)</p>
          <span className="text-muted-foreground">
            MBE 6A with the CDOT Bridge Rating Manual · φc·φs {fmt(f.phiCS, 2)} · γDW {fmt(f.gDW, 2)} · legal γL {fmt(f.gLegal, 2)} · permit γL {fmt(f.gPermit, 2)}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border px-3 py-2">
            <p className="text-muted-foreground">HL-93 inventory (RF)</p>
            <p className="text-lg font-semibold tabular-nums">{fmt(q.hl93.inventory.rf, 2)}</p>
            <p className="text-muted-foreground">{where(q.hl93.inventory)}</p>
          </div>
          <div className="rounded-md border px-3 py-2">
            <p className="text-muted-foreground">HL-93 operating (RF)</p>
            <p className="text-lg font-semibold tabular-nums">{fmt(q.hl93.operating.rf, 2)}</p>
            <p className="text-muted-foreground">{where(q.hl93.operating)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="font-normal">Vehicle</th>
                <th className="font-normal">Level</th>
                <th className="text-right font-normal">γL</th>
                <th className="text-right font-normal">RF</th>
                <th className="text-right font-normal">Tons</th>
                <th className="pl-3 font-normal">Controls</th>
              </tr>
            </thead>
            <tbody>
              {q.ratings.map((v) => (
                <tr key={v.name} className={v.rf.rf < 1 ? "text-destructive" : ""}>
                  <td>{v.name}</td>
                  <td className="text-muted-foreground">{LEVEL[v.level] ?? v.level}</td>
                  <td className="text-right tabular-nums">{fmt(v.gammaL, 2)}</td>
                  <td className="text-right tabular-nums">{fmt(Math.floor(v.rf.rf * 100 + 1e-9) / 100, 2)}</td>
                  <td className="text-right tabular-nums">{v.ratingTons === null ? "—" : fmt(v.ratingTons, 1)}</td>
                  <td className="pl-3 text-muted-foreground">{where(v.rf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border px-3 py-2">
            <p className="font-medium">Posting (BRM 1.15)</p>
            {q.posting.map((p) => (
              <p key={p.name} className={p.action !== "none" && p.action !== "not used on this route" ? "text-destructive" : "text-muted-foreground"}>
                {p.name}: {fmt(p.tons, 1)} T{p.limit !== null ? ` of ${p.limit} T` : ""} · {p.action}
              </p>
            ))}
            <p className="pt-1 text-muted-foreground">{q.needsPosting ? "The bridge needs posting: the Bridge Rating Engineer decides." : "No posting needed."} SU4–SU7 are rated only when the NRL is under 1.0.</p>
          </div>
          <div className="rounded-md border px-3 py-2">
            <p className="font-medium">Overload color code (BRM 1.16)</p>
            <p className="text-lg font-semibold">{q.color.code}</p>
            <p className="text-muted-foreground">
              Interior girders: CO Permit {fmt(q.color.permitTons, 1)} T, CO Modified Tandem {fmt(q.color.tandemTons, 1)} T (Table 1-7)
            </p>
          </div>
        </div>
        <p className="text-muted-foreground">
          The girder check&apos;s own capacities, dead loads, distribution factors and stresses at every point; vehicles moved over the spans with IM 33% (BRM 15-4). Service III is rated for HL-93 inventory only (γL 0.80); BRM 1.3 P lets the legal and permit ratings skip the service limit states. Shear capacity is the design&apos;s, worked out at the design&apos;s factored forces.
        </p>
      </CardContent>
    </Card>
  );
}
