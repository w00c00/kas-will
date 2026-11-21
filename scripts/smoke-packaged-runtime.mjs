import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

async function verifyService(base) {
  const url = new URL(base);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Smoke tests must use loopback");
  const get = async (endpoint) => {
    const response = await fetch(`${base}${endpoint}`, { signal: AbortSignal.timeout(5000) });
    assert.ok(response.ok, `HTTP ${response.status}: ${endpoint}`);
    return response.json();
  };
  const config = await get("/api/config");
  assert.equal(config.appVersion, JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url))).version);
  assert.equal(config.mainnetAudited, false);
  assert.ok(config.preflight.localEngineConfigured, "Packaged local engine is unavailable");
  const { templates } = await get("/api/templates");
  const template = templates.find((item) => item.id === "inheritance-vault");
  assert.equal(template.compilerProfileId, "stable-1.0.0");
  assert.ok(templates.some((item) => item.id === "kcc20-final-inheritance-vault"));
  const { token } = await get("/api/session");
  const response = await fetch(`${base}/api/contracts/compile`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-studio-token": token, origin: base },
    body: JSON.stringify({ source: template.source, constructorArgs: template.constructorArgs, compilerProfileId: template.compilerProfileId }),
    signal: AbortSignal.timeout(65_000)
  });
  const result = await response.json();
  assert.ok(response.ok, result.error || "Packaged compilation failed");
  assert.equal(result.artifact.compiler.upstreamCommit, "3ed973335b59269293564805cc2c58a14595ec03");
  assert.ok(result.artifact.programHex.length > 0);
  console.log("Packaged service, Final template, local engine and actual stable compilation: PASS. No wallet or chain transaction.");
}

if (String(process.argv[2] || "").startsWith("http:")) {
  await verifyService(process.argv[2]);
} else {
  const nodeBinary = path.resolve(process.argv[2] || ""), runtime = path.resolve(process.argv[3] || "");
  assert.ok(fs.statSync(nodeBinary).isFile(), "Packaged Node binary is missing");
  assert.ok(fs.existsSync(path.join(runtime, "server/index.mjs")), "Packaged service is missing");
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kas-will-package-smoke-"));
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port), KAS_WILL_DATA_DIR: directory };
  const suffix = process.platform === "win32" ? ".exe" : "";
  for (const [key, name] of Object.entries({ SILVERC_STABLE_BIN: "silverc-1.0.0", SILVERC_LATEST_BIN: "silverc-latest",
    SILVERC_PREVIOUS_BIN: "silverc-14dce9a", SILVERC_OLDER_BIN: "silverc-6f9e078", SILVERC_CB34AA5_BIN: "silverc-cb34aa5",
    SILVERC_LEGACY_BIN: "silverc-legacy", KASCOV_PREFLIGHT_BIN: "kascov-preflight" })) env[key] = path.join(runtime, "bin", `${name}${suffix}`);
  const child = spawn(nodeBinary, [path.join(runtime, "server/index.mjs")], { cwd: runtime, env, stdio: "ignore" });
  let startupError;
  child.on("error", (error) => { startupError = error; });
  try {
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (startupError) throw startupError;
      assert.equal(child.exitCode, null, "Packaged service exited during startup");
      try { ready = (await (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).json()).ok; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, "Packaged service did not become healthy");
    await verifyService(base);
  } finally {
    if (child.exitCode === null && !startupError) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
      await exited; clearTimeout(timeout);
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
