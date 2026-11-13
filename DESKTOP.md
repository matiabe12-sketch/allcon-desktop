# ALLCON desktop

The allcon web app, packaged to run entirely on this PC: double-click **ALLCON** on the Desktop.

## What runs

`electron/main.mjs` starts, in order:

1. **PostgreSQL** (embedded, private to ALLCON) — database in `%APPDATA%\ALLCON\database`
2. **Schema migrations** (`prisma migrate deploy`) — the same migrations as the web app
3. **Python engine** (`python\` folder: ifcopenshell, ezdxf, sympy) — `api/ifc.py` and `api/sym.py`
4. **The app server** (`next start`) on 127.0.0.1, shown in the ALLCON window

Files (drawings, models, calcs) are kept in `%APPDATA%\ALLCON\files`. Log: `%APPDATA%\ALLCON\allcon.log`.

## Offline differences from the web app (`ALLCON_LOCAL=1`)

- No sign-in: one local user.
- Sheets open in a local pdf.js viewer (`components/sheets/viewer/sheet-controller.ts`, snapping in
  `snaps.ts`) instead of the Autodesk Viewer; Autodesk storage is emulated on local files (`lib/aps/oss.ts`).
- Models: IFC only (Revit needs Autodesk's cloud translation).
- Hidden: Map, Connections (MCP), plan Review (AI), share links, feedback.

## After changing the code

```
set ALLCON_LOCAL=1
npx next build
```

Then restart ALLCON. To regenerate the icon: `node scripts/make-desktop-icon.mjs`.
