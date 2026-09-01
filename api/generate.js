// Replace api/generate.js with this file.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests are allowed." });
  }

  const { problem, targetUser } = req.body || {};
  if (!problem?.trim() || !targetUser?.trim()) {
    return res.status(400).json({ error: "Please provide both a problem and target user." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
  }

  const prompt = `You are a Design Thinking facilitator helping a student.
Return ONLY valid JSON. Do not use markdown or code fences.
Create a specific first draft based on the problem and target user.
Treat persona and empathy-map content as hypotheses, not proven research.
Each array must contain exactly three short items.
The BOM must contain exactly five items: two Must, two Should, one Could.

Return exactly this structure:
{
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
}

Problem: ${problem.trim()}
Target user: ${targetUser.trim()}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1600,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, responseText);
      return res.status(502).json({ error: `Gemini API error ${response.status}. Check the terminal.` });
    }

    let apiData;
    try {
      apiData = JSON.parse(responseText);
    } catch {
      console.error("Gemini HTTP response was not JSON:", responseText);
      return res.status(502).json({ error: "Gemini returned an invalid server response." });
    }

    const rawText = apiData?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!rawText) {
      console.error("Gemini returned no text:", responseText);
      return res.status(502).json({ error: "Gemini returned an empty response. Please retry." });
    }

    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      console.error("Gemini output was not valid JSON:", rawText);
      return res.status(502).json({ error: "Gemini returned an incomplete draft. Please retry." });
    }

    if (!result.persona || !result.empathyMap || !result.hmw || !Array.isArray(result.bom)) {
      return res.status(502).json({ error: "Gemini returned an incomplete blueprint. Please retry." });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Request failed:", error);
    return res.status(500).json({ error: "Could not reach Gemini. Please retry." });
  }
}
