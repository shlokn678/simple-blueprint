import { useState, useRef, useLayoutEffect, useEffect } from "react";

const EVIDENCE_SOURCES = ["Interview", "Observation", "Experiment", "Other"];
const EVIDENCE_STANCES = ["Supports", "Contradicts", "Inconclusive"];
const ASSUMPTION_STATUSES = ["Untested", "Testing", "Validated"];

// Human-readable meaning of each assumption status. Shown as help text and
// as the title (hover tooltip) on the status selector.
const STATUS_DESCRIPTIONS = {
  Untested: "No evidence collected yet.",
  Testing: "The assumption is being investigated.",
  Validated: "Collected real-world evidence supports the assumption.",
};

function normalizeStatus(status) {
  return ASSUMPTION_STATUSES.includes(status) ? status : "Untested";
}

// A single, clearly-interactive status selector. The closed control shows the
// currently selected value (coloured by status) with a dropdown caret, so
// there is no separate "blank" control and no duplicated label.
function StatusSelect({ status, label, onChange }) {
  const value = normalizeStatus(status);
  return (
    <select
      className={`status-select status-${value.toLowerCase()}`}
      value={value}
      aria-label={label}
      title={`${value}: ${STATUS_DESCRIPTIONS[value]}`}
      onChange={(e) => onChange(e.target.value)}
    >
      {ASSUMPTION_STATUSES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

function emptyEvidence() {
  return {
    description: "",
    source: "Interview",
    date: "",
    relatedAssumption: "",
    interpretation: "",
    stance: "Inconclusive",
  };
}

// Textarea that grows vertically to fit its content so no internal
// scrollbar appears. Resizes on mount, whenever `value` changes (e.g. after
// AI generation or adding a point), and on every edit.
function AutoTextarea({ value, className, ...rest }) {
  const ref = useRef(null);

  function resize(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useLayoutEffect(() => {
    resize(ref.current);
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      rows={1}
      onInput={(e) => resize(e.target)}
      {...rest}
    />
  );
}

const EXAMPLES = [
  {
    label: "Library fines",
    problem: "Students forget library book due-dates and receive avoidable fines.",
    user: "Busy final-year engineering students managing several deadlines.",
  },
  {
    label: "Canteen queues",
    problem: "Students waste their short lunch break waiting in canteen queues.",
    user: "Students with only 40 minutes between lectures.",
  },
  {
    label: "Lab equipment",
    problem: "Students cannot see which shared lab equipment is available.",
    user: "CS and AI students working on project assignments.",
  },
];

const LABELS = { says: "Says", thinks: "Thinks", does: "Does", feels: "Feels" };

function EditableList({ items, onChange }) {
  return (
    <div className="edit-list">
      {items.map((item, index) => (
        <div className="edit-row" key={index}>
          <AutoTextarea
            value={item}
            aria-label={`Point ${index + 1}`}
            onChange={(e) => { const next = [...items]; next[index] = e.target.value; onChange(next); }}
          />
          <button type="button" className="remove" aria-label={`Remove point ${index + 1}`} title="Remove point" onClick={() => onChange(items.filter((_, i) => i !== index))}>×</button>
        </div>
      ))}
      <button type="button" className="add" onClick={() => onChange([...items, "New point"])}>+ Add point</button>
    </div>
  );
}

// Per-section "Regenerate" control. Shows a loading label while this section
// is regenerating and disables itself (and during any other section's run) to
// prevent duplicate requests.
function RegenButton({ section, label, loading, busy, dark, onClick }) {
  return (
    <button
      type="button"
      className={dark ? "regen regen-dark" : "regen"}
      onClick={() => onClick(section)}
      disabled={busy}
      aria-busy={loading}
      aria-label={`Regenerate ${label}`}
      title={`Regenerate ${label}`}
    >
      {loading ? "Regenerating…" : "↻ Regenerate"}
    </button>
  );
}

export default function App() {
  const [problem, setProblem] = useState("");
  const [targetUser, setTargetUser] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState("");
  // Section being regenerated right now (null = none), and the last
  // regeneration error keyed by section so each card can show its own.
  const [regenSection, setRegenSection] = useState(null);
  const [regenError, setRegenError] = useState({});
  const [exportError, setExportError] = useState("");
  // Set when the provider quota is exhausted (HTTP 429 / QUOTA_EXHAUSTED).
  // Retrying immediately won't help, so the UI reflects that distinctly.
  const [quotaExhausted, setQuotaExhausted] = useState(false);

  // Evidence-to-MVP state.
  // `evidence` holds AI-generated proposals: assumptions, interviewQuestions,
  // experiment, mvp. `evidenceLog` holds ONLY user-recorded evidence entries.
  const [evidence, setEvidence] = useState(null);
  const [evidenceLog, setEvidenceLog] = useState([]);
  const [evidenceStatus, setEvidenceStatus] = useState("idle"); // idle|loading|done|error
  const [evidenceError, setEvidenceError] = useState("");
  const [mvpAccepted, setMvpAccepted] = useState(false); // did the user accept the proposed BOM changes
  const [saveNote, setSaveNote] = useState(""); // transient "Saved" indicator

  // --- Minimal localStorage persistence, keyed to the current idea ---
  // Only used in the browser. No database, no auth. We persist the generated
  // Evidence-to-MVP proposals and the user's evidence log so a refresh keeps
  // them. User-recorded evidence is never overwritten by generation.
  function storageKey(p, u) {
    try {
      return "e2mvp:" + btoa(unescape(encodeURIComponent(`${p}\u0000${u}`))).slice(0, 120);
    } catch {
      return null;
    }
  }
  const persistKey = result ? storageKey(result.problem, result.targetUser) : null;

  // Load persisted Evidence-to-MVP data whenever the active idea changes.
  useEffect(() => {
    if (!persistKey || typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setEvidence(saved.evidence ?? null);
        setEvidenceLog(Array.isArray(saved.evidenceLog) ? saved.evidenceLog : []);
        setMvpAccepted(Boolean(saved.mvpAccepted));
        setEvidenceStatus(saved.evidence ? "done" : "idle");
      } else {
        setEvidence(null);
        setEvidenceLog([]);
        setMvpAccepted(false);
        setEvidenceStatus("idle");
      }
      setEvidenceError("");
    } catch {
      /* ignore corrupt storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // Persist on change (debounced via a short timer) and show a "Saved" note.
  useEffect(() => {
    if (!persistKey || typeof localStorage === "undefined") return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(
          persistKey,
          JSON.stringify({ evidence, evidenceLog, mvpAccepted })
        );
        if (evidence || evidenceLog.length) {
          setSaveNote("Saved to this browser");
          setTimeout(() => setSaveNote(""), 1200);
        }
      } catch {
        /* storage may be full or unavailable; non-fatal */
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence, evidenceLog, mvpAccepted, persistKey]);

  function chooseExample(example) {
    setProblem(example.problem);
    setTargetUser(example.user);
    setResult(null);
    setStatus("idle");
    setMessage("");
  }

  async function generate() {
    if (problem.trim().length < 8 || targetUser.trim().length < 5) {
      setMessage("Please enter a clear problem and target user.");
      return;
    }
    setStatus("loading");
    setMessage("");
    setQuotaExhausted(false);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem, targetUser }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429 || data.code === "QUOTA_EXHAUSTED") {
          setQuotaExhausted(true);
        }
        throw new Error(data.error || "Generation failed.");
      }
      setResult({ ...data, problem, targetUser });
      setStatus("done");
      setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 40);
    } catch (error) {
      setMessage(error.message || "Could not generate the blueprint.");
      setStatus("error");
    }
  }

  // Regenerate a single section without touching the others. Uses the same
  // problem/targetUser that produced the current blueprint so the new section
  // stays in context. Only the returned key is merged into `result`.
  async function regenerate(section) {
    // Prevent duplicate requests while one is already in flight.
    if (!result || regenSection) return;
    setRegenSection(section);
    setRegenError((old) => ({ ...old, [section]: "" }));
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: result.problem,
          targetUser: result.targetUser,
          section,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429 || data.code === "QUOTA_EXHAUSTED") {
          setQuotaExhausted(true);
        }
        throw new Error(data.error || "Regeneration failed.");
      }
      if (!(section in data)) throw new Error("Unexpected response.");
      // Merge only the regenerated section; everything else is preserved.
      setResult((old) => ({ ...old, [section]: data[section] }));
      setQuotaExhausted(false);
    } catch (error) {
      setRegenError((old) => ({
        ...old,
        [section]: error.message || "Could not regenerate this section.",
      }));
    } finally {
      setRegenSection(null);
    }
  }

  // Generate the Evidence-to-MVP section. Dedicated section request that
  // sends the current BOM for context. Preserves the user's evidence log and
  // any assumption-status edits where possible; never regenerates the whole
  // blueprint. Guards against duplicate requests.
  async function generateEvidence() {
    if (!result || evidenceStatus === "loading") return;
    setEvidenceStatus("loading");
    setEvidenceError("");
    setQuotaExhausted(false);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: result.problem,
          targetUser: result.targetUser,
          section: "evidenceToMvp",
          bom: result.bom,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429 || data.code === "QUOTA_EXHAUSTED") {
          setQuotaExhausted(true);
        }
        throw new Error(data.error || "Generation failed.");
      }
      if (!data.evidenceToMvp) throw new Error("Unexpected response.");
      // Replace generated proposals (assumptions/questions/experiment/mvp).
      // The user's evidence log is kept untouched. A fresh proposal resets
      // the "accepted" flag so BOM changes must be re-accepted.
      setEvidence(data.evidenceToMvp);
      setMvpAccepted(false);
      setEvidenceStatus("done");
      setQuotaExhausted(false);
    } catch (error) {
      setEvidenceError(error.message || "Could not generate Evidence-to-MVP.");
      setEvidenceStatus("error");
    }
  }

  // Assumption helpers (edit text + status).
  function updateAssumption(index, key, value) {
    setEvidence((old) => {
      const assumptions = [...old.assumptions];
      assumptions[index] = { ...assumptions[index], [key]: value };
      return { ...old, assumptions };
    });
  }
  function updateInterviewQuestions(questions) {
    setEvidence((old) => ({ ...old, interviewQuestions: questions }));
  }

  // Evidence-log helpers (user-recorded only).
  function addEvidence() {
    setEvidenceLog((old) => [...old, emptyEvidence()]);
  }
  function updateEvidenceEntry(index, key, value) {
    setEvidenceLog((old) => {
      const next = [...old];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }
  function removeEvidenceEntry(index) {
    setEvidenceLog((old) => old.filter((_, i) => i !== index));
  }

  // Apply the proposed MVP priorities back onto the real BOM. Only runs when
  // the user explicitly accepts — the BOM is never changed silently.
  function acceptMvpChanges() {
    if (!evidence?.mvp?.features || !result?.bom) return;
    setResult((old) => {
      const bom = old.bom.map((row, i) => {
        const proposed = evidence.mvp.features[i];
        if (!proposed) return row;
        return {
          ...row,
          feature: proposed.feature || row.feature,
          priority: proposed.priority || row.priority,
          note: proposed.dependency ? proposed.dependency : row.note,
        };
      });
      return { ...old, bom };
    });
    setMvpAccepted(true);
  }

  function updatePersona(key, value) { setResult((old) => ({ ...old, persona: { ...old.persona, [key]: value } })); }
  function updateEmpathy(key, value) { setResult((old) => ({ ...old, empathyMap: { ...old.empathyMap, [key]: value } })); }
  function updateBom(index, key, value) { setResult((old) => { const bom = [...old.bom]; bom[index] = { ...bom[index], [key]: value }; return { ...old, bom }; }); }

  function newIdea() {
    setProblem(""); setTargetUser(""); setResult(null); setStatus("idle"); setMessage(""); setCopied(false); setNotes("");
    setEvidence(null); setEvidenceLog([]); setEvidenceStatus("idle"); setEvidenceError(""); setMvpAccepted(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function copySummary() {
    if (!result) return;
    const text = [
      "BLUEPRINT CO-PILOT — STUDENT-REVIEWED DRAFT",
      `Problem: ${result.problem}`,
      `Target user: ${result.targetUser}`,
      `Persona: ${result.persona.name} — ${result.persona.tagline}`,
      `Quote: ${result.persona.quote}`,
      `Goals: ${result.persona.goals.join("; ")}`,
      `Pain points: ${result.persona.painPoints.join("; ")}`,
      "",
      "EMPATHY MAP",
      ...Object.keys(LABELS).map((key) => `${LABELS[key]}: ${result.empathyMap[key].join("; ")}`),
      "",
      `HOW MIGHT WE: ${result.hmw}`,
      "",
      "MVP BILL OF MATERIALS",
      ...result.bom.map((item, i) => `${i + 1}. [${item.priority}] ${item.feature} — ${item.note}`),
      notes ? `\nVALIDATION NOTES: ${notes}` : "",
      ...(evidence
        ? [
            "",
            "EVIDENCE-TO-MVP (AI proposals — not validated research)",
            "Assumptions:",
            ...evidence.assumptions.map(
              (a, i) => `  ${i + 1}. [${a.status}] ${a.assumption} (risk if wrong: ${a.riskIfWrong})`
            ),
            "Interview questions:",
            ...evidence.interviewQuestions.map((q, i) => `  ${i + 1}. ${q}`),
            "Proposed experiment:",
            `  Hypothesis: ${evidence.experiment.hypothesis}`,
            `  Participants: ${evidence.experiment.participants}`,
            `  Steps: ${evidence.experiment.steps.join(" | ")}`,
            `  Measure: ${evidence.experiment.measurements}`,
            `  Suggested success criterion: ${evidence.experiment.successCriterion}`,
            `  Effort: ${evidence.experiment.effort}`,
            `  Limitations: ${evidence.experiment.limitations}`,
            `MVP recommendation (${mvpAccepted ? "accepted" : "provisional"}): ${evidence.mvp.recommendation}`,
            `  Core subset: ${evidence.mvp.coreSubset.join("; ")}`,
          ]
        : []),
      ...(evidenceLog.length
        ? [
            "",
            "EVIDENCE LOG (user-recorded)",
            ...evidenceLog.map(
              (e, i) =>
                `  ${i + 1}. [${e.stance}] ${e.description} — source: ${e.source}${e.date ? `, ${e.date}` : ""}${e.relatedAssumption ? `, re: ${e.relatedAssumption}` : ""}${e.interpretation ? ` → ${e.interpretation}` : ""}`
            ),
          ]
        : []),
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Export the blueprint as a PDF using the browser's native print-to-PDF.
  // No AI/API call is made: the print layout is rendered from current React
  // state, so manual edits and section regenerations are captured as shown.
  // The browser uses document.title as the default PDF filename.
  function exportPDF() {
    if (!result) return;
    setExportError("");
    if (typeof window === "undefined" || typeof window.print !== "function") {
      setExportError("PDF export is not supported in this browser. Try your browser's Print option.");
      return;
    }
    const slug = (result.problem || "blueprint")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "blueprint";
    const date = new Date().toISOString().slice(0, 10);
    const previousTitle = document.title;
    document.title = `blueprint-co-pilot-${slug}-${date}`;
    try {
      window.print();
    } catch (error) {
      console.error("PDF export failed:", error);
      setExportError("Could not open the print dialog. Please try again or use your browser's Print option.");
    } finally {
      document.title = previousTitle;
    }
  }

  return (
    <main className="page"><div className="container">
      <header className="top"><div><div className="brand"><span>B</span> Blueprint Co-Pilot</div><p>Design Thinking Co-Pilot for Students</p></div><small>Live AI · Editable draft</small></header>
      <section className="hero"><p className="eyebrow">DESIGN THINKING COURSEWORK</p><h1>From a rough idea<br /><i>to a reviewable blueprint.</i></h1><p>Generate a structured first draft, then review and refine it yourself.</p></section>
      <section className="form-card"><div className="heading"><div><label>01</label><h2>Start with an idea</h2></div><em>Choose an example or write your own.</em></div><div className="examples">{EXAMPLES.map((example) => <button type="button" key={example.label} onClick={() => chooseExample(example)}>{example.label}</button>)}</div><div className="fields"><label>Problem / idea<textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="What problem are you trying to solve?" /></label><label>Target user<textarea value={targetUser} onChange={(e) => setTargetUser(e.target.value)} placeholder="Who experiences this problem?" /></label></div>{message && <p className={quotaExhausted ? "error error-quota" : "error"}>{message}</p>}<button type="button" className="generate" onClick={generate} disabled={status === "loading"}>{status === "loading" ? "Generating with AI..." : quotaExhausted ? "Try again (quota exhausted)" : status === "error" ? "Retry generation" : "Generate draft blueprint →"}</button></section>
      {status === "done" && result && <section id="results" className="results"><div className="result-heading"><div><label>02</label><h2>Draft blueprint</h2><p>AI-generated output. Treat it as a hypothesis, not validated research.</p></div><div className="actions"><button type="button" onClick={copySummary}>{copied ? "Copied" : "Copy summary"}</button><button type="button" onClick={exportPDF}>Export PDF</button><button type="button" onClick={newIdea}>New idea</button></div></div>{exportError && <p className="error">{exportError}</p>}<div className="input-summary"><b>Problem</b><span>{result.problem}</span><b>Target user</b><span>{result.targetUser}</span></div><div className="two"><article className={regenSection === "persona" ? "card regenerating" : "card"}><div className="card-head"><label>PERSONA · EDITABLE</label><RegenButton section="persona" label="Persona" loading={regenSection === "persona"} busy={regenSection !== null} onClick={regenerate} /></div>{regenError.persona && <p className="error">{regenError.persona}</p>}<input className="title-input" value={result.persona.name} onChange={(e) => updatePersona("name", e.target.value)} /><AutoTextarea className="sub-input" value={result.persona.tagline} aria-label="Persona tagline" onChange={(e) => updatePersona("tagline", e.target.value)} /><textarea className="quote" value={result.persona.quote} onChange={(e) => updatePersona("quote", e.target.value)} /><div className="columns"><div><b>Goals</b><EditableList items={result.persona.goals} onChange={(v) => updatePersona("goals", v)} /></div><div><b>Pain points</b><EditableList items={result.persona.painPoints} onChange={(v) => updatePersona("painPoints", v)} /></div></div></article><article className={regenSection === "hmw" ? "card black regenerating" : "card black"}><div className="card-head"><label>HOW MIGHT WE · EDITABLE</label><RegenButton section="hmw" label="How Might We" loading={regenSection === "hmw"} busy={regenSection !== null} dark onClick={regenerate} /></div>{regenError.hmw && <p className="error error-dark">{regenError.hmw}</p>}<textarea value={result.hmw} onChange={(e) => setResult({ ...result, hmw: e.target.value })} /><p>Review this question before accepting it.</p></article></div><article className={regenSection === "empathyMap" ? "card regenerating" : "card"}><div className="card-head"><label>EMPATHY MAP · EDITABLE</label><RegenButton section="empathyMap" label="Empathy Map" loading={regenSection === "empathyMap"} busy={regenSection !== null} onClick={regenerate} /></div><h3>Understanding the user</h3>{regenError.empathyMap && <p className="error">{regenError.empathyMap}</p>}<div className="map">{Object.entries(LABELS).map(([key, label]) => <div key={key}><b>{label}</b><EditableList items={result.empathyMap[key]} onChange={(v) => updateEmpathy(key, v)} /></div>)}</div></article><article className={regenSection === "bom" ? "card regenerating" : "card"}><div className="card-head"><label>MVP BILL OF MATERIALS · EDITABLE</label><RegenButton section="bom" label="MVP Bill of Materials" loading={regenSection === "bom"} busy={regenSection !== null} onClick={regenerate} /></div><h3>Prioritized feature list</h3>{regenError.bom && <p className="error">{regenError.bom}</p>}<div className="bom">{result.bom.map((item, index) => <div className="bom-row" key={index}><span className="bom-num">{index + 1}</span><label className="bom-field"><span className="bom-label">Feature</span><AutoTextarea value={item.feature} aria-label={`Feature ${index + 1}`} onChange={(e) => updateBom(index, "feature", e.target.value)} /></label><label className="bom-field bom-priority"><span className="bom-label">Priority</span><select value={item.priority} aria-label={`Priority ${index + 1}`} onChange={(e) => updateBom(index, "priority", e.target.value)}><option>Must</option><option>Should</option><option>Could</option></select></label><label className="bom-field"><span className="bom-label">Note</span><AutoTextarea value={item.note} aria-label={`Note ${index + 1}`} onChange={(e) => updateBom(index, "note", e.target.value)} /></label></div>)}</div></article><article className="card"><label>VALIDATION NOTES</label><h3>What would you verify with real students?</h3><p className="help">AI output is a draft. Note one assumption you would check through interviews or observation.</p><textarea className="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Example: I would ask three students whether this pain point is real." /></article>
      <article className="card e2mvp">
        <div className="card-head"><label>03 · EVIDENCE-TO-MVP</label>{evidence && evidenceStatus !== "loading" && <button type="button" className="regen" onClick={generateEvidence} aria-busy={false} title="Regenerate Evidence-to-MVP">↻ Regenerate</button>}</div>
        <h3>From assumptions to a testable MVP</h3>
        <p className="help">AI-proposed hypotheses to plan research. Nothing here is validated until you record real evidence. Flow: identify assumptions → plan interviews → design an experiment → log evidence → refine the MVP.{saveNote && <span className="save-note"> · {saveNote}</span>}</p>

        {evidenceStatus !== "done" && (
          <div className="e2mvp-empty">
            {evidenceStatus === "loading" ? (
              <p className="help">Generating assumptions, interview questions and a validation experiment…</p>
            ) : (
              <>
                <p className="help">Generate assumptions, interview questions, a validation experiment and an evidence-informed MVP recommendation from your current blueprint.</p>
                <button type="button" className="generate" onClick={generateEvidence} disabled={evidenceStatus === "loading"}>{quotaExhausted ? "Try again (quota exhausted)" : "Generate Evidence-to-MVP →"}</button>
              </>
            )}
            {evidenceError && <p className={quotaExhausted ? "error error-quota" : "error"}>{evidenceError}</p>}
          </div>
        )}

        {evidenceStatus === "done" && evidence && (
          <div className={evidenceStatus === "loading" ? "e2mvp-body regenerating" : "e2mvp-body"}>
            {evidenceError && <p className={quotaExhausted ? "error error-quota" : "error"}>{evidenceError}</p>}

            {/* A. Assumptions */}
            <div className="e2mvp-sub">
              <h4>Assumptions <span className="count">{evidence.assumptions.length}</span></h4>
              <p className="help">Highest-risk first. AI starts everything as Untested — only you can move an assumption forward as you gather evidence.</p>
              <ul className="status-legend" aria-label="What each status means">
                <li><span className="badge badge-untested">Untested</span> {STATUS_DESCRIPTIONS.Untested}</li>
                <li><span className="badge badge-testing">Testing</span> {STATUS_DESCRIPTIONS.Testing}</li>
                <li><span className="badge badge-validated">Validated</span> {STATUS_DESCRIPTIONS.Validated}</li>
              </ul>
              <div className="assume-list">
                {evidence.assumptions.map((a, i) => (
                  <div className="assume" key={i}>
                    <div className="assume-top">
                      <AutoTextarea className="assume-title" value={a.assumption} aria-label={`Assumption ${i + 1}`} onChange={(e) => updateAssumption(i, "assumption", e.target.value)} />
                      <div className="status-pick"><span className="mini-label">Status</span><StatusSelect status={a.status} label={`Status for assumption ${i + 1}`} onChange={(v) => updateAssumption(i, "status", v)} /></div>
                    </div>
                    <div className="assume-grid">
                      <label><span className="mini-label">Why it matters</span><AutoTextarea value={a.whyItMatters} onChange={(e) => updateAssumption(i, "whyItMatters", e.target.value)} /></label>
                      <label><span className="mini-label">Risk if wrong</span><AutoTextarea value={a.riskIfWrong} onChange={(e) => updateAssumption(i, "riskIfWrong", e.target.value)} /></label>
                      <label><span className="mini-label">How to test</span><AutoTextarea value={a.howToTest} onChange={(e) => updateAssumption(i, "howToTest", e.target.value)} /></label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* B. Interview questions */}
            <div className="e2mvp-sub">
              <h4>User interview questions <span className="count">{evidence.interviewQuestions.length}</span></h4>
              <p className="help">Open-ended and non-leading. Edit freely to fit how you'll actually interview.</p>
              <EditableList items={evidence.interviewQuestions} onChange={updateInterviewQuestions} />
            </div>

            {/* C. Validation experiment */}
            <div className="e2mvp-sub">
              <h4>Validation experiment</h4>
              <p className="help">A small test to run before building the full solution. The success criterion is a <b>suggested</b> threshold, not a result.</p>
              <div className="exp-grid">
                <label><span className="mini-label">Hypothesis</span><AutoTextarea value={evidence.experiment.hypothesis} onChange={(e) => setEvidence((o) => ({ ...o, experiment: { ...o.experiment, hypothesis: e.target.value } }))} /></label>
                <label><span className="mini-label">Participants</span><AutoTextarea value={evidence.experiment.participants} onChange={(e) => setEvidence((o) => ({ ...o, experiment: { ...o.experiment, participants: e.target.value } }))} /></label>
                <div className="exp-steps"><span className="mini-label">Steps</span><EditableList items={evidence.experiment.steps} onChange={(v) => setEvidence((o) => ({ ...o, experiment: { ...o.experiment, steps: v } }))} /></div>
                <label><span className="mini-label">What to measure / observe</span><AutoTextarea value={evidence.experiment.measurements} onChange={(e) => setEvidence((o) => ({ ...o, experiment: { ...o.experiment, measurements: e.target.value } }))} /></label>
                <label><span className="mini-label">Suggested success criterion</span><AutoTextarea value={evidence.experiment.successCriterion} onChange={(e) => setEvidence((o) => ({ ...o, experiment: { ...o.experiment, successCriterion: e.target.value } }))} /></label>
                <label><span className="mini-label">Approx. effort</span><AutoTextarea value={evidence.experiment.effort} onChange={(e) => setEvidence((o) => ({ ...o, experiment: { ...o.experiment, effort: e.target.value } }))} /></label>
                <label><span className="mini-label">Limitations</span><AutoTextarea value={evidence.experiment.limitations} onChange={(e) => setEvidence((o) => ({ ...o, experiment: { ...o.experiment, limitations: e.target.value } }))} /></label>
              </div>
            </div>

            {/* D. Evidence log (user-recorded) */}
            <div className="e2mvp-sub">
              <h4>Evidence log <span className="count">{evidenceLog.length}</span></h4>
              <p className="help">Only entries you record here count as collected evidence. Saved to this browser.</p>
              {evidenceLog.length === 0 && <p className="help muted">No evidence recorded yet. Add an entry after you talk to real users or run the experiment.</p>}
              {evidenceLog.map((e, i) => (
                <div className="evi" key={i}>
                  <div className="evi-head"><span className="mini-label">Entry {i + 1}</span><button type="button" className="remove" aria-label={`Remove evidence ${i + 1}`} title="Remove entry" onClick={() => removeEvidenceEntry(i)}>×</button></div>
                  <label><span className="mini-label">Observation / description</span><AutoTextarea value={e.description} onChange={(ev) => updateEvidenceEntry(i, "description", ev.target.value)} /></label>
                  <div className="evi-grid">
                    <label><span className="mini-label">Source</span><select value={e.source} onChange={(ev) => updateEvidenceEntry(i, "source", ev.target.value)}>{EVIDENCE_SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
                    <label><span className="mini-label">Date</span><input type="date" value={e.date} onChange={(ev) => updateEvidenceEntry(i, "date", ev.target.value)} /></label>
                    <label><span className="mini-label">Supports / contradicts?</span><select value={e.stance} onChange={(ev) => updateEvidenceEntry(i, "stance", ev.target.value)}>{EVIDENCE_STANCES.map((s) => <option key={s}>{s}</option>)}</select></label>
                  </div>
                  <label><span className="mini-label">Related assumption</span><select value={e.relatedAssumption} onChange={(ev) => updateEvidenceEntry(i, "relatedAssumption", ev.target.value)}><option value="">— none —</option>{evidence.assumptions.map((a, ai) => <option key={ai} value={a.assumption}>{`A${ai + 1}: ${a.assumption.slice(0, 60)}`}</option>)}</select></label>
                  <label><span className="mini-label">Interpretation / implication</span><AutoTextarea value={e.interpretation} onChange={(ev) => updateEvidenceEntry(i, "interpretation", ev.target.value)} /></label>
                </div>
              ))}
              <button type="button" className="add" onClick={addEvidence}>+ Add evidence</button>
            </div>

            {/* E. Evidence-informed MVP */}
            <div className="e2mvp-sub">
              <h4>Evidence-informed MVP</h4>
              <p className="help">{evidenceLog.length === 0 ? "Provisional — no evidence recorded yet. Treat as a hypothesis." : "Review against your recorded evidence before relying on it."}</p>
              <div className="mvp-rec">
                {evidence.mvp.features.map((f, i) => (
                  <div className="mvp-row" key={i}>
                    <span className="mvp-num">{i + 1}</span>
                    <div className="mvp-body">
                      <div className="mvp-feat"><b>{f.feature}</b> <span className={`badge badge-pri badge-${f.priority.toLowerCase()}`}>{f.priority}</span></div>
                      <p className="mvp-line"><span className="mini-label">Rationale</span> {f.rationale}</p>
                      <p className="mvp-line"><span className="mini-label">Dependency</span> {f.dependency}</p>
                      {f.relatedAssumption && <p className="mvp-line"><span className="mini-label">Related</span> {f.relatedAssumption}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <div className={evidenceLog.length === 0 ? "mvp-reco provisional" : "mvp-reco"}>
                <b>{evidenceLog.length === 0 ? "Provisional recommendation" : "Recommendation"}</b>
                <p>{evidence.mvp.recommendation}</p>
                <p className="mvp-subset"><span className="mini-label">Smallest value-testing subset</span> {evidence.mvp.coreSubset.join(" · ")}</p>
              </div>
              <div className="mvp-accept">
                {mvpAccepted ? (
                  <p className="help ok">✓ Proposed priorities applied to the Bill of Materials above.</p>
                ) : (
                  <>
                    <button type="button" className="generate" onClick={acceptMvpChanges}>Apply proposed priorities to BOM</button>
                    <span className="help"> The BOM stays unchanged until you apply this.</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </article></section>}
      <footer>Blueprint Co-Pilot · Student project prototype</footer>
      {result && (
        <div className="print-doc" aria-hidden="true">
          <h1 className="pd-title">Blueprint Co-Pilot</h1>
          <p className="pd-sub">Design Thinking blueprint · Student-reviewed draft</p>

          <section className="pd-block pd-avoid">
            <h2>Problem &amp; target user</h2>
            <p className="pd-field"><b>Problem</b><span>{result.problem}</span></p>
            <p className="pd-field"><b>Target user</b><span>{result.targetUser}</span></p>
          </section>

          <section className="pd-block pd-avoid">
            <h2>Persona</h2>
            <p className="pd-name">{result.persona.name}</p>
            <p className="pd-tagline">{result.persona.tagline}</p>
            {result.persona.quote && <p className="pd-quote">“{result.persona.quote}”</p>}
            <div className="pd-cols">
              <div>
                <h3>Goals</h3>
                <ul>{result.persona.goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </div>
              <div>
                <h3>Pain points</h3>
                <ul>{result.persona.painPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
            </div>
          </section>

          <section className="pd-block pd-avoid">
            <h2>Empathy map</h2>
            <div className="pd-cols">
              {Object.entries(LABELS).map(([key, label]) => (
                <div key={key}>
                  <h3>{label}</h3>
                  <ul>{result.empathyMap[key].map((item, i) => <li key={i}>{item}</li>)}</ul>
                </div>
              ))}
            </div>
          </section>

          <section className="pd-block pd-avoid">
            <h2>How might we</h2>
            <p className="pd-hmw">{result.hmw}</p>
          </section>

          <section className="pd-block">
            <h2>MVP bill of materials</h2>
            <table className="pd-table pd-table-bom">
              <thead>
                <tr><th>#</th><th>Feature</th><th>Priority</th><th>Note</th></tr>
              </thead>
              <tbody>
                {result.bom.map((item, index) => (
                  <tr key={index} className="pd-avoid">
                    <td>{index + 1}</td>
                    <td>{item.feature}</td>
                    <td>{item.priority}</td>
                    <td>{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {notes.trim() && (
            <section className="pd-block pd-avoid">
              <h2>Validation notes</h2>
              <p className="pd-notes">{notes}</p>
            </section>
          )}

          {evidence && (
            <>
              <section className="pd-block">
                <h2>Evidence-to-MVP — assumptions</h2>
                <table className="pd-table">
                  <thead><tr><th>#</th><th>Assumption</th><th>Status</th><th>Risk if wrong</th><th>How to test</th></tr></thead>
                  <tbody>
                    {evidence.assumptions.map((a, i) => (
                      <tr key={i} className="pd-avoid">
                        <td>{i + 1}</td><td>{a.assumption}</td><td>{a.status}</td><td>{a.riskIfWrong}</td><td>{a.howToTest}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="pd-block pd-avoid">
                <h2>User interview questions</h2>
                <ol>{evidence.interviewQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol>
              </section>

              <section className="pd-block pd-avoid">
                <h2>Proposed validation experiment</h2>
                <p className="pd-field"><b>Hypothesis</b><span>{evidence.experiment.hypothesis}</span></p>
                <p className="pd-field"><b>Participants</b><span>{evidence.experiment.participants}</span></p>
                <p className="pd-field"><b>Steps</b><span>{evidence.experiment.steps.join("; ")}</span></p>
                <p className="pd-field"><b>Measure</b><span>{evidence.experiment.measurements}</span></p>
                <p className="pd-field"><b>Success (suggested)</b><span>{evidence.experiment.successCriterion}</span></p>
                <p className="pd-field"><b>Effort</b><span>{evidence.experiment.effort}</span></p>
                <p className="pd-field"><b>Limitations</b><span>{evidence.experiment.limitations}</span></p>
              </section>

              <section className="pd-block">
                <h2>Evidence log {evidenceLog.length === 0 ? "(none recorded)" : "(user-recorded)"}</h2>
                {evidenceLog.length === 0 ? (
                  <p className="pd-notes">No evidence recorded yet — the MVP recommendation below is provisional.</p>
                ) : (
                  <table className="pd-table">
                    <thead><tr><th>#</th><th>Observation</th><th>Source</th><th>Date</th><th>Stance</th><th>Interpretation</th></tr></thead>
                    <tbody>
                      {evidenceLog.map((e, i) => (
                        <tr key={i} className="pd-avoid">
                          <td>{i + 1}</td><td>{e.description}</td><td>{e.source}</td><td>{e.date}</td><td>{e.stance}</td><td>{e.interpretation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="pd-block pd-avoid">
                <h2>{evidenceLog.length === 0 ? "Provisional MVP recommendation" : "MVP recommendation"}</h2>
                <p className="pd-notes">{evidence.mvp.recommendation}</p>
                <p className="pd-field"><b>Core subset</b><span>{evidence.mvp.coreSubset.join("; ")}</span></p>
              </section>
            </>
          )}

          <p className="pd-foot">AI-generated draft. Treat as a hypothesis, not validated research. Only entries in the evidence log reflect collected evidence.</p>
        </div>
      )}
    </div><style>{`
*{box-sizing:border-box}
body{margin:0;background:#f5f5f2;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif}
#root{width:100%;max-width:100%;margin:0;border-inline:0;text-align:left;color:#1a1a1a;background:#f5f5f2}
.page{min-height:100vh;text-align:left}
.container{max-width:980px;margin:auto;padding:24px 28px 60px}

.top{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #d6d6d1;padding-bottom:16px}
.brand{font-weight:bold;font-size:15px;display:flex;align-items:center;gap:8px;color:#111}
.brand span{display:grid;place-items:center;width:25px;height:25px;background:#111;color:#fff;border-radius:4px}
.top p{font-size:12px;color:#555;margin:5px 0 0 33px}
.top small{border:1px solid #999;border-radius:20px;padding:6px 10px;color:#333;font-size:12px;white-space:nowrap}

.hero{padding:65px 0 43px}
.eyebrow{font-size:12px;letter-spacing:.12em;font-weight:bold;color:#555;text-transform:uppercase}
label{font-size:12px;letter-spacing:.1em;font-weight:bold;color:#444}
.hero h1{font-size:clamp(40px,7vw,64px);line-height:1.02;letter-spacing:-.055em;margin:14px 0 17px;color:#111}
.hero i{font-family:Georgia,serif;font-weight:normal}
.hero>p:last-child{color:#444;font-size:17px;line-height:1.5}

.form-card,.card,.input-summary{background:#fff;border:1px solid #d2d1ca;border-radius:8px}
.form-card{padding:26px}
.heading,.result-heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}
.heading h2,.result-heading h2{margin:6px 0 0;font-size:23px;color:#111}
.heading em{color:#555;font-size:13px;font-style:normal;text-align:right}

.examples{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0}
.examples button,.actions button{background:#fff;color:#1a1a1a;border:1px solid #a9a9a2;border-radius:6px;padding:9px 13px;font-size:13px;font-weight:600;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s}
.examples button:hover,.actions button:hover{border-color:#111;background:#f4f4f1}
.examples button:focus-visible,.actions button:focus-visible{outline:2px solid #111;outline-offset:2px}

.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.fields label{letter-spacing:0;color:#222;font-size:13px;font-weight:600}
.fields textarea{display:block;width:100%;height:105px;margin-top:8px;border:1px solid #bdbdb6;border-radius:5px;background:#fff;padding:11px;resize:vertical;font:14px/1.45 Arial;color:#1a1a1a}
.fields textarea::placeholder,textarea::placeholder,input::placeholder{color:#6a6a66;opacity:1}

.generate{margin-top:20px;background:#111;color:#fff;border:0;border-radius:6px;padding:13px 18px;font-size:14px;font-weight:bold;cursor:pointer}
.generate:hover{background:#000}
.generate:focus-visible{outline:2px solid #111;outline-offset:2px}
.generate:disabled{opacity:.55;cursor:default}
.error{font-size:13px;color:#b31919;font-weight:600;margin:14px 0 -8px}
.error-quota{color:#8a4b00;background:#fdf1e3;border:1px solid #e9c08a;border-radius:6px;padding:10px 12px;margin:14px 0 0;line-height:1.5}

.results{padding-top:60px}
.result-heading{align-items:flex-end;margin-bottom:18px}
.result-heading p{font-size:13px;color:#555;margin:7px 0 0;line-height:1.5}
.actions{display:flex;gap:8px;flex-shrink:0}

.input-summary{display:grid;grid-template-columns:110px 1fr;gap:8px 14px;padding:16px;margin-bottom:16px;font-size:13px}
.input-summary b{font-size:11px;color:#555;letter-spacing:.08em;text-transform:uppercase}
.input-summary span{color:#333;overflow-wrap:anywhere;word-break:break-word}

.two{display:grid;grid-template-columns:1.1fr .9fr;gap:16px}
.card{padding:23px;margin-top:16px}
.two .card{margin-top:0}
.card h3{font-size:19px;margin:9px 0 13px;color:#111}
.card>label{display:block;color:#555}
.card-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.card-head>label{color:#555}
.regen{flex:0 0 auto;background:#fff;color:#1a1a1a;border:1px solid #a9a9a2;border-radius:6px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;transition:border-color .15s,background .15s}
.regen:hover:not(:disabled){border-color:#111;background:#f4f4f1}
.regen:focus-visible{outline:2px solid #111;outline-offset:2px}
.regen:disabled{opacity:.5;cursor:default}
.regen-dark{background:#1d1d1d;color:#fff;border-color:#555}
.regen-dark:hover:not(:disabled){border-color:#fff;background:#2a2a2a}
.regen-dark:focus-visible{outline:2px solid #fff}
/* Dim and lock a card while its section regenerates */
.card.regenerating{opacity:.6;pointer-events:none}
.card.regenerating .regen{opacity:1}
.error-dark{color:#ff9b9b}

.title-input,.sub-input,.quote,.black textarea,.notes,.edit-row textarea,.bom-field textarea,.bom-field select{display:block;width:100%;border:1px solid #c2c2bb;border-radius:4px;background:#fff;padding:9px;font:14px/1.45 Arial;color:#1a1a1a}
.quote,.notes{resize:vertical}
/* Auto-growing fields size themselves to content: no manual handle, no inner scrollbar, normal wrapping */
.sub-input,.edit-row textarea,.bom-field textarea{resize:none;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}
.title-input{font-size:19px;font-weight:bold;margin-top:12px}
.sub-input{font-size:14px;color:#444;margin-top:6px;min-height:40px}
.quote{margin-top:12px;min-height:58px;font:italic 15px/1.5 Georgia}

.columns{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:17px}
.columns b{font-size:13px;color:#222}

.edit-list{margin-top:8px}
.edit-row{display:flex;gap:8px;margin-bottom:10px;align-items:flex-start}
.edit-row textarea{font-size:13px;min-height:38px}
.edit-row .remove{flex:0 0 auto;width:34px;height:38px;display:grid;place-items:center;border:1px solid #b8b8b2;background:#fff;border-radius:4px;color:#444;font-size:18px;line-height:1;cursor:pointer}
.edit-row .remove:hover{border-color:#b31919;color:#b31919}
.edit-row .remove:focus-visible{outline:2px solid #111;outline-offset:2px}
.add{border:1px dashed #999;background:none;padding:7px 10px;font-size:12px;color:#444;font-weight:600;border-radius:4px;cursor:pointer}
.add:hover{border-color:#111;color:#111}

.black{background:#111;color:#fff;border-color:#111;min-height:230px;display:flex;flex-direction:column;justify-content:center}
.black .card-head>label{color:#cfcfcf}
.black textarea{margin-top:15px;background:#1d1d1d;color:#fff;border-color:#555;font-size:20px;line-height:1.3;min-height:90px;resize:vertical}
.black textarea::placeholder{color:#9a9a9a}
.black p{font-size:13px;color:#cfcfcf;margin-top:12px}

.map{display:grid;grid-template-columns:1fr 1fr;background:#d6d6d0;gap:1px;margin-top:14px;border:1px solid #d6d6d0;border-radius:6px;overflow:hidden}
.map>div{background:#fff;padding:16px}
.map b{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#222}

.bom{margin-top:16px;border-top:1px solid #ddd}
.bom-row{display:grid;grid-template-columns:28px minmax(0,1.3fr) 110px minmax(0,1.6fr);gap:12px;align-items:start;border-bottom:1px solid #eee;padding:14px 0}
.bom-num{color:#555;font-size:13px;font-weight:bold;padding-top:22px}
.bom-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.bom-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#666;font-weight:bold}
.bom-field textarea{font-size:13px;min-height:40px}
.bom-field select{font-size:13px;padding:9px}

.help{font-size:13px;color:#555;line-height:1.55}
.help.muted{color:#888;font-style:italic}
.help.ok{color:#1a7a3c;font-weight:600}
.notes{min-height:75px}
footer{margin-top:55px;border-top:1px solid #d6d6d1;padding-top:15px;color:#666;font-size:12px}

/* ---------- Evidence-to-MVP ---------- */
.save-note{color:#1a7a3c;font-weight:600}
.e2mvp-empty{margin-top:14px}
.e2mvp-empty .generate{margin-top:4px}
.e2mvp-body.regenerating{opacity:.6;pointer-events:none}
.e2mvp-sub{margin-top:22px;padding-top:20px;border-top:1px solid #ececE6}
.e2mvp-sub:first-child{margin-top:14px;padding-top:0;border-top:0}
.e2mvp-sub h4{font-size:15px;margin:0 0 4px;color:#111;display:flex;align-items:center;gap:8px}
.count{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#eceae2;color:#555;font-size:11px;font-weight:bold}
.mini-label{display:block;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#777;font-weight:bold;margin-bottom:3px}

/* status + priority badges */
.badge{display:inline-block;font-size:10px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:999px;border:1px solid transparent;white-space:nowrap}
.badge-untested{background:#f1f0ea;color:#6b6b63;border-color:#dcdbd2}
.badge-testing{background:#fdf1e3;color:#8a4b00;border-color:#e9c08a}
.badge-validated{background:#e7f5ec;color:#1a7a3c;border-color:#a9d8ba}
.badge-pri{background:#eef0f4;color:#374151;border-color:#d3d8e0}
.badge-must{background:#fdecec;color:#9a2020;border-color:#e7bcbc}
.badge-should{background:#eef4fd;color:#1f4d8a;border-color:#bcd2ef}
.badge-could{background:#f1f0ea;color:#6b6b63;border-color:#dcdbd2}

.assume-list{display:flex;flex-direction:column;gap:12px;margin-top:10px}
.assume{border:1px solid #e5e4dc;border-radius:7px;padding:13px;background:#fcfcfa}
.assume-top{display:flex;gap:12px;align-items:flex-start}
.assume-title{flex:1;font-weight:600}
.status-pick{flex:0 0 auto;display:flex;flex-direction:column;gap:4px;align-items:flex-start;min-width:132px}
/* Single coloured status selector: shows its value when closed, clear caret,
   obviously interactive. Colour reflects the selected status. */
.status-select{appearance:none;-webkit-appearance:none;-moz-appearance:none;width:100%;font-size:13px;font-weight:700;letter-spacing:.02em;border:1px solid #c2c2bb;border-radius:6px;padding:7px 30px 7px 11px;cursor:pointer;background-color:#fff;background-repeat:no-repeat;background-position:right 9px center;background-size:11px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%23555' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>")}
.status-select:focus-visible{outline:2px solid #111;outline-offset:2px}
.status-select.status-untested{background-color:#f1f0ea;color:#4f4f49;border-color:#cfcec4}
.status-select.status-testing{background-color:#fdf1e3;color:#7a4200;border-color:#e3b277}
.status-select.status-validated{background-color:#e7f5ec;color:#15692f;border-color:#96cfa8}
.status-legend{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:#555;line-height:1.5}
.status-legend li{display:flex;align-items:center;gap:7px}
.assume-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:10px}
.assume-grid textarea{font-size:13px;min-height:38px}

.exp-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;margin-top:10px}
.exp-grid textarea{font-size:13px;min-height:38px}
.exp-steps{grid-column:1 / -1}

.evi{border:1px solid #e5e4dc;border-radius:7px;padding:13px;background:#fcfcfa;margin-top:10px;display:flex;flex-direction:column;gap:10px}
.evi-head{display:flex;justify-content:space-between;align-items:center}
.evi-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.evi select,.evi input[type=date]{width:100%;border:1px solid #c2c2bb;border-radius:4px;padding:8px;font:13px Arial;background:#fff;color:#1a1a1a}
.evi textarea{font-size:13px;min-height:38px}

.mvp-rec{margin-top:10px;border-top:1px solid #eee}
.mvp-row{display:grid;grid-template-columns:26px 1fr;gap:10px;padding:12px 0;border-bottom:1px solid #eee}
.mvp-num{color:#888;font-size:13px;font-weight:bold}
.mvp-feat{font-size:14px;margin-bottom:5px;display:flex;align-items:center;gap:8px}
.mvp-line{font-size:12.5px;color:#444;line-height:1.5;margin:2px 0}
.mvp-line .mini-label{display:inline;margin:0 4px 0 0;color:#999}
.mvp-reco{margin-top:14px;padding:14px;border-radius:7px;background:#f4f6f9;border:1px solid #dde2ea}
.mvp-reco.provisional{background:#fdf1e3;border-color:#e9c08a}
.mvp-reco b{font-size:13px}
.mvp-reco p{font-size:13px;color:#333;line-height:1.5;margin:6px 0 0}
.mvp-subset .mini-label{display:inline;margin-right:4px}
.mvp-accept{margin-top:14px;display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.mvp-accept .generate{margin-top:0}

/* Print-only document: hidden on screen, shown only when printing/exporting PDF */
.print-doc{display:none}

@media(max-width:700px){
  .container{padding:20px 16px 40px}
  .hero{padding:45px 0 30px}
  .fields,.two,.columns{grid-template-columns:1fr}
  .heading,.result-heading{display:block}
  .heading em{display:block;margin-top:10px;text-align:left}
  .result-heading .actions{margin-top:16px}
  .actions button{flex:1 1 auto}
  .input-summary{grid-template-columns:1fr}
  .map{grid-template-columns:1fr}
  .bom-row{grid-template-columns:1fr;gap:8px;row-gap:10px}
  .bom-num{padding-top:0}
  .bom-field.bom-priority{max-width:160px}
  .black{min-height:180px}
  .assume-grid,.exp-grid,.evi-grid{grid-template-columns:1fr}
  .assume-top{flex-direction:column}
  .status-pick{align-items:flex-start;width:100%;min-width:0}
}

@media print{
  @page{margin:16mm}
  html,body,#root{background:#fff}
  /* Hide the interactive app; print only the clean document */
  .page>.container>:not(.print-doc){display:none !important}
  .container{max-width:none;padding:0;margin:0}
  .print-doc{display:block;color:#111;font:12pt/1.5 Arial,Helvetica,sans-serif;text-align:left}
  .print-doc *{overflow-wrap:anywhere;word-break:break-word}
  .print-doc .pd-title{font-size:24pt;margin:0 0 2pt;letter-spacing:-.02em}
  .print-doc .pd-sub{font-size:10pt;color:#555;margin:0 0 14pt;padding-bottom:10pt;border-bottom:1px solid #bbb}
  .print-doc .pd-block{margin:0 0 16pt}
  .print-doc h2{font-size:14pt;margin:0 0 8pt;padding-bottom:3pt;border-bottom:1px solid #ddd}
  .print-doc h3{font-size:10.5pt;margin:0 0 5pt;text-transform:uppercase;letter-spacing:.06em;color:#444}
  .print-doc ul,.print-doc ol{margin:0;padding-left:18pt}
  .print-doc li{margin:0 0 3pt}
  .print-doc .pd-field{display:flex;gap:8pt;margin:0 0 6pt}
  .print-doc .pd-field b{flex:0 0 90pt;font-size:9pt;text-transform:uppercase;letter-spacing:.06em;color:#555}
  .print-doc .pd-name{font-size:13pt;font-weight:bold;margin:0 0 2pt}
  .print-doc .pd-tagline{color:#555;margin:0 0 8pt}
  .print-doc .pd-quote{font:italic 12pt/1.5 Georgia,serif;margin:0 0 10pt;padding-left:10pt;border-left:3px solid #ccc}
  .print-doc .pd-cols{display:grid;grid-template-columns:1fr 1fr;gap:10pt 24pt}
  .print-doc .pd-hmw{font-size:13pt;line-height:1.45}
  .print-doc .pd-table{width:100%;border-collapse:collapse;font-size:10.5pt}
  .print-doc .pd-table th{text-align:left;font-size:9pt;text-transform:uppercase;letter-spacing:.05em;color:#555;border-bottom:1.5px solid #999;padding:4pt 6pt}
  .print-doc .pd-table td{vertical-align:top;border-bottom:1px solid #ddd;padding:5pt 6pt}
  .print-doc .pd-table th:first-child,.print-doc .pd-table td:first-child{width:22pt;color:#777}
  .print-doc .pd-table-bom th:nth-child(3),.print-doc .pd-table-bom td:nth-child(3){width:52pt;white-space:nowrap}
  .print-doc .pd-notes{white-space:pre-wrap}
  .print-doc .pd-foot{margin-top:14pt;padding-top:8pt;border-top:1px solid #bbb;font-size:9pt;color:#666}
  /* Keep logical blocks from splitting awkwardly across pages */
  .print-doc .pd-avoid,.print-doc h2,.print-doc h3,.print-doc tr{break-inside:avoid;page-break-inside:avoid}
  .print-doc h2,.print-doc h3{break-after:avoid;page-break-after:avoid}
}
`}</style></main>
  );
}
