// ALLCON desktop: a private PostgreSQL server and the app's own server, both on this PC, shown in
// a window. Everything (database and files) is kept in %USERPROFILE%\ALLCON; nothing goes online.

import { app, BrowserWindow, dialog, shell, Menu } from "electron";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
app.setName("ALLCON");
app.setAppUserModelId("app.allcon.desktop");
// The data folder: outside AppData on purpose. When ALLCON is started from inside a packaged
// (MSIX) app, such as the Claude desktop app, Windows silently redirects writes to AppData into that
// app's private storage, so a launch from the desktop shortcut and a launch from inside it would see
// two different databases. A folder in the user's profile isn't redirected.
const DATA = process.env.ALLCON_DATA_DIR || path.join(os.homedir(), "ALLCON");
mkdirSync(DATA, { recursive: true });
app.setPath("userData", DATA);
const PG_DIR = path.join(DATA, "database");
const FILES_DIR = path.join(DATA, "files");
const LOG = path.join(DATA, "allcon.log");
mkdirSync(FILES_DIR, { recursive: true });

const log = (...parts) => {
  const line = `[${new Date().toISOString()}] ${parts.join(" ")}\n`;
  process.stdout.write(line);
  try {
    appendFileSync(LOG, line);
  } catch {}
};

/** Settings made once and kept: the database password and the app's signing secret. */
function secrets() {
  const file = path.join(DATA, "secrets.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const s = { pgPassword: randomBytes(18).toString("hex"), authSecret: randomBytes(32).toString("base64") };
  writeFileSync(file, JSON.stringify(s));
  return s;
}

const freePort = (preferred) =>
  new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => {
      const any = net.createServer();
      any.listen(0, "127.0.0.1", () => {
        const { port } = any.address();
        any.close(() => resolve(port));
      });
    });
    srv.listen(preferred, "127.0.0.1", () => srv.close(() => resolve(preferred)));
  });

const waitForPort = async (port, ms = 120_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await new Promise((resolve) => {
      const s = net.connect(port, "127.0.0.1", () => (s.end(), resolve(true)));
      s.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Nothing answered on port ${port}`);
};

/** Runs a Node script with Electron's own Node (no separate Node install needed). */
function runNode(args, env, { wait = true } = {}) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: "1" },
    windowsHide: true,
  });
  child.stdout.on("data", (d) => log(String(d).trimEnd()));
  child.stderr.on("data", (d) => log(String(d).trimEnd()));
  if (!wait) return child;
  return new Promise((resolve, reject) =>
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited with ${code}`)))),
  );
}

let pg = null;
let server = null;
let win = null;
const workers = [];

