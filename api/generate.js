export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Only POST requests are allowed.",
    });
  }

  // On Vercel's Node runtime, `req.body` is a lazy getter that parses the
  // request body and THROWS (ApiError: Invalid JSON) on malformed/empty/
  // non-JSON bodies. Accessing it unguarded crashes the function
  // (FUNCTION_INVOCATION_FAILED), so read it defensively. We also fall back
  // to parsing the raw body ourselves if the parsed body isn't an object.
  let body;
  try {
    body = req.body;
  } catch {
    return res.status(400).json({
      error: "Request body must be valid JSON.",
    });
  }
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        error: "Request body must be valid JSON.",
      });
    }
  }

  const { problem, targetUser, section, bom } = body || {};

  if (!problem?.trim() || !targetUser?.trim()) {
    return res.status(400).json({
      error: "Please provide both a problem and target user.",
    });
  }

  // `section` is optional. When omitted, generate the full blueprint
  // (unchanged behavior). When provided, regenerate only that one section.
  // "evidenceToMvp" is a dedicated section-generation request for the
  // Evidence-to-MVP feature (assumptions, interview questions, experiment,
  // and an MVP recommendation). It never regenerates the whole blueprint.
  const VALID_SECTIONS = ["persona", "empathyMap", "hmw", "bom", "evidenceToMvp"];

  if (section !== undefined && !VALID_SECTIONS.includes(section)) {
    return res.status(400).json({
      error: "Unknown section requested.",
    });
  }

  const key = process.env.GROQ_API_KEY;

  if (!key) {
    return res.status(500).json({
      error: "GROQ_API_KEY is not configured.",
    });
  }

  // Shared anti-hallucination principles applied to every request,
  // whether generating the whole blueprint or a single section.
  const PRINCIPLES = `You are a Design Thinking facilitator helping a student turn a rough idea into a first-draft blueprint.

Return ONLY valid JSON. Do not use markdown or code fences. Do not add commentary before or after the JSON.

PRIMARY SOURCE OF TRUTH
The supplied Problem and Target user below are your only source of information. Every persona detail, empathy-map entry, How Might We statement, and MVP feature must relate directly to them. Do not drift to a different problem or audience.

DO NOT INVENT SPECIFIC FACTS the user did not supply. In particular, never introduce:
- Year of study, degree, major, specialization, or personal background.
- Specific course names, module codes, assignment titles, deadlines, or events.
- Hardware models, product brands, building names, room numbers, or named campus facilities.
- Usage statistics, availability data, counts, percentages, interview results, or research findings.
- Existing systems, apps, databases, APIs, or infrastructure that the user did not mention.
If a useful idea would require such a detail, phrase it in general terms instead of inventing a specific.

PERSONA
- The persona is an illustrative hypothesis, NOT a real interviewed person. A fictional first-name display name is fine (name field).
- tagline: a short, plausible one-line descriptor grounded only in the supplied target user.
- goals and painPoints: clearly plausible hypotheses derived from the supplied problem and user. They are informed guesses, not findings.
- quote: express a plausible, first-person concern about the actual problem. Keep it about the problem itself; do not add technical details, specific circumstances, or invented facts just to sound realistic.

EMPATHY MAP — keep the four sections DISTINCT; do not repeat the same idea across them:
- says: plausible things the user might say out loud about the problem.
- thinks: concerns, doubts, or assumptions the user might hold internally.
- does: plausible observable behaviours or workarounds related to the problem.
- feels: emotions that result from the problem (not actions or statements).

QUALITY
- Each required array must contain exactly three items. Make each item concise, readable, specific to the context, and free of unnecessary technical jargon.
- Avoid generic filler that could apply to any student or any problem.

HOW MIGHT WE (hmw)
- Write one actionable "How might we ...?" statement connecting the identified user need to an opportunity.
- Frame the opportunity, not a predetermined solution. Do not assume any particular feature or technology is already proven necessary.

MVP BILL OF MATERIALS (bom)
- Exactly five features: exactly two "Must", two "Should", and one "Could".
- Prioritize the minimum capabilities needed to address the central user problem. Keep features distinct, feasible at a student MVP level, and relevant to the supplied context.
- If a feature depends on external data, hardware-availability information, integrations, permissions, or other infrastructure, state that dependency in its note as an assumption to confirm — do NOT imply it already exists.

HONESTY
- Treat all persona and empathy-map content as hypotheses, not validated research.
- Do not fabricate validation, interviews, or evidence. Keep every claim testable through student interviews or observation.`;

  // Per-section JSON schema snippets, reused for single-section regeneration.
  const SECTION_SCHEMAS = {
    persona: `{
  "persona": {
    "name": "string",
    "tagline": "string",
    "quote": "string",
    "goals": ["string", "string", "string"],
    "painPoints": ["string", "string", "string"]
  }
}`,
    empathyMap: `{
  "empathyMap": {
    "says": ["string", "string", "string"],
    "thinks": ["string", "string", "string"],
    "does": ["string", "string", "string"],
    "feels": ["string", "string", "string"]
  }
}`,
    hmw: `{
  "hmw": "How might we ...?"
}`,
    bom: `{
  "bom": [
    { "feature": "string", "priority": "Must", "note": "string" },
    { "feature": "string", "priority": "Must", "note": "string" },
    { "feature": "string", "priority": "Should", "note": "string" },
    { "feature": "string", "priority": "Should", "note": "string" },
    { "feature": "string", "priority": "Could", "note": "string" }
  ]
}`,
    evidenceToMvp: `{
  "evidenceToMvp": {
    "assumptions": [
      { "assumption": "string", "whyItMatters": "string", "riskIfWrong": "string", "howToTest": "string", "status": "Untested" },
      { "assumption": "string", "whyItMatters": "string", "riskIfWrong": "string", "howToTest": "string", "status": "Untested" },
      { "assumption": "string", "whyItMatters": "string", "riskIfWrong": "string", "howToTest": "string", "status": "Untested" }
    ],
    "interviewQuestions": ["string", "string", "string", "string", "string"],
    "experiment": {
      "hypothesis": "string",
      "participants": "string",
      "steps": ["string", "string"],
      "measurements": "string",
      "successCriterion": "string",
      "effort": "string",
      "limitations": "string"
    },
    "mvp": {
      "features": [
        { "feature": "string", "priority": "Must", "rationale": "string", "dependency": "string", "relatedAssumption": "string" },
        { "feature": "string", "priority": "Must", "rationale": "string", "dependency": "string", "relatedAssumption": "string" },
        { "feature": "string", "priority": "Should", "rationale": "string", "dependency": "string", "relatedAssumption": "string" },
        { "feature": "string", "priority": "Should", "rationale": "string", "dependency": "string", "relatedAssumption": "string" },
        { "feature": "string", "priority": "Could", "rationale": "string", "dependency": "string", "relatedAssumption": "string" }
      ],
      "coreSubset": ["feature name", "feature name"],
      "recommendation": "string"
    }
  }
}`,
  };

  const FULL_SCHEMA = `{
  "persona": {
    "name": "string",
    "tagline": "string",
    "quote": "string",
    "goals": ["string", "string", "string"],
    "painPoints": ["string", "string", "string"]
  },
  "empathyMap": {
    "says": ["string", "string", "string"],
    "thinks": ["string", "string", "string"],
    "does": ["string", "string", "string"],
    "feels": ["string", "string", "string"]
  },
  "hmw": "How might we ...?",
  "bom": [
    { "feature": "string", "priority": "Must", "note": "string" },
    { "feature": "string", "priority": "Must", "note": "string" },
    { "feature": "string", "priority": "Should", "note": "string" },
    { "feature": "string", "priority": "Should", "note": "string" },
    { "feature": "string", "priority": "Could", "note": "string" }
  ]
}`;

  // ---------------------------------------------------------
  // Machine-readable JSON Schemas for Groq Structured Outputs.
  // These mirror the text schemas above and let us request
  // `response_format: json_schema` with strict constrained decoding,
  // so the model output is guaranteed to match the blueprint shape.
  // strict:true requires every property to be listed in `required`
  // and `additionalProperties:false` on every object.
  // ---------------------------------------------------------
  const threeStrings = {
    type: "array",
    items: { type: "string" },
    minItems: 3,
    maxItems: 3,
  };

  const personaSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      tagline: { type: "string" },
      quote: { type: "string" },
      goals: threeStrings,
      painPoints: threeStrings,
    },
    required: ["name", "tagline", "quote", "goals", "painPoints"],
    additionalProperties: false,
  };

  const empathyMapSchema = {
    type: "object",
    properties: {
      says: threeStrings,
      thinks: threeStrings,
      does: threeStrings,
      feels: threeStrings,
    },
    required: ["says", "thinks", "does", "feels"],
    additionalProperties: false,
  };

  const bomSchema = {
    type: "array",
    minItems: 5,
    maxItems: 5,
    items: {
      type: "object",
      properties: {
        feature: { type: "string" },
        priority: { type: "string", enum: ["Must", "Should", "Could"] },
        note: { type: "string" },
      },
      required: ["feature", "priority", "note"],
      additionalProperties: false,
    },
  };

  // Evidence-to-MVP schema. AI generates assumptions (A), interview
  // questions (B), one validation experiment (C), and an MVP
  // recommendation (E). The evidence log (D) is user-recorded only and is
  // never produced by the model, so it is NOT part of this schema.
  const assumptionSchema = {
    type: "object",
    properties: {
      assumption: { type: "string" },
      whyItMatters: { type: "string" },
      riskIfWrong: { type: "string" },
      howToTest: { type: "string" },
      // Status is always "Untested" at generation time; enforced below too.
      status: { type: "string", enum: ["Untested", "Testing", "Validated"] },
    },
    required: ["assumption", "whyItMatters", "riskIfWrong", "howToTest", "status"],
    additionalProperties: false,
  };

  const experimentSchema = {
    type: "object",
    properties: {
      hypothesis: { type: "string" },
      participants: { type: "string" },
      steps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
      measurements: { type: "string" },
      successCriterion: { type: "string" },
      effort: { type: "string" },
      limitations: { type: "string" },
    },
    required: [
      "hypothesis",
      "participants",
      "steps",
      "measurements",
      "successCriterion",
      "effort",
      "limitations",
    ],
    additionalProperties: false,
  };

  const mvpRecommendationSchema = {
    type: "object",
    properties: {
      features: {
        type: "array",
        minItems: 5,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            feature: { type: "string" },
            priority: { type: "string", enum: ["Must", "Should", "Could"] },
            rationale: { type: "string" },
            dependency: { type: "string" },
            relatedAssumption: { type: "string" },
          },
          required: ["feature", "priority", "rationale", "dependency", "relatedAssumption"],
          additionalProperties: false,
        },
      },
      // Smallest subset that could test the core value proposition.
      coreSubset: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
      recommendation: { type: "string" },
    },
    required: ["features", "coreSubset", "recommendation"],
    additionalProperties: false,
  };

  const evidenceToMvpSchema = {
    type: "object",
    properties: {
      assumptions: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: assumptionSchema,
      },
      interviewQuestions: {
        type: "array",
        minItems: 5,
        maxItems: 7,
        items: { type: "string" },
      },
      experiment: experimentSchema,
      mvp: mvpRecommendationSchema,
    },
    required: ["assumptions", "interviewQuestions", "experiment", "mvp"],
    additionalProperties: false,
  };

  const SECTION_JSON_SCHEMAS = {
    persona: {
      type: "object",
      properties: { persona: personaSchema },
      required: ["persona"],
      additionalProperties: false,
    },
    empathyMap: {
      type: "object",
      properties: { empathyMap: empathyMapSchema },
      required: ["empathyMap"],
      additionalProperties: false,
    },
    hmw: {
      type: "object",
      properties: { hmw: { type: "string" } },
      required: ["hmw"],
      additionalProperties: false,
    },
    bom: {
      type: "object",
      properties: { bom: bomSchema },
      required: ["bom"],
      additionalProperties: false,
    },
    evidenceToMvp: {
      type: "object",
      properties: { evidenceToMvp: evidenceToMvpSchema },
      required: ["evidenceToMvp"],
      additionalProperties: false,
    },
  };

  const FULL_JSON_SCHEMA = {
    type: "object",
    properties: {
      persona: personaSchema,
      empathyMap: empathyMapSchema,
      hmw: { type: "string" },
      bom: bomSchema,
    },
    required: ["persona", "empathyMap", "hmw", "bom"],
    additionalProperties: false,
  };

  const responseSchema = section
    ? SECTION_JSON_SCHEMAS[section]
    : FULL_JSON_SCHEMA;
  const schemaName = section ? `blueprint_${section}` : "blueprint";

  const context = `Problem: ${problem.trim()}

Target user: ${targetUser.trim()}`;

  // For Evidence-to-MVP, include the current BOM (if provided) so the MVP
  // recommendation builds on the existing five features rather than inventing
  // new ones. The model is told NOT to rewrite the BOM — only to annotate it.
  const bomContext = Array.isArray(bom) && bom.length
    ? `\n\nExisting MVP Bill of Materials (DO NOT change its features or priorities — reuse them exactly, only add rationale/dependency/relatedAssumption):\n${bom
        .map((b, i) => `${i + 1}. [${b?.priority ?? ""}] ${b?.feature ?? ""} — ${b?.note ?? ""}`)
        .join("\n")}`
    : "";

  let prompt;
  if (section === "evidenceToMvp") {
    prompt = `${PRINCIPLES}

EVIDENCE-TO-MVP — generate ONLY this section as a JSON object. These are PROPOSALS and HYPOTHESES to help a student plan research. You must NOT present anything as validated, completed, or already measured.

NESTING (CRITICAL): the top-level object has EXACTLY ONE key, "evidenceToMvp". Its DIRECT children are exactly "assumptions", "interviewQuestions", "experiment", and "mvp". "experiment" and "mvp" MUST be nested INSIDE "evidenceToMvp" alongside "assumptions" and "interviewQuestions" — never place "experiment" or "mvp" at the top level as siblings of "evidenceToMvp".

A. assumptions (3–5): the most important beliefs the proposed solution depends on. Order highest-risk first (the ones that would invalidate the solution if false). For each: the assumption, whyItMatters, riskIfWrong, a practical howToTest. The status field MUST be exactly "Untested" for every assumption — nothing is validated yet.

B. interviewQuestions (5–7): open-ended questions to interview the target user. Focus on real past experiences, behaviours, difficulties, and existing workarounds. Do NOT use leading questions, do NOT assume the problem is already proven, and include questions that probe the highest-risk assumptions.

C. experiment: ONE small, practical experiment doable before building the full solution. Provide hypothesis, participants, steps (2–6), what measurements/observations to collect, a measurable successCriterion, approximate effort, and honest limitations. The successCriterion is a SUGGESTED threshold to decide against — never a result that has occurred. Invent no participants, numbers, or findings.

E. mvp: use the existing BOM below as the starting point. Return exactly five features reusing the existing feature names and priorities UNCHANGED; for each add a rationale, a key dependency/feasibility concern, and relatedAssumption (reference an assumption above, or "" if none). coreSubset = the smallest set of feature names that could test the core value proposition. recommendation = a short, provisional explanation of that subset; label it provisional because no evidence has been collected yet.

Return ONLY the JSON object below and nothing else:

${SECTION_SCHEMAS.evidenceToMvp}

${context}${bomContext}`;
  } else if (section) {
    prompt = `${PRINCIPLES}

You are regenerating ONLY the "${section}" section of an existing blueprint. Produce a fresh alternative for this section that still follows every rule above. Return ONLY the JSON object below and nothing else — do not include any other section.

Return exactly this structure:

${SECTION_SCHEMAS[section]}

${context}`;
  } else {
    prompt = `${PRINCIPLES}

Return exactly this structure:

${FULL_SCHEMA}

${context}`;
  }

  // Groq model. openai/gpt-oss-20b is a current GroqCloud production model
  // that supports Structured Outputs with strict constrained decoding, so
  // the response is guaranteed to match the JSON schema above.
  const MODEL = "openai/gpt-oss-20b";

  // Groq exposes an OpenAI-compatible Chat Completions API. The whole
  // instruction (`prompt`) is self-contained, so it goes in the user turn;
  // a short system turn reinforces JSON-only output.
  const requestBody = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a Design Thinking facilitator. Respond with a single valid JSON object only, with no markdown or commentary.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 4096,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: schemaName,
        strict: true,
        schema: responseSchema,
      },
    },
  };

  const url = "https://api.groq.com/openai/v1/chat/completions";

  // ---------------------------------------------------------
  // Groq request with exponential backoff
  // ---------------------------------------------------------

  const MAX_ATTEMPTS = 4;

  // Groq advertises strict constrained decoding, but for large/deeply-nested
  // schemas (the evidenceToMvp schema in particular) it can fall back to
  // post-hoc validation and return an HTTP 400 with code
  // "json_validate_failed" when the model flattens the shape (e.g. emitting
  // `experiment`/`mvp` as top-level siblings of `evidenceToMvp`). We retry
  // such a failure AT MOST ONCE with a reinforced instruction — never the
  // identical request repeated, and only for the evidenceToMvp section.
  let correctiveRetryUsed = false;

  // Detect a Groq schema-validation 400 from its response body without
  // leaking anything to the client. Returns true only for schema failures.
  function isSchemaValidation400(status, text) {
    if (status !== 400) return false;
    try {
      const parsed = JSON.parse(text);
      const err = parsed?.error ?? parsed;
      if (err?.code === "json_validate_failed") return true;
      if (err?.failed_generation !== undefined) return true;
      const msg = typeof err?.message === "string" ? err.message : "";
      return /jsonschema|does not validate|json_validate/i.test(msg);
    } catch {
      return false;
    }
  }

  let response;
  let responseText = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(
        `Groq request attempt ${attempt}/${MAX_ATTEMPTS}`
      );

      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(requestBody),
      });

      responseText = await response.text();

      console.log(
        `Groq response status: ${response.status}`
      );

      // Success
      if (response.ok) {
        break;
      }

      // Only retry transient errors. 429 is intentionally NOT retryable:
      // Groq returns 429 / RESOURCE_EXHAUSTED when the provider quota is
      // exhausted, and retrying immediately will not help — it just burns
      // the backoff window and still fails. We fail fast instead (below).
      const retryableStatuses = [
        408,
        500,
        502,
        503,
        504,
      ];

      // Bounded corrective retry for a Groq schema-validation 400 on the
      // evidenceToMvp section only. 400 stays OUT of retryableStatuses, so we
      // handle it explicitly here: on the FIRST such failure we reinforce the
      // nesting instruction and try exactly once more; on the SECOND we fall
      // through to the graceful error below. Never applied to other sections.
      if (
        section === "evidenceToMvp" &&
        isSchemaValidation400(response.status, responseText) &&
        !correctiveRetryUsed &&
        attempt < MAX_ATTEMPTS
      ) {
        correctiveRetryUsed = true;
        // Log full body server-side only — never to the client.
        console.error(
          "Groq evidenceToMvp schema-validation 400. Retrying once with a reinforced nesting instruction:",
          responseText
        );
        requestBody.messages.push({
          role: "system",
          content:
            "Your previous response was rejected because it did not match the required structure. Return a single JSON object whose ONLY top-level key is \"evidenceToMvp\". ALL of \"assumptions\", \"interviewQuestions\", \"experiment\", and \"mvp\" MUST be nested INSIDE \"evidenceToMvp\". Do NOT place \"experiment\" or \"mvp\" at the top level.",
        });
        continue;
      }

      if (
        !retryableStatuses.includes(response.status) ||
        attempt === MAX_ATTEMPTS
      ) {
        console.error(
          "Groq API error:",
          response.status,
          responseText
        );

        // A schema-validation 400 (corrective retry already spent, or a
        // non-evidenceToMvp section) — return a clean, generic error. Never
        // expose failed_generation, the request body, or any secret.
        if (isSchemaValidation400(response.status, responseText)) {
          return res.status(502).json({
            error:
              "Groq returned a response that did not match the required structure. Please retry.",
          });
        }

        if (response.status === 401 || response.status === 403) {
          return res.status(502).json({
            error:
              "Groq rejected the API request. Check your API key and Groq API access.",
          });
        }

        // 429 → provider quota / rate limit exhausted. This is not transient:
        // retrying immediately will not help, so we do not auto-retry (429 is
        // excluded from retryableStatuses above) and tell the client clearly,
        // with a machine-readable code.
        if (response.status === 429) {
          return res.status(429).json({
            code: "QUOTA_EXHAUSTED",
            error:
              "Groq provider quota is exhausted. This is not a temporary blip — retrying right now will not help. Wait for your quota to reset (free-tier quotas reset on a rolling basis) or use a key/plan with available quota, then try again.",
          });
        }

        // 503 → the service is temporarily unavailable / overloaded. This is
        // transient, so retrying shortly is reasonable.
        if (response.status === 503) {
          return res.status(503).json({
            code: "SERVICE_UNAVAILABLE",
            error:
              "Groq is temporarily unavailable (high demand). This is usually transient — please try again in a moment.",
          });
        }

        return res.status(502).json({
          error:
            `Groq API error ${response.status}. Check the terminal.`,
        });
      }

      // Exponential backoff:
      // attempt 1 → ~1s
      // attempt 2 → ~2s
      // attempt 3 → ~4s
      const baseDelay = 1000 * Math.pow(2, attempt - 1);

      // Add 0–500ms jitter.
      const jitter = Math.floor(Math.random() * 500);

      const delay = baseDelay + jitter;

      console.log(
        `Groq returned ${response.status}. ` +
        `Retrying in ${delay}ms...`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay)
      );
    } catch (error) {
      console.error(
        `Groq request attempt ${attempt} failed:`,
        error
      );

      if (attempt === MAX_ATTEMPTS) {
        return res.status(500).json({
          error:
            "Could not reach Groq after multiple attempts. Please try again.",
        });
      }

      const baseDelay = 1000 * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 500);
      const delay = baseDelay + jitter;

      console.log(
        `Network error. Retrying in ${delay}ms...`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay)
      );
    }
  }

  // ---------------------------------------------------------
  // Parse Groq response
  // ---------------------------------------------------------

  if (!response || !response.ok) {
    console.error(
      "Groq request ultimately failed:",
      response?.status,
      responseText
    );

    return res.status(502).json({
      error:
        "Groq is temporarily unavailable. Please try again.",
    });
  }

  let apiData;

  try {
    apiData = JSON.parse(responseText);
  } catch {
    console.error(
      "Groq HTTP response was not JSON:",
      responseText
    );

    return res.status(502).json({
      error:
        "Groq returned an invalid server response.",
    });
  }

  // Groq returns an OpenAI-compatible shape: choices[0].message.content.
  const rawText = apiData?.choices?.[0]?.message?.content?.trim();

  if (!rawText) {
    console.error(
      "Groq returned no text:",
      responseText
    );

    return res.status(502).json({
      error:
        "Groq returned an empty response. Please retry.",
    });
  }

  // With strict Structured Outputs the content is already clean JSON, but
  // strip any accidental markdown fences as a harmless safety net.
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let result;

  try {
    result = JSON.parse(cleaned);
  } catch {
    console.error(
      "Groq output was not valid JSON:",
      rawText
    );

    return res.status(502).json({
      error:
        "Groq returned an incomplete draft. Please retry.",
    });
  }

  // ---------------------------------------------------------
  // Basic response validation
  // ---------------------------------------------------------

  // Shared BOM shape check: exactly five features with the required
  // two Must / two Should / one Could priority split.
  function bomIsValid(bom) {
    if (!Array.isArray(bom) || bom.length !== 5) return false;
    const counts = { Must: 0, Should: 0, Could: 0 };
    for (const item of bom) {
      if (!item || typeof item.feature !== "string") return false;
      if (!(item.priority in counts)) return false;
      counts[item.priority]++;
    }
    return counts.Must === 2 && counts.Should === 2 && counts.Could === 1;
  }

  if (section === "persona") {
    const p = result.persona;
    if (
      !p ||
      typeof p.name !== "string" ||
      typeof p.tagline !== "string" ||
      typeof p.quote !== "string" ||
      !Array.isArray(p.goals) ||
      !Array.isArray(p.painPoints)
    ) {
      console.error("Groq returned an invalid persona section:", result);
      return res.status(502).json({
        error: "Groq returned an invalid persona. Please retry.",
      });
    }
    return res.status(200).json({ persona: p });
  }

  if (section === "empathyMap") {
    const m = result.empathyMap;
    if (
      !m ||
      !Array.isArray(m.says) ||
      !Array.isArray(m.thinks) ||
      !Array.isArray(m.does) ||
      !Array.isArray(m.feels)
    ) {
      console.error("Groq returned an invalid empathy map:", result);
      return res.status(502).json({
        error: "Groq returned an invalid empathy map. Please retry.",
      });
    }
    return res.status(200).json({ empathyMap: m });
  }

  if (section === "hmw") {
    if (typeof result.hmw !== "string" || !result.hmw.trim()) {
      console.error("Groq returned an invalid HMW:", result);
      return res.status(502).json({
        error: "Groq returned an invalid How Might We. Please retry.",
      });
    }
    return res.status(200).json({ hmw: result.hmw });
  }

  if (section === "bom") {
    if (!bomIsValid(result.bom)) {
      console.error("Groq returned an invalid BOM section:", result.bom);
      return res.status(502).json({
        error: "Groq returned an invalid feature list. Please retry.",
      });
    }
    return res.status(200).json({ bom: result.bom });
  }

  if (section === "evidenceToMvp") {
    const e = result.evidenceToMvp;
    const isStr = (v) => typeof v === "string";
    const assumptionsOk =
      e &&
      Array.isArray(e.assumptions) &&
      e.assumptions.length >= 3 &&
      e.assumptions.length <= 5 &&
      e.assumptions.every(
        (a) =>
          a &&
          isStr(a.assumption) &&
          isStr(a.whyItMatters) &&
          isStr(a.riskIfWrong) &&
          isStr(a.howToTest) &&
          ["Untested", "Testing", "Validated"].includes(a.status)
      );
    const questionsOk =
      e &&
      Array.isArray(e.interviewQuestions) &&
      e.interviewQuestions.length >= 5 &&
      e.interviewQuestions.length <= 7 &&
      e.interviewQuestions.every(isStr);
    const x = e && e.experiment;
    const experimentOk =
      x &&
      isStr(x.hypothesis) &&
      isStr(x.participants) &&
      Array.isArray(x.steps) &&
      x.steps.length >= 1 &&
      x.steps.every(isStr) &&
      isStr(x.measurements) &&
      isStr(x.successCriterion) &&
      isStr(x.effort) &&
      isStr(x.limitations);
    const m = e && e.mvp;
    const mvpOk =
      m &&
      Array.isArray(m.features) &&
      m.features.length === 5 &&
      m.features.every(
        (f) =>
          f &&
          isStr(f.feature) &&
          ["Must", "Should", "Could"].includes(f.priority) &&
          isStr(f.rationale) &&
          isStr(f.dependency) &&
          isStr(f.relatedAssumption)
      ) &&
      Array.isArray(m.coreSubset) &&
      m.coreSubset.length >= 1 &&
      m.coreSubset.every(isStr) &&
      isStr(m.recommendation);

    if (!assumptionsOk || !questionsOk || !experimentOk || !mvpOk) {
      console.error("Groq returned an invalid Evidence-to-MVP section:", result);
      return res.status(502).json({
        error: "Groq returned an invalid Evidence-to-MVP section. Please retry.",
      });
    }

    // Safety: AI output can never arrive pre-validated. Force every
    // assumption to "Untested" regardless of what the model returned.
    e.assumptions = e.assumptions.map((a) => ({ ...a, status: "Untested" }));

    return res.status(200).json({ evidenceToMvp: e });
  }

  // Full blueprint validation (unchanged behavior).
  if (
    !result.persona ||
    !result.empathyMap ||
    !result.hmw ||
    !Array.isArray(result.bom)
  ) {
    console.error(
      "Groq returned incomplete blueprint:",
      result
    );

    return res.status(502).json({
      error:
        "Groq returned an incomplete blueprint. Please retry.",
    });
  }

  if (result.bom.length !== 5) {
    console.error(
      "Unexpected BOM length:",
      result.bom.length
    );

    return res.status(502).json({
      error:
        "Groq returned an invalid feature list. Please retry.",
    });
  }

  return res.status(200).json(result);
}