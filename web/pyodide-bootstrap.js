// Loads Pyodide, unpacks py.zip (engine + players + webglue) and returns a tiny bridge.
// Everything crosses as JSON: arena.call("name", ...args) JSON-encodes each argument,
// calls webglue.name(...) in Python and JSON-decodes the result.

export const PYODIDE_VERSION = "0.27.2";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const ARENA_DIR = "/home/pyodide/arena";

export async function startArena(onStatus = () => {}) {
  onStatus("loading_python");
  const { loadPyodide } = await import(`${PYODIDE_URL}pyodide.mjs`);
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });

  onStatus("loading_arena");
  const response = await fetch("py.zip", { cache: "no-cache" });
  if (!response.ok) throw new Error(`py.zip: HTTP ${response.status}`);
  return setUpArena(pyodide, await response.arrayBuffer(), onStatus);
}

// Shared with the Node smoke test (tests/js/pyodide_smoke.mjs), which brings its own Pyodide.
export async function setUpArena(pyodide, zipBuffer, onStatus = () => {}) {
  onStatus("loading_packages");
  await pyodide.loadPackage("pyyaml");
  pyodide.unpackArchive(zipBuffer, "zip", { extractDir: ARENA_DIR });
  pyodide.runPython(`import sys; sys.path.insert(0, "${ARENA_DIR}")`);
  const glue = pyodide.pyimport("webglue");

  return {
    call(name, ...args) {
      const fn = glue[name];
      if (!fn) throw new Error(`webglue has no function ${name}`);
      try {
        return JSON.parse(fn(...args.map((arg) => JSON.stringify(arg))));
      } finally {
        fn.destroy();
      }
    },
  };
}
