# GRS abutments and noise walls (plan and status)

The Wed 2026-12-16 slot of the design tools schedule: two tools.

## GRS Abutment (kind `grs-abutment`, under Foundations)

A geosynthetic reinforced soil abutment carrying a single-span superstructure on a beam seat, by FHWA-HRT-11-026 (the
GRS-IBS Interim Implementation Guide, 2012) Appendix C (LRFD), as CDOT BDM 11.3.5.2 requires, with CDOT's added rules.

**Layout (Guide 4.3.4; BDM 11.3.5.5):**
- Reinforcement spacing Sv ≤ 12 in.; Tf ≥ 4,800 lb/ft; a bearing bed under the seat at Sv/2, at least 5 layers.
- Bearing width b ≥ 2.0 ft (span < 25 ft) or 2.5 ft; setback ab ≥ 8 in.
- Clear space ≥ 3 in. and 2% of H (Guide), and 2 ft from the facing's top to the girders (BDM 11.3.5.5f).
- Base width ≥ 5 or 6 ft and 0.3H (Guide), and the truncated base ≥ 0.35 DH (BDM 11.3.5.5l).
- The Service I resultant at least H/3 and 3 ft behind the facing's back (BDM 11.3.5.5c).
- The reinforced soil foundation (RSF): 1.25·Btotal wide, 0.25·Btotal deep.

**External stability (Appendix C.2.1):**
- direct sliding (φτ 1.0);
- bearing on the foundation under the RSF (φbc 0.65, B′ = B − 2e);
- global stability by Bishop circles under the RSF (Service I, φ 0.65, so FS ≥ 1.54).

**Internal stability (Appendix C.2.2):**
- Vertical capacity, analytical: qn = 0.7^(Sv/6dmax)·(Tf/Sv)·Kpr; or empirical, from a performance test (φcap 0.45). The
  nominal capped at 14 ksf (BDM 11.3.5.5b).
- Deformations:
  - vertical strain from the Guide's design envelope (Figure 20) or the project's test, ≤ 0.5%;
  - lateral deformation DL = 2·bq,vol·Dv/H, strain ≤ 1%.
- Required reinforcement strength layer by layer:
  - Treq,f = σh,f/0.7^(Sv/6dmax)·Sv ≤ 0.9·Tf/2.25;
  - Treq ≤ T at 2% strain;
  - the bearing bed's depth from where the primary spacing fails.

**Benchmark:** the Guide's Bowman Road Bridge (C.3): FR 14,068 and RR 15,239 lb/ft; σv 7,862 psf against qR 13,481;
qn,an 18,781 psf; Dv 0.047 ft; DL 0.028 ft; Table 18's lateral stresses and Treq.

**Quantities:**
- reinforced soil (CY, 206-00360);
- facing block (SF, 504-04410);
- RSF and structure backfill;
- excavation;
- the seat's concrete and bars.

## Noise Wall (kind `noise-wall`, under Walls)

Precast concrete panels between steel posts on drilled shafts, the CDOT typical (BDM 15.3), by AASHTO Section 15.

**Loads:**
- Wind (15.8.2, 3.8.1): Pz = 2.56E-6·V²·Kz·G·CD with G 0.85 and CD 1.2, Z ≥ 33 ft, exposure B, C or D. The posts carry
  the line load at 0.55·H (3.8.1.2.4).
- Collision (15.8.4): Cases 1–4 by setback and test level (TL-3 per BDM 15.4); none when the setback is over 4 ft.
- Seismic (15.9.9): Extreme Event I, kh·W.

**Checks:**
- Panels: flexure and shear spanning between the posts, two mats (C15.8.4).
- Posts: W-shape flexure and shear (6.12).
- Shafts:
  - embedment as a single row by 11.8.4 with the earth pressures of 3.11.5.10 (Broms), φ 0.75 on passive;
  - diameter ≥ 18 in. (BDM 10.6.1.1);
  - flexure and shear.
- Service I deflection at the top.

**Quantities:**
- noise wall area (SF);
- shafts (LF);
- posts.

## Status

- Built 2026-11-20 (both tools).
