# Soil nail walls (plan and status)

The next tool on the schedule (Wed 2026-12-09 slot). CDOT's Bridge Design Manual 11.5.6 says soil nail walls are
"frequently used as top-down, permanent retaining structures in Colorado". It recommends FHWA's **GEC 7, Soil Nail Walls
Reference Manual (FHWA-NHI-14-007, 2015)**, which is LRFD and follows AASHTO. The manual is in the scratchpad from
fhwa.dot.gov.

Other CDOT guidance:
- typical bond is 10 to 15 psi dry, 30 psi at most;
- no diamond patterns within a future bridge widening;
- CDOT Geotechnical usually designs in-house walls with Staff Bridge;
- Seismic analysis isn't required unless the wall supports an abutment or liquefaction is expected (BDM 11.5.16).

## The checks (GEC 7 Chapter 6, its design steps)

| GEC 7 | Check |
|---|---|
| 6.5.1 (Step 6a) | Internal stability: Bishop circles through the toe, each crossing nail limited to pullout behind the surface / FS 2.0, tendon / 1.8, facing and front pullout / 1.5; FS_OS ≥ 1.5 (permanent, critical), 1.35 (non-critical), 1.30 / 1.20 for the construction stages; Tmax from the critical circle |
| 6.5.1 (iii) | Each excavation stage (2 ft below each row before it's nailed) |
| 6.5.2 (Step 6b) | Global stability: circles behind all the nails and below the toe, nails disregarded |
| 6.5.3 (Step 6c) | Basal heave, where clay is below the excavation (Eq. 5.16; φBH 0.50) |
| 6.5.4, 6.6.3 | Sliding of the nailed block (Eqs. 5.17–5.23; φLS 0.90) |
| 6.6.2 (Step 7a) | Pullout: φPO·qu·π·DDH·Lp ≥ 1.35·Tmax (φPO 0.65) |
| 6.6.4 (Step 7c) | Tendon: φT·fy·At ≥ 1.35·Tmax (φT 0.75 for Grade 60/75) |
| 6.6.5 (Step 7d) | Facing flexure, initial and final: RFF = CF(m_n + m_m)(8·SH/SV) both ways, To = Tmax[0.6 + 0.2(Smax − 1)] (m); ρmin/ρmax |
| 6.6.6 (Step 7e) | Punching shear: VF = 0.58√f′c·π·D′c·hc, initial (bearing plate) and final (headed studs) |
| 6.6.7 (Step 7f) | Headed studs: RFH = NH·As·fy (φFH 0.70 A307, 0.80 A325), head proportions |
| 6.7 (Step 8) | Displacement δh = (δh/H)i·H (1/1000, 1/500, 1/333), DDEF = C·H(1 − tan α) |
| 6.8 (Step 9) | Seismic (toggle): kh in the stability analyses, FS ≥ 1.1 |

## Outputs

- **The editor:**
  - the wall: height, batter, backslope, surcharge;
  - the soil layers, each with its bond strength;
  - the nail pattern: rows, spacing, lengths, inclination, bar, drill hole;
  - the initial and final facing, studs and bearing plate.
- **The section:** the nails and the critical internal and global circles.
- **The calc package**, worked live.
- **Quantities:** soil nails (LF, 504-06406), soil nail wall (SF, 504-06400), initial shotcrete facing (SF, 641-10010).

## Validation

GEC 7 Appendix C, a 25 ft wall in silty sand with #7 Grade 75 nails at 5 ft and a CIP final facing:
- the stability analysis gave FS_OS 1.51 and Tmax 24.7 kip;
- facing: RFF 36 and 60.8 kip, RFP 41.6 and 36.9 kip, RFH 47.1 kip;
- δh 0.6 in.
