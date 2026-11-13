import type { Line } from "@/lib/calcs/library/templates";
import type { Figure } from "../figures";
import { quantityLines } from "../rebar/schedule";
import type { QuantityRole } from "../rebar/cdot-items";
import { takeoffPayLines } from ".";
import type { Takeoff } from "./types";

// A design's quantity sheet from its take-off: the summary of approximate quantities by CDOT pay
// item, the concrete and reinforcing steel tabulated, each other quantity with its basis, the
// views, and the notes.

export function takeoffQuantityLines(kind: string, t: Takeoff, title: string, chosen: Partial<Record<QuantityRole, string>> = {}, inputs?: unknown, figures?: Figure[]): Line[] {
  const pay = takeoffPayLines(kind, t, chosen, inputs);
  const location = `${title} (${t.what}${t.length && t.length.unit === "ft" ? `, ${t.length.value} ft` : ""})`;
  const bases = Object.fromEntries(pay.flatMap((l) => (t.quantities[l.role]?.basis ? [[l.code, t.quantities[l.role]!.basis]] : [])));
  const maths = Object.fromEntries(
    pay.flatMap((l) => {
      const q = t.quantities[l.role];
      return q?.math || q?.terms?.length ? [[l.code, { math: q.math, terms: q.terms, ref: q.ref }]] : [];
    }),
  );
  const lines = quantityLines(title, t.schedule, `Purpose:- The quantities of the ${t.what} as detailed, for the estimate, under CDOT's pay items.`, { location, lines: pay, bases, maths });
  if (figures?.length) lines.splice(3, 0, { text: "As detailed:", style: "note", keepWithNext: true }, ...figures.map((f) => ({ region: f })));
  for (const n of t.notes) lines.push({ text: n, style: "note" });
  return lines;
}
