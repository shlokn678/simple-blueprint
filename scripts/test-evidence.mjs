// Dev-only integration test for the serverless handler, including the new
// Evidence-to-MVP section. Loads GROQ_API_KEY from .env.local, invokes the
// real handler with mock req/res, and validates the returned shapes against
// the feature's requirements. Never prints the API key.
import { readFileSync } from "node:fs";

// Minimal .env.local loader (no dependency).
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local */ }

if (!process.env.GROQ_API_KEY) {
  console.error("GROQ_API_KEY not found in environment or .env.local");
  process.exit(1);
}

const { default: handler } = await import("../api/generate.js");

function invoke(body) {
  return new Promise((resolve) => {
    const res = {
      _status: 200,
      status(c) { this._status = c; return this; },
      json(obj) { resolve({ status: this._status, body: obj }); return this; },
    };
    handler({ method: "POST", body }, res).catch((e) =>
      resolve({ status: 500, body: { error: "THREW: " + e.message } })
    );
  });
}

const problem = "Students waste their short lunch break waiting in canteen queues.";
const targetUser = "Students with only 40 minutes between lectures.";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS", m); } else { fail++; console.log("  FAIL", m); } };

console.log("1) Full blueprint generation");
const full = await invoke({ problem, targetUser });
ok(full.status === 200, `status 200 (got ${full.status})`);
const bp = full.body;
ok(bp.persona && bp.empathyMap && typeof bp.hmw === "string" && Array.isArray(bp.bom), "has persona/empathyMap/hmw/bom");
const counts = { Must: 0, Should: 0, Could: 0 };
(bp.bom || []).forEach((b) => (counts[b.priority] = (counts[b.priority] || 0) + 1));
ok(bp.bom?.length === 5 && counts.Must === 2 && counts.Should === 2 && counts.Could === 1, `BOM 5 items, 2/2/1 split (got ${JSON.stringify(counts)})`);

console.log("2) Evidence-to-MVP section generation (with BOM context)");
const ev = await invoke({ problem, targetUser, section: "evidenceToMvp", bom: bp.bom });
ok(ev.status === 200, `status 200 (got ${ev.status}) ${ev.status !== 200 ? JSON.stringify(ev.body) : ""}`);
const e = ev.body?.evidenceToMvp;
ok(!!e, "returns evidenceToMvp only");
ok(Object.keys(ev.body || {}).length === 1, "response contains ONLY evidenceToMvp key");
// Nesting: all four properties must be DIRECT children of evidenceToMvp.
ok(e && ["assumptions", "interviewQuestions", "experiment", "mvp"].every((k) => k in e),
  "assumptions/interviewQuestions/experiment/mvp are all INSIDE evidenceToMvp");
ok(!("experiment" in (ev.body || {})) && !("mvp" in (ev.body || {})),
  "experiment/mvp are NOT top-level siblings of evidenceToMvp");
ok(e && e.assumptions.length >= 3 && e.assumptions.length <= 5, `3-5 assumptions (got ${e?.assumptions?.length})`);
ok(e && e.assumptions.every((a) => a.status === "Untested"), "all assumptions forced to Untested");
ok(e && e.interviewQuestions.length >= 5 && e.interviewQuestions.length <= 7, `5-7 interview questions (got ${e?.interviewQuestions?.length})`);
// Experiment: all 7 fields present and non-empty.
const EXP_FIELDS = ["hypothesis", "participants", "steps", "measurements", "successCriterion", "effort", "limitations"];
ok(e && e.experiment && EXP_FIELDS.every((f) => f in e.experiment), "experiment has all 7 fields");
ok(e && e.experiment && e.experiment.steps.length >= 1 && e.experiment.successCriterion, "experiment has steps + success criterion");
ok(e && e.mvp && e.mvp.features.length === 5, `MVP has 5 features (got ${e?.mvp?.features?.length})`);
// MVP features must reuse the existing BOM feature names verbatim.
const bomNames = new Set((bp.bom || []).map((b) => b.feature));
ok(e && e.mvp && e.mvp.features.every((f) => bomNames.has(f.feature)),
  "all 5 MVP feature names reuse the existing BOM names verbatim");
ok(e && Array.isArray(e.mvp.coreSubset) && e.mvp.coreSubset.length >= 1 && e.mvp.recommendation, "MVP has coreSubset + recommendation");

console.log("3) Invalid section is rejected");
const bad = await invoke({ problem, targetUser, section: "nonsense" });
ok(bad.status === 400, `unknown section -> 400 (got ${bad.status})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
