import type { ReactNode } from "react";
import type { BrrDfRow, compareBrr } from "@/lib/design/rating/brr";
import { CHECK_LABEL, needsPosting, postTons, type DtRating } from "@/lib/design/rating/double-tee";
import type { VehicleClass } from "@/lib/design/rating/vehicles";

// The rating's tables as pictures for the calc package (a calc sheet's table regions hold numbers
// only): the rating summary, grouped as CDOT's LFR Rating Summary Sheet, and the comparison with
// BrR's run. No hooks.

const VW = 760;
const LINE = "#334155";
const MUTED = "#5c6f8a";
const RULE = "#cbd5e1";
const BAD = "#dc2626";
const GOOD = "#15803d";
const ROW = 16;

const GROUPS: { cls: VehicleClass; title: string }[] = [
  { cls: "design", title: "Design load" },
  { cls: "legal", title: "Colorado legal loads" },
  { cls: "su", title: "Specialized hauling vehicles" },
  { cls: "ev", title: "Emergency vehicles" },
  { cls: "permit", title: "Permit vehicles" },
];

type Col = { x: number; label: string; anchor?: "start" | "end" };

function Head({ cols, y, sub }: { cols: Col[]; y: number; sub?: Col[] }) {
  return (
    <g>
      {cols.map((c) => (
        <text key={c.label} x={c.x} y={y} textAnchor={c.anchor ?? "end"} fontSize="9" fontWeight="600" fill={LINE}>
          {c.label}
        </text>
      ))}
      {sub?.map((c) => (
        <text key={c.label + c.x} x={c.x} y={y + 11} textAnchor={c.anchor ?? "end"} fontSize="8.5" fill={MUTED}>
          {c.label}
        </text>
      ))}
      <line x1={10} y1={y + (sub ? 15 : 5)} x2={VW - 10} y2={y + (sub ? 15 : 5)} stroke={LINE} strokeWidth="0.8" />
    </g>
  );
}

const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "—");

/** A check's short name for a table cell. */
const SHORT: Record<keyof typeof CHECK_LABEL, string> = {
  flexure: "flexure",
  shear: "shear",
  tension: "tension",
  compression: "compression",
  "compression-ll": "compression (LL)",
  strand: "strand stress",
  "deck-compression": "deck compression",
};
const where = (g: string, check: keyof typeof CHECK_LABEL, x: number) => `${g}, ${SHORT[check]}, ${x.toFixed(2)} ft`;

/** The rating summary: each CDOT vehicle's inventory and operating ratings, where each governs, and posting. */
export function RatingSummaryTable({ r, title }: { r: DtRating; title: string }) {
  const cols: Col[] = [
    { x: 14, label: "Vehicle", anchor: "start" },
    { x: 140, label: "Weight" },
    { x: 192, label: "Inventory" },
    { x: 232, label: "" },
    { x: 242, label: "Governs (inventory)", anchor: "start" },
    { x: 408, label: "Operating" },
    { x: 448, label: "" },
    { x: 458, label: "Governs (operating)", anchor: "start" },
    { x: 746, label: "Posting" },
  ];
  const sub: Col[] = [
    { x: 140, label: "T" },
    { x: 192, label: "RF" },
    { x: 232, label: "T" },
    { x: 408, label: "RF" },
    { x: 448, label: "T" },
  ];
  let y = 54;
  const body: ReactNode[] = [];
  for (const g of GROUPS) {
    const rows = r.ratings.filter((v) => v.cls === g.cls);
    if (!rows.length) continue;
    y += 6;
    body.push(
      <text key={g.cls} x={14} y={y + 10} fontSize="9" fontStyle="italic" fill={MUTED}>
        {g.title}
      </text>,
    );
    y += ROW;
    for (const v of rows) {
      const posted = needsPosting(v.posting);
      body.push(
        <g key={v.name}>
          <text x={22} y={y + 10} fontSize="9.5" fill={LINE}>
            {v.name}
          </text>
          <text x={140} y={y + 10} textAnchor="end" fontSize="9.5" fill={LINE}>
            {+v.tons.toFixed(2)}
          </text>
          <text x={192} y={y + 10} textAnchor="end" fontSize="9.5" fill={v.cls === "design" && v.govInv.inv.inv < 1 ? BAD : LINE}>
            {f3(v.govInv.inv.inv)}
          </text>
          <text x={232} y={y + 10} textAnchor="end" fontSize="9.5" fill={LINE}>
            {v.invTons.toFixed(1)}
          </text>
          <text x={242} y={y + 10} fontSize="8.5" fill={MUTED}>
            {where(v.govInv.g, v.govInv.inv.check, v.govInv.inv.x)}
          </text>
          <text x={408} y={y + 10} textAnchor="end" fontSize="9.5" fontWeight="600" fill={v.govOpr.opr.opr < 1 ? BAD : LINE}>
            {f3(v.govOpr.opr.opr)}
          </text>
          <text x={448} y={y + 10} textAnchor="end" fontSize="9.5" fontWeight="600" fill={LINE}>
            {v.oprTons.toFixed(1)}
          </text>
          <text x={458} y={y + 10} fontSize="8.5" fill={MUTED}>
            {where(v.govOpr.g, v.govOpr.opr.check, v.govOpr.opr.x)}
          </text>
          <text x={746} y={y + 10} textAnchor="end" fontSize="9" fill={posted ? BAD : v.posting.startsWith("Exempt") ? "#b45309" : MUTED} fontWeight={posted ? "600" : "400"}>
            {v.posting}
          </text>
          <line x1={14} y1={y + ROW - 1} x2={VW - 14} y2={y + ROW - 1} stroke={RULE} strokeWidth="0.4" />
        </g>,
      );
      y += ROW;
    }
  }
  const posted = r.ratings.filter((v) => needsPosting(v.posting));
  y += 14;
  const VH = y + 12;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" role="img" aria-label="Rating summary">
      <text x={VW / 2} y={16} textAnchor="middle" fontSize="12" fontWeight="600" fill={LINE}>
        {title}
      </text>
      <Head cols={cols} y={34} sub={sub} />
      {body}
      <text x={14} y={y} fontSize="9.5" fontWeight="600" fill={posted.length ? BAD : GOOD}>
        {r.restricted ? "A legal load rates under 0.3: restrict all legal loads (BRM 1.15.1)" : posted.length ? `Posting required (BRM 1.15.1): ${posted.map((v) => `${v.name} ${postTons(v.oprTons).toFixed(1)} T`).join(", ")}` : "No posting required (BRM 1.15.1)"}
      </text>
    </svg>
  );
}

