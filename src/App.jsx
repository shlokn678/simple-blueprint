import { useState } from "react";

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
          <input value={item} onChange={(e) => { const next = [...items]; next[index] = e.target.value; onChange(next); }} />
          <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))}>×</button>
        </div>
      ))}
      <button type="button" className="add" onClick={() => onChange([...items, "New point"])}>+ Add point</button>
    </div>
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
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem, targetUser }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation failed.");
      setResult({ ...data, problem, targetUser });
      setStatus("done");
      setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 40);
    } catch (error) {
      setMessage(error.message || "Could not generate the blueprint.");
      setStatus("error");
    }
  }

  function updatePersona(key, value) { setResult((old) => ({ ...old, persona: { ...old.persona, [key]: value } })); }
  function updateEmpathy(key, value) { setResult((old) => ({ ...old, empathyMap: { ...old.empathyMap, [key]: value } })); }
  function updateBom(index, key, value) { setResult((old) => { const bom = [...old.bom]; bom[index] = { ...bom[index], [key]: value }; return { ...old, bom }; }); }

  function newIdea() {
    setProblem(""); setTargetUser(""); setResult(null); setStatus("idle"); setMessage(""); setCopied(false); setNotes(""); window.scrollTo({ top: 0, behavior: "smooth" });
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
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="page"><div className="container">
      <header className="top"><div><div className="brand"><span>B</span> Blueprint Co-Pilot</div><p>Design Thinking Co-Pilot for Students</p></div><small>Live AI · Editable draft</small></header>
      <section className="hero"><p className="eyebrow">DESIGN THINKING COURSEWORK</p><h1>From a rough idea<br /><i>to a reviewable blueprint.</i></h1><p>Generate a structured first draft, then review and refine it yourself.</p></section>
      <section className="form-card"><div className="heading"><div><label>01</label><h2>Start with an idea</h2></div><em>Choose an example or write your own.</em></div><div className="examples">{EXAMPLES.map((example) => <button type="button" key={example.label} onClick={() => chooseExample(example)}>{example.label}</button>)}</div><div className="fields"><label>Problem / idea<textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="What problem are you trying to solve?" /></label><label>Target user<textarea value={targetUser} onChange={(e) => setTargetUser(e.target.value)} placeholder="Who experiences this problem?" /></label></div>{message && <p className="error">{message}</p>}<button type="button" className="generate" onClick={generate} disabled={status === "loading"}>{status === "loading" ? "Generating with AI..." : status === "error" ? "Retry generation" : "Generate draft blueprint →"}</button></section>
      {status === "done" && result && <section id="results" className="results"><div className="result-heading"><div><label>02</label><h2>Draft blueprint</h2><p>AI-generated output. Treat it as a hypothesis, not validated research.</p></div><div className="actions"><button type="button" onClick={copySummary}>{copied ? "Copied" : "Copy summary"}</button><button type="button" onClick={newIdea}>New idea</button></div></div><div className="input-summary"><b>Problem</b><span>{result.problem}</span><b>Target user</b><span>{result.targetUser}</span></div><div className="two"><article className="card"><label>PERSONA · EDITABLE</label><input className="title-input" value={result.persona.name} onChange={(e) => updatePersona("name", e.target.value)} /><input className="sub-input" value={result.persona.tagline} onChange={(e) => updatePersona("tagline", e.target.value)} /><textarea className="quote" value={result.persona.quote} onChange={(e) => updatePersona("quote", e.target.value)} /><div className="columns"><div><b>Goals</b><EditableList items={result.persona.goals} onChange={(v) => updatePersona("goals", v)} /></div><div><b>Pain points</b><EditableList items={result.persona.painPoints} onChange={(v) => updatePersona("painPoints", v)} /></div></div></article><article className="card black"><label>HOW MIGHT WE · EDITABLE</label><textarea value={result.hmw} onChange={(e) => setResult({ ...result, hmw: e.target.value })} /><p>Review this question before accepting it.</p></article></div><article className="card"><label>EMPATHY MAP · EDITABLE</label><h3>Understanding the user</h3><div className="map">{Object.entries(LABELS).map(([key, label]) => <div key={key}><b>{label}</b><EditableList items={result.empathyMap[key]} onChange={(v) => updateEmpathy(key, v)} /></div>)}</div></article><article className="card"><label>MVP BILL OF MATERIALS · EDITABLE</label><h3>Prioritized feature list</h3><div className="bom">{result.bom.map((item, index) => <div className="bom-row" key={index}><span>0{index + 1}</span><input value={item.feature} onChange={(e) => updateBom(index, "feature", e.target.value)} /><select value={item.priority} onChange={(e) => updateBom(index, "priority", e.target.value)}><option>Must</option><option>Should</option><option>Could</option></select><input value={item.note} onChange={(e) => updateBom(index, "note", e.target.value)} /></div>)}</div></article><article className="card"><label>VALIDATION NOTES</label><h3>What would you verify with real students?</h3><p className="help">AI output is a draft. Note one assumption you would check through interviews or observation.</p><textarea className="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Example: I would ask three students whether this pain point is real." /></article></section>}
      <footer>Blueprint Co-Pilot · Student project prototype</footer>
    </div><style>{`*{box-sizing:border-box}body{margin:0;background:#f5f5f2;color:#151515;font-family:Arial,Helvetica,sans-serif}.page{min-height:100vh}.container{max-width:980px;margin:auto;padding:24px 28px 60px}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #d6d6d1;padding-bottom:16px}.brand{font-weight:bold;font-size:14px;display:flex;align-items:center;gap:8px}.brand span{display:grid;place-items:center;width:25px;height:25px;background:#111;color:#fff;border-radius:4px}.top p{font-size:11px;color:#777;margin:5px 0 0 33px}.top small{border:1px solid #bbb;border-radius:20px;padding:6px 9px;color:#555}.hero{padding:65px 0 43px}.eyebrow,label{font-size:10px;letter-spacing:.12em;font-weight:bold;color:#737373}.hero h1{font-size:clamp(40px,7vw,64px);line-height:1.02;letter-spacing:-.055em;margin:14px 0 17px}.hero i{font-family:Georgia,serif;font-weight:normal}.hero>p:last-child{color:#666;font-size:16px}.form-card,.card,.input-summary{background:#fff;border:1px solid #dddcd6;border-radius:8px}.form-card{padding:26px}.heading,.result-heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.heading h2,.result-heading h2{margin:6px 0 0;font-size:23px}.heading em{color:#888;font-size:11px}.examples{display:flex;gap:7px;flex-wrap:wrap;margin:22px 0}.examples button,.actions button{background:#fff;border:1px solid #c8c8c2;border-radius:5px;padding:8px 11px;font-size:12px;cursor:pointer}.examples button:hover,.actions button:hover{border-color:#111}.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.fields label{letter-spacing:0;color:#333;font-size:12px}.fields textarea{display:block;width:100%;height:105px;margin-top:8px;border:1px solid #d0d0ca;border-radius:5px;background:#fafaf8;padding:11px;resize:vertical;font:13px/1.45 Arial}.generate{margin-top:20px;background:#111;color:#fff;border:0;border-radius:5px;padding:12px 15px;font-size:12px;font-weight:bold;cursor:pointer}.generate:disabled{opacity:.5}.error{font-size:12px;color:#a22;margin:14px 0 -8px}.results{padding-top:60px}.result-heading{align-items:end;margin-bottom:18px}.result-heading p{font-size:12px;color:#777;margin:7px 0 0}.actions{display:flex;gap:7px}.input-summary{display:grid;grid-template-columns:90px 1fr;gap:8px 14px;padding:15px;margin-bottom:16px;font-size:12px}.input-summary b{font-size:10px;color:#777;letter-spacing:.08em}.input-summary span{color:#555}.two{display:grid;grid-template-columns:1.1fr .9fr;gap:16px}.card{padding:23px;margin-top:16px}.two .card{margin-top:0}.card h3{font-size:19px;margin:9px 0 13px}.card>label{display:block}.title-input,.sub-input,.quote,.black textarea,.notes,.edit-row input,.bom-row input,.bom-row select{display:block;width:100%;border:1px solid #d2d2cc;border-radius:4px;background:#fafaf8;padding:8px;font:13px Arial;color:#151515}.title-input{font-size:19px;font-weight:bold;margin-top:12px}.sub-input{font-size:12px;color:#777;margin-top:6px}.quote{margin-top:12px;height:58px;resize:vertical;font:italic 15px Georgia}.columns{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:17px}.columns b{font-size:12px}.edit-list{margin-top:8px}.edit-row{display:flex;gap:5px;margin-bottom:6px}.edit-row input{font-size:12px}.edit-row button{width:24px;border:1px solid #ccc;background:#fff;border-radius:4px;color:#777;cursor:pointer}.add{border:1px dashed #aaa;background:none;padding:5px 8px;font-size:11px;color:#666;cursor:pointer}.black{background:#111;color:#fff;border-color:#111;min-height:230px;display:flex;flex-direction:column;justify-content:center}.black label{color:#aaa}.black textarea{margin-top:15px;background:#191919;color:#fff;border-color:#444;font-size:20px;line-height:1.25;min-height:90px;resize:vertical}.black p{font-size:12px;color:#aaa}.map{display:grid;grid-template-columns:1fr 1fr;background:#ddd;gap:1px;margin-top:14px}.map>div{background:#fff;padding:16px}.map b{font-size:12px;text-transform:uppercase;letter-spacing:.08em}.bom{margin-top:16px;border-top:1px solid #ddd}.bom-row{display:grid;grid-template-columns:25px 1.1fr 80px 1.5fr;gap:9px;align-items:center;border-bottom:1px solid #eee;padding:12px 0;font-size:11px}.bom-row>span{color:#888}.bom-row select{font-size:11px}.help{font-size:12px;color:#777;line-height:1.5}.notes{height:75px;resize:vertical}footer{margin-top:55px;border-top:1px solid #d6d6d1;padding-top:15px;color:#888;font-size:10px}@media(max-width:700px){.container{padding:20px 16px 40px}.hero{padding:45px 0 30px}.fields,.two,.columns{grid-template-columns:1fr}.heading,.result-heading{display:block}.heading em{display:block;margin-top:10px}.actions{margin-top:16px}.input-summary{grid-template-columns:1fr}.map{grid-template-columns:1fr}.bom-row{grid-template-columns:1fr}.black{min-height:180px}}
`}</style></main>
  );
}
