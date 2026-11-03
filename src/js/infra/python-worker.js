// Web Worker do modo navegador (GitHub Pages): roda o backend Python (pasta backend/)
// com Pyodide, sem servidor. O banco SQLite fica em /data, persistido no IndexedDB.
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

const BACKEND_FILES = ["__init__", "errors", "config", "database", "security", "audit", "accounts", "state", "demo", "http_app", "browser_app"];
const DATA_DIR = "/data";

const syncfs = (pyodide, populate) => new Promise((resolve, reject) => pyodide.FS.syncfs(populate, (error) => (error ? reject(error) : resolve())));

async function start() {
  const pyodide = await loadPyodide();
  const persistent = Boolean(pyodide.FS.filesystems.IDBFS);
  pyodide.FS.mkdirTree(DATA_DIR);
  if (persistent) {
    pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, DATA_DIR);
    await syncfs(pyodide, true);
  }
  pyodide.FS.mkdirTree("/app/backend");
  await Promise.all(BACKEND_FILES.map(async (name) => {
    const response = await fetch(new URL(`../../../backend/${name}.py`, import.meta.url), { cache: "no-cache" });
    if (!response.ok) throw new Error(`backend/${name}.py não encontrado (${response.status}).`);
    pyodide.FS.writeFile(`/app/backend/${name}.py`, await response.text());
  }));
  pyodide.runPython(`import os, sys\nos.environ["NUMBER_OPS_BROWSER"] = "1"\nos.environ["NUMBER_OPS_DATA_DIR"] = "${DATA_DIR}"\nsys.path.insert(0, "/app")`);
  const bridge = pyodide.pyimport("backend.browser_app");
  bridge.boot();
  if (persistent) await syncfs(pyodide, false);
  return { pyodide, bridge, persistent };
}

const ready = start();
let queue = Promise.resolve();

// Uma requisição por vez, como uma transação do servidor; depois grava o banco no IndexedDB.
self.onmessage = ({ data }) => { queue = queue.then(() => handle(data)); };

async function handle({ id, method, path, headers, body }) {
  try {
    const { pyodide, bridge, persistent } = await ready;
    const result = JSON.parse(bridge.handle(method, path, JSON.stringify(headers), body));
    if (persistent) await syncfs(pyodide, false);
    self.postMessage({ id, ...result });
  } catch (error) {
    self.postMessage({ id, failure: String(error?.message || error) });
  }
}