/** HS-20 by girder: each girder's lowest inventory and operating rating over all points and checks, identical girders on one row. */
export function GirderRatingTable({ r }: { r: DtRating }) {
  const hs = r.ratings.find((v) => v.cls === "design")!;
  const SW = " (trucks on sidewalk)";
  const rows: { names: string[]; sw: boolean; key: string; p: (typeof hs.per)[number] }[] = [];
  for (const p of hs.per) {
    const sw = p.g.endsWith(SW);
    const key = `${sw}|${p.df.toFixed(4)}|${p.inv.inv.toFixed(4)}|${p.inv.check}|${p.inv.x}|${p.opr.opr!.toFixed(4)}|${p.opr.check}|${p.opr.x}`;
    const row = rows.find((q) => q.key === key);
    if (row) row.names.push(p.g.replace(SW, ""));
    else rows.push({ names: [p.g.replace(SW, "")], sw, key, p });
  }
  const minInv = Math.min(...hs.per.map((p) => p.inv.inv));
  const cols: Col[] = [
    { x: 14, label: "Girder", anchor: "start" },
    { x: 250, label: "DF" },
    { x: 330, label: "Inventory" },
    { x: 342, label: "Governs (inventory)", anchor: "start" },
    { x: 560, label: "Operating" },
    { x: 572, label: "Governs (operating)", anchor: "start" },
  ];
  const sub: Col[] = [
    { x: 250, label: "two or more lanes" },
    { x: 330, label: "RF" },
    { x: 560, label: "RF" },
  ];
  let y = 54;
  const body: ReactNode[] = [];
  for (const q of rows) {
    const gov = Math.abs(q.p.inv.inv - minInv) < 1e-9;
    body.push(
      <g key={q.key}>
        <text x={22} y={y + 10} fontSize="9.5" fill={LINE} fontWeight={gov ? "600" : "400"}>
          {`${q.names.join(", ")}${q.sw ? SW : ""}`}
        </text>
        <text x={250} y={y + 10} textAnchor="end" fontSize="9.5" fill={LINE}>
          {f3(q.p.df)}
        </text>
        <text x={330} y={y + 10} textAnchor="end" fontSize="9.5" fontWeight={gov ? "600" : "400"} fill={q.p.inv.inv < 1 ? BAD : LINE}>
          {f3(q.p.inv.inv)}
        </text>
        <text x={342} y={y + 10} fontSize="8.5" fill={MUTED}>
          {`${SHORT[q.p.inv.check]}, ${q.p.inv.x.toFixed(2)} ft`}
        </text>
        <text x={560} y={y + 10} textAnchor="end" fontSize="9.5" fill={q.p.opr.opr! < 1 ? BAD : LINE}>
          {f3(q.p.opr.opr!)}
        </text>
        <text x={572} y={y + 10} fontSize="8.5" fill={MUTED}>
          {`${SHORT[q.p.opr.check]}, ${q.p.opr.x.toFixed(2)} ft`}
        </text>
        <line x1={14} y1={y + ROW - 1} x2={VW - 14} y2={y + ROW - 1} stroke={RULE} strokeWidth="0.4" />
      </g>,
    );
    y += ROW;
  }
  const govRow = rows.find((q) => Math.abs(q.p.inv.inv - minInv) < 1e-9)!;
  y += 14;
  const VH = y + 12;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" role="img" aria-label="HS-20 rating of each girder">
      <text x={VW / 2} y={16} textAnchor="middle" fontSize="12" fontWeight="600" fill={LINE}>
        HS-20 rating of each girder (lowest over all points and checks)
      </text>
      <Head cols={cols} y={34} sub={sub} />
      {body}
      <text x={14} y={y} fontSize="9.5" fontWeight="600" fill={LINE}>
        {`Governs: ${govRow.names.join(", ")}${govRow.sw ? SW : ""}, HS-20 inventory ${f3(minInv)}`}
      </text>
    </svg>
  );
}

