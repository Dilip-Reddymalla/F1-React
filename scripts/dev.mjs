// `npm run dev` — runs the F1 ML FastAPI and the Vite dev server together,
// and provisions Python + the Python dependencies on first run (or whenever
// they are missing), including on a fresh hosted server.
//
//   npm run dev
//   -> provisions Python/venv/requirements as needed
//   -> starts FastAPI on http://127.0.0.1:8000
//   -> starts Vite on http://localhost:5173  (proxies /ml -> :8000)
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mlDir = path.join(root, "f1-race-ml");
const reqFile = path.join(mlDir, "requirements.txt");
const venvDir = path.join(mlDir, ".venv");
const isWin = process.platform === "win32";
const venvPy = path.join(venvDir, isWin ? "Scripts/python.exe" : "bin/python");
const stampFile = path.join(venvDir, ".requirements_stamp");
const venvArgs = isWin ? ["-m", "venv"] : ["-m", "venv"];

const log = (msg) => console.log(`\n[dev] ${msg}`);

// ---------------------------------------------------------------------------
// Python detection / installation
// ---------------------------------------------------------------------------
function findPython() {
  const candidates = isWin ? ["python", "py"] : ["python3", "python"];
  for (const c of candidates) {
    const args = isWin && c === "py" ? ["-3", "-c", "import sys; print(sys.version.split()[0])"]
                                      : ["-c", "import sys; print(sys.version.split()[0])"];
    const r = spawnSync(c, args, { encoding: "utf8", timeout: 20000 });
    if (r.status === 0 && r.stdout && !r.error) {
      return { cmd: c, extArgs: isWin && c === "py" ? ["-3"] : [], version: r.stdout.trim() };
    }
  }
  return null;
}

function installPython() {
  log("Python not found — attempting to install it...");
  let cmd, args;
  if (isWin) {
    cmd = "winget";
    args = ["install", "--id", "Python.Python.3.12", "--silent",
            "--accept-package-agreements", "--accept-source-agreements"];
  } else if (process.platform === "darwin") {
    cmd = "brew";
    args = ["install", "python@3.12"];
  } else {
    // Linux
    const useSudo = process.getuid && process.getuid() !== 0;
    cmd = useSudo ? "sudo" : "apt-get";
    args = (useSudo
      ? ["apt-get", "update", "&&", "apt-get", "install", "-y", "python3", "python3-venv", "python3-pip"]
      : ["update", "&&", "apt-get", "install", "-y", "python3", "python3-venv", "python3-pip"]);
  }

  const r = spawnSync(cmd, args, { stdio: "inherit", shell: isWin || process.platform !== "darwin" });
  if (r.status !== 0) {
    throw new Error(
      `Automated Python install failed. Please install Python 3.10+ manually ` +
      `and re-run \`npm run dev\`.`
    );
  }
  const py = findPython();
  if (!py) {
    throw new Error("Python was installed but not found on PATH. Open a new terminal and re-run `npm run dev`.");
  }
  return py;
}

function ensurePython() {
  const py = findPython();
  if (py) {
    log(`Python found (${py.version}) at "${py.cmd}"`);
    return py;
  }
  return installPython();
}

// ---------------------------------------------------------------------------
// Virtualenv + requirements
// ---------------------------------------------------------------------------
function ensureVenv(py) {
  if (fs.existsSync(venvPy)) {
    log(`Virtualenv already exists at .venv`);
    return;
  }
  log("Creating virtualenv (.venv)...");
  const r = spawnSync(py.cmd, [...py.extArgs, ...venvArgs, venvDir], { stdio: "inherit" });
  if (r.status !== 0 || !fs.existsSync(venvPy)) {
    throw new Error("Failed to create the Python virtualenv.");
  }
}

function reqsHash() {
  if (!fs.existsSync(reqFile)) return "no-requirements";
  return createHash("sha256").update(fs.readFileSync(reqFile)).digest("hex");
}

function ensureReqs() {
  const hash = reqsHash();
  if (fs.existsSync(stampFile) && fs.readFileSync(stampFile, "utf8") === hash) {
    log("Python requirements already installed (up to date).");
    return;
  }
  log("Installing Python requirements from requirements.txt...");
  let r = spawnSync(venvPy, ["-m", "pip", "install", "--upgrade", "pip"], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("Failed to upgrade pip.");
  r = spawnSync(venvPy, ["-m", "pip", "install", "-r", reqFile], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("Failed to install Python requirements.");
  fs.writeFileSync(stampFile, hash);
  log("Requirements installed.");
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------
function provision() {
  log("Provisioning the ML runtime...");
  const py = ensurePython();
  ensureVenv(py);
  ensureReqs();
}

// ---------------------------------------------------------------------------
// Run servers
// ---------------------------------------------------------------------------
const children = [];
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log("Stopping all dev servers...");
  for (const c of children) {
    try { c.kill(); } catch {}
  }
  setTimeout(() => process.exit(0), 400);
}

function run(cmd, args, cwd, label) {
  const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: isWin });
  children.push(child);
  child.on("exit", (code) => {
    console.log(`[${label}] exited with code ${code}`);
    shutdown();
  });
  child.on("error", (err) => {
    console.error(`[${label}] failed to start: ${err.message}`);
    shutdown();
  });
  return child;
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  provision();
} catch (err) {
  console.error(`\n[dev] Setup failed: ${err.message}`);
  process.exit(1);
}

const apiOnly = process.argv.includes("--api-only");

log("Starting F1 ML API -> http://127.0.0.1:8000");
run(venvPy, ["src/api/main.py"], mlDir, "ML API");

if (!apiOnly) {
  log("Starting Vite dev server -> http://localhost:5173");
  run("node", ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"], root, "Vite");
  log("Open http://localhost:5173/predictions — data will load as LIVE.\n");
} else {
  log("ML API running. (Vite skipped: --api-only)\n");
}
