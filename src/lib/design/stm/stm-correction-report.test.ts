import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StmSketch } from "@/components/design/stm-sketch";
import { svgMarkup } from "../figures";
import { nodeLpSolver } from "./lp-node";
import { designStm, stmInputs, type StmInputs, type StmResult } from "./strut-tie";

// Generates the correction report's numbers and plots from a saved design snapshot (read-only):
// STM_SNAPSHOT=<snapshot .json> STM_REPORT_DIR=<output folder> npx vitest run stm-correction-report
// Variants compared, the saved model untouched:
//   A  as saved;
//   B  column boundary held near the column's linear stress (FHWA's assumption at the D-region boundary);
//   C  self-weight counted only above the cap's soffit (the template's soffit, y = 0), not the column stub;
//   D  B and C together.

const snapshot = process.env.STM_SNAPSHOT;
const out = process.env.STM_REPORT_DIR;

const summarize = (r: StmResult) => ({
  cases: r.perCase.map((p, k) => ({ case: k + 1, name: p.name, applied: +p.applied.toFixed(1), nodalResidual: p.equilibrium.nodal, Fx: p.equilibrium.Fx, Fy: p.equilibrium.Fy, M: p.equilibrium.M, equilibrium: p.equilibrium.ok, smallestAngle: p.smallestAngle && +p.smallestAngle.toFixed(2), angleOk: p.angleOk })),
  members: r.members.filter((m) => m.active).map((m) => ({ member: m.key, role: m.role, tension: +m.tension.toFixed(1), tensionCase: m.tensionCase === null ? null : m.tensionCase + 1, compression: +m.compression.toFixed(1), compressionCase: m.compressionCase === null ? null : m.compressionCase + 1 })),
  supports: r.supportReport.map((s) => ({ node: s.node, restrains: s.direction, reactions: s.reactions.map((v) => +v.toFixed(1)), target: s.target?.map((v) => (v === null ? null : +v.toFixed(1))) ?? null })),
  checks: r.checks.map((c) => ({ name: c.name, demand: +c.demand.toFixed(1), capacity: +c.capacity.toFixed(1), ok: c.ok })),
  failing: r.checks.filter((c) => !c.ok).map((c) => c.name),
  coverage: r.coverage.map((c) => ({ item: c.item, status: c.status, detail: c.detail })),
  status: r.status,
  boundary: r.boundary,
  warnings: r.warnings,
  appliedLoads: r.appliedLoads.map((l) => ({ label: l.label, x: +(l.x / 12).toFixed(2), P: +l.P.toFixed(1), detail: l.detail })),
  reversedCases: r.reversedCases,
  selfWeight: r.capLoads ? +r.capLoads.selfWeight.toFixed(1) : null,
});

describe.skipIf(!snapshot || !out)("STM correction report (from a saved snapshot)", () => {
  it("runs the variants, checks equilibrium case by case, and writes plots", async () => {
    const saved = JSON.parse(readFileSync(snapshot!, "utf8"));
    const base: StmInputs = stmInputs(saved.inputs);
    const variants: Record<string, StmInputs> = {
      A: base,
      B: { ...base, columnBoundary: "linear-stress" },
      C: { ...base, girders: base.girders ? { ...base.girders, soffit: 0 } : null },
      D: { ...base, columnBoundary: "linear-stress", girders: base.girders ? { ...base.girders, soffit: 0 } : null },
    };
    mkdirSync(`${out}/plots`, { recursive: true });
    const results: Record<string, unknown> = { model: { id: saved.id, name: saved.name, updated_at: saved.updated_at } };
    for (const [key, inputs] of Object.entries(variants)) {
      const r = await designStm(inputs, nodeLpSolver);
      // Equilibrium verified here independently of the solver's success, every case.
      for (const p of r.perCase) expect(p.equilibrium.ok).toBe(true);
      results[key] = summarize(r);
      writeFileSync(`${out}/plots/${key}-envelope.svg`, svgMarkup(StmSketch({ result: r, view: "envelope", title: `Variant ${key}: envelope over ${r.cases.length} cases (nonsimultaneous)` })));
      if (key === "A" || key === "B") r.cases.forEach((_, k) => writeFileSync(`${out}/plots/${key}-case-${String(k + 1).padStart(2, "0")}.svg`, svgMarkup(StmSketch({ result: r, view: { case: k } }))));
    }
    writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
  }, 120000);
});