/** ALLCON's ratings beside BrR's (and the distribution factors), each within 5%. */
export function BrrComparisonTable({ cmp, df, source }: { cmp: ReturnType<typeof compareBrr>; df: BrrDfRow[]; source: string }) {
  const cols: Col[] = [
    { x: 14, label: "Vehicle", anchor: "start" },
    { x: 170, label: "Level", anchor: "start" },
    { x: 260, label: "Girder", anchor: "start" },
    { x: 470, label: "This calc" },
    { x: 540, label: "BrR" },
    { x: 620, label: "Difference" },
    { x: 700, label: "Check" },
  ];
  let y = 46 + (source ? 12 : 0);
  const body: ReactNode[] = [];
  const row = (key: string, cells: [string, string, string, number, number, number, boolean]) => {
    const [a, b, c, ours, brr, diff, ok] = cells;
    body.push(
      <g key={key}>
        <text x={14} y={y + 10} fontSize="9.5" fill={LINE}>
          {a}
        </text>
        <text x={170} y={y + 10} fontSize="9.5" fill={LINE}>
          {b}
        </text>
        <text x={260} y={y + 10} fontSize="9" fill={MUTED}>
          {c}
        </text>
        <text x={470} y={y + 10} textAnchor="end" fontSize="9.5" fill={LINE}>
          {f3(ours)}
        </text>
        <text x={540} y={y + 10} textAnchor="end" fontSize="9.5" fill={LINE}>
          {f3(brr)}
        </text>
        <text x={620} y={y + 10} textAnchor="end" fontSize="9.5" fill={LINE}>
          {Math.abs(diff) < 0.0005 ? "0.0%" : `${diff > 0 ? "+" : ""}${(diff * 100).toFixed(1)}%`}
        </text>
        <text x={700} y={y + 10} textAnchor="end" fontSize="9.5" fontWeight="600" fill={ok ? GOOD : BAD}>
          {ok ? "OK" : "Check"}
        </text>
        <line x1={14} y1={y + ROW - 1} x2={VW - 14} y2={y + ROW - 1} stroke={RULE} strokeWidth="0.4" />
      </g>,
    );
    y += ROW;
  };
  for (const x of cmp.done) row(`${x.name}${x.level}${x.girder}`, [x.name, x.level, x.girder, x.ours, x.brr, x.diff, x.ok]);
  if (df.length) {
    y += 8;
    body.push(
      <text key="df" x={14} y={y + 10} fontSize="9" fontStyle="italic" fill={MUTED}>
        Distribution factors (moment)
      </text>,
    );
    y += ROW;
    for (const d of df) row(`df${d.key}`, [d.label, "", "", d.ours, d.brr, d.diff, d.ok]);
  }
  const bad = cmp.outside + df.filter((d) => !d.ok).length;
  y += 14;
  const VH = y + 12;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" role="img" aria-label="Comparison with BrR">
      <text x={VW / 2} y={16} textAnchor="middle" fontSize="12" fontWeight="600" fill={LINE}>
        Comparison with AASHTOWare BrR (acceptable within 5%)
      </text>
      {source && (
        <text x={VW / 2} y={30} textAnchor="middle" fontSize="8.5" fill={MUTED}>
          {source.length > 140 ? `${source.slice(0, 137)}…` : source}
        </text>
      )}
      <Head cols={cols} y={source ? 46 : 34} />
      {body}
      <text x={14} y={y} fontSize="9.5" fontWeight="600" fill={bad ? BAD : GOOD}>
        {bad ? `${bad} item${bad === 1 ? "" : "s"} outside 5%: check BrR's inputs (spacing, member loads, distribution factors, travelway) before accepting.` : `All ${cmp.done.length + df.length} compared values within 5%.`}
      </text>
    </svg>
  );
}
