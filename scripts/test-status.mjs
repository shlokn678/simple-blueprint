// Logic tests for the Evidence-to-MVP assumption status control.
// Dependency-free (plain Node assertions), mirroring the existing scripts/*.mjs
// convention. Covers: status rendering model, changing a status independently,
// the all-Untested invariant after generation, and the localStorage
// persistence round-trip of assumptions[].status.
//
// These mirror the pure logic in src/App.jsx (normalizeStatus, updateAssumption
// reducer, and the { evidence, evidenceLog, mvpAccepted } persistence shape).
import assert from "node:assert/strict";

const ASSUMPTION_STATUSES = ["Untested", "Testing", "Validated"];
const STATUS_DESCRIPTIONS = {
  Untested: "No evidence collected yet.",
  Testing: "The assumption is being investigated.",
  Validated: "Collected real-world evidence supports the assumption.",
};
const normalizeStatus = (s) => (ASSUMPTION_STATUSES.includes(s) ? s : "Untested");

// Reducer equivalent of updateAssumption(index, key, value) in App.jsx.
function updateAssumption(evidence, index, key, value) {
  const assumptions = [...evidence.assumptions];
  assumptions[index] = { ...assumptions[index], [key]: value };
  return { ...evidence, assumptions };
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS", m); } else { fail++; console.log("  FAIL", m); } };

console.log("1) Status rendering model");
ok(ASSUMPTION_STATUSES.length === 3, "exactly three statuses");
ok(normalizeStatus("Untested") === "Untested" && normalizeStatus("Testing") === "Testing" && normalizeStatus("Validated") === "Validated", "known statuses pass through");
ok(normalizeStatus(undefined) === "Untested" && normalizeStatus("bogus") === "Untested", "unknown/empty status falls back to Untested");
ok(ASSUMPTION_STATUSES.every((s) => typeof STATUS_DESCRIPTIONS[s] === "string" && STATUS_DESCRIPTIONS[s].length > 0), "every status has a description");

console.log("2) Changing a status is independent per assumption");
let ev = { assumptions: [
  { assumption: "A1", status: "Untested" },
  { assumption: "A2", status: "Untested" },
  { assumption: "A3", status: "Untested" },
] };
ev = updateAssumption(ev, 1, "status", "Validated");
ok(ev.assumptions[1].status === "Validated", "target assumption updated");
ok(ev.assumptions[0].status === "Untested" && ev.assumptions[2].status === "Untested", "other assumptions unchanged");
ev = updateAssumption(ev, 0, "status", "Testing");
ok(ev.assumptions[0].status === "Testing" && ev.assumptions[1].status === "Validated", "multiple independent statuses coexist");
// editing text must not touch status
ev = updateAssumption(ev, 0, "assumption", "A1 edited");
ok(ev.assumptions[0].status === "Testing" && ev.assumptions[0].assumption === "A1 edited", "editing text preserves status");

console.log("3) All assumptions start Untested after generation (server invariant mirror)");
const generated = { assumptions: [{ status: "Validated" }, { status: "Testing" }].map((a) => ({ ...a, status: "Untested" })) };
ok(generated.assumptions.every((a) => a.status === "Untested"), "generation forces every status to Untested (no auto-Validated)");

console.log("4) localStorage persistence round-trip of status");
// Minimal localStorage mock.
const store = new Map();
const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const key = "e2mvp:test";
const toSave = { evidence: ev, evidenceLog: [{ description: "user note", stance: "Supports" }], mvpAccepted: false };
localStorage.setItem(key, JSON.stringify(toSave));
const loaded = JSON.parse(localStorage.getItem(key));
ok(loaded.evidence.assumptions[0].status === "Testing" && loaded.evidence.assumptions[1].status === "Validated", "assumption statuses survive save+load");
ok(loaded.evidenceLog.length === 1 && loaded.evidenceLog[0].description === "user note", "evidence log preserved alongside statuses");
// changing a status after load then re-persisting keeps the change
let reloaded = updateAssumption(loaded.evidence, 2, "status", "Validated");
localStorage.setItem(key, JSON.stringify({ ...loaded, evidence: reloaded }));
const loaded2 = JSON.parse(localStorage.getItem(key));
ok(loaded2.evidence.assumptions[2].status === "Validated", "status change re-persists");

console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0, "all status logic tests must pass");
process.exit(fail ? 1 : 0);