/** The Python engine (api/ifc.py: IFC models and DXF; api/sym.py: symbolic math), on the private Python. */
async function startPythonWorkers(secret) {
  const python = path.join(ROOT, "python", "python.exe");
  if (!existsSync(python)) {
    log("No private Python found; IFC quantities, DXF and symbolic math are off.");
    return {};
  }
  const urls = {};
  for (const [name, script, portVar, preferred, urlVar] of [
    ["ifc", "ifc.py", "IFC_WORKER_PORT", 47328, "IFC_WORKER_URL"],
    ["sym", "sym.py", "SYM_WORKER_PORT", 47329, "SYM_WORKER_URL"],
  ]) {
    const port = await freePort(preferred);
    const child = spawn(python, [path.join(ROOT, "api", script)], {
      cwd: ROOT,
      env: { ...process.env, BETTER_AUTH_SECRET: secret, [portVar]: String(port), PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      windowsHide: true,
    });
    child.stdout.on("data", (d) => log(`[${name}]`, String(d).trimEnd()));
    child.stderr.on("data", (d) => log(`[${name}]`, String(d).trimEnd()));
    workers.push(child);
    urls[urlVar] = `http://127.0.0.1:${port}/api/${name}`;
  }
  return urls;
}

async function startDatabase(password) {
  const port = await freePort(54329);
  pg = new EmbeddedPostgres({
    databaseDir: PG_DIR,
    user: "allcon",
    password,
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: (m) => log("[pg]", String(m).trimEnd()),
    onError: (m) => log("[pg:error]", String(m).trimEnd()),
  });
  if (!existsSync(path.join(PG_DIR, "PG_VERSION"))) {
    log("Creating the database (first run)…");
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase("allcon");
  } catch {
    // already there
  }
  return `postgresql://allcon:${password}@127.0.0.1:${port}/allcon`;
}

function splash() {
  const w = new BrowserWindow({ width: 420, height: 260, frame: false, resizable: false, show: true, backgroundColor: "#ffffff", icon: path.join(ROOT, "electron", "icon.png") });
  w.loadURL(
    "data:text/html," +
      encodeURIComponent(`<html><body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:Segoe UI,sans-serif;color:#171717">
      <div style="font-size:44px;font-weight:800;letter-spacing:-1px">ALLCON</div>
      <div style="margin-top:12px;color:#737373;font-size:14px">Starting…</div></body></html>`),
  );
  return w;
}

async function boot() {
  const s = secrets();
  const loading = splash();
  try {
    const databaseUrl = await startDatabase(s.pgPassword);
    const workerUrls = await startPythonWorkers(s.authSecret);
    const port = await freePort(47310);
    const appUrl = `http://127.0.0.1:${port}`;
    const env = {
      ...workerUrls,
      NODE_ENV: "production",
      ALLCON_LOCAL: "1",
      ALLCON_STORAGE_DIR: FILES_DIR,
      ALLCON_USER_NAME: process.env.USERNAME || "Me",
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      APP_URL: appUrl,
      BETTER_AUTH_SECRET: s.authSecret,
      // Autodesk isn't used offline; the app only checks these are set.
      APS_CLIENT_ID: "offline",
      APS_CLIENT_SECRET: "offline",
      APS_BUCKET_KEY: "allcon-offline",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    };

    log("Updating the database schema…");
    await runNode([path.join(ROOT, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], env);

    log(`Starting the app server on ${appUrl}…`);
    server = runNode([path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"], env, { wait: false });
    server.on("exit", (code) => {
      log(`App server stopped (${code})`);
      if (!quitting) dialog.showErrorBox("ALLCON", `The app server stopped unexpectedly. See ${LOG}`);
    });
    await waitForPort(port);

    win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 960,
      minHeight: 600,
      show: false,
      title: "ALLCON",
      icon: path.join(ROOT, "electron", "icon.png"),
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      // App pages open in a new ALLCON window; anything else in the default browser.
      if (url.startsWith(appUrl)) return { action: "allow" };
      void shell.openExternal(url);
      return { action: "deny" };
    });
    // Downloads (exports) ask where to save, like a desktop app.
    win.webContents.session.on("will-download", (_e, item) => {
      item.setSaveDialogOptions({ defaultPath: path.join(app.getPath("downloads"), item.getFilename()) });
    });
    await win.loadURL(`${appUrl}/projects`);
    win.maximize();
    win.show();
    loading.close();
  } catch (err) {
    log("Startup failed:", err?.stack ?? String(err));
    loading.close();
    dialog.showErrorBox("ALLCON could not start", `${err?.message ?? err}\n\nDetails: ${LOG}`);
    await shutdown();
    app.exit(1);
  }
}

let quitting = false;
async function shutdown() {
  quitting = true;
  try {
    server?.kill();
  } catch {}
  for (const w of workers) {
    try {
      w.kill();
    } catch {}
  }
  try {
    await pg?.stop();
  } catch {}
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "File", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "quit" }] },
      { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
      { label: "View", submenu: [{ role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }, { type: "separator" }, { role: "togglefullscreen" }, { role: "toggleDevTools" }] },
      { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
    ]),
  );
  app.whenReady().then(boot);
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", async (e) => {
    if (quitting) return;
    e.preventDefault();
    await shutdown();
    app.exit(0);
  });
}
