import express from "express";
import fetch from "node-fetch";

const router = express.Router();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

// ── Prompts ───────────────────────────────────────────────────────────────────

const PROFILE_SYSTEM_PROMPT = `You are an accessibility routing assistant for PivotPath, an adaptive navigation app for wheelchair users, seniors, and mobility-impaired travelers in Pune, India.

Your job is to parse a free-text mobility profile from a user and extract a 5-factor priority scoring matrix.

The 5 factors and their DEFAULT weights are:
- Access (accessibility): 35%
- Safety: 25%
- Crowd avoidance: 15%
- Convenience: 10%
- Cost: 15%

Based on the user's profile text, adjust these weights to reflect their priorities. The weights must sum to 100.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "access": <number 0-100>,
  "safety": <number 0-100>,
  "crowd": <number 0-100>,
  "convenience": <number 0-100>,
  "cost": <number 0-100>,
  "summary": "<one sentence plain-language summary of the user's profile>"
}`;

const RECOVERY_SYSTEM_PROMPT = `You are an accessibility routing assistant for PivotPath.

Given a disruption scenario and route scoring data, generate a short, empathetic, plain-language explanation (2-3 sentences) for a wheelchair user or mobility-impaired traveler explaining:
1. What changed and why the route rankings shifted.
2. Which route is now recommended and why it is the best accessible option given the disruption.

Be clear, reassuring, and specific. Avoid jargon. Return ONLY the plain-language explanation text — no JSON, no markdown.`;

// ── Smart Fallbacks (when Ollama is offline or uninstalled) ───────────────────

function fallbackParseProfile(text) {
  const t = text.toLowerCase();
  let access = 35;
  let safety = 25;
  let crowd = 15;
  let convenience = 10;
  let cost = 15;

  let summaryParts = [];

  if (t.includes("wheelchair") || t.includes("power") || t.includes("stair") || t.includes("ramp") || t.includes("lift") || t.includes("kerb") || t.includes("step")) {
    access += 15;
    safety += 5;
    convenience -= 10;
    cost -= 10;
    summaryParts.push("Step-free accessibility prioritised (wheelchair user)");
  }
  if (t.includes("senior") || t.includes("elderly") || t.includes("cane") || t.includes("walk slow") || t.includes("rest") || t.includes("bench")) {
    safety += 15;
    access += 5;
    crowd -= 5;
    convenience -= 15;
    summaryParts.push("Senior traveler prioritising safety and rest intervals");
  }
  if (t.includes("crowd") || t.includes("quiet") || t.includes("anxiety") || t.includes("sensory") || t.includes("calm")) {
    crowd += 15;
    convenience -= 10;
    cost -= 5;
    summaryParts.push("Low-crowd quiet detour preference");
  }
  if (t.includes("fast") || t.includes("quick") || t.includes("hurry") || t.includes("direct") || t.includes("speed")) {
    convenience += 20;
    access -= 10;
    safety -= 10;
    summaryParts.push("Fastest direct travel priority");
  }
  if (t.includes("budget") || t.includes("cheap") || t.includes("cost") || t.includes("fare") || t.includes("free")) {
    cost += 20;
    convenience -= 10;
    safety -= 10;
    summaryParts.push("Cost-conscious budget travel");
  }

  // Clamp each to minimum 5
  access = Math.max(5, access);
  safety = Math.max(5, safety);
  crowd = Math.max(5, crowd);
  convenience = Math.max(5, convenience);
  cost = Math.max(5, cost);

  const total = access + safety + crowd + convenience + cost;
  access = Math.round((access / total) * 100);
  safety = Math.round((safety / total) * 100);
  crowd = Math.round((crowd / total) * 100);
  convenience = Math.round((convenience / total) * 100);
  cost = 100 - (access + safety + crowd + convenience);

  const summary = summaryParts.length > 0
    ? summaryParts.join("; ") + "."
    : "Mobility profile parsed into 5-factor weighting matrix.";

  return { access, safety, crowd, convenience, cost, summary };
}

function fallbackRecoveryExplanation(scenario, recommendedRoute, beforeScores, afterScores, stageName = "") {
  const atPosition = stageName ? ` from ${stageName}` : "";
  if (scenario.toLowerCase().includes("barrier") || scenario.toLowerCase().includes("elevator") || scenario.toLowerCase().includes("lift")) {
    return `An elevator malfunction or physical curb barrier on the Accessible Main Corridor has made that section impassable for wheelchairs. We recommend immediately diverting${atPosition} to ${recommendedRoute}. This route avoids all mechanical lifts, offers continuous step-free pavements through Model Colony, and adds only a minor detour.`;
  }
  if (scenario.toLowerCase().includes("rain") || scenario.toLowerCase().includes("flood")) {
    return `Heavy monsoon rains have caused surface waterlogging along the open JM Road corridor. We have re-routed you${atPosition} to ${recommendedRoute}, which provides covered footpaths, slip-resistant tactile paving, and protected crossings.`;
  }
  if (scenario.toLowerCase().includes("crowd")) {
    return `Significant crowd congestion was detected along the main arterial corridor. To ensure safe navigation, we recommend switching${atPosition} to ${recommendedRoute}, offering quieter residential sidewalks and minimal pedestrian resistance.`;
  }
  return `A route disruption occurred. Based on your mobility profile, ${recommendedRoute} is currently the optimal accessible alternative with the highest safety and accessibility score${atPosition}.`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/llm/parse-profile
 * Body: { profileText: string }
 * Returns: { access, safety, crowd, convenience, cost, summary }
 */
router.post("/parse-profile", async (req, res) => {
  const { profileText } = req.body;

  if (!profileText || typeof profileText !== "string") {
    return res.status(400).json({ error: "profileText (string) is required" });
  }

  // Attempt Ollama with short timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const ollamaPayload = {
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: PROFILE_SYSTEM_PROMPT },
        { role: "user", content: profileText },
      ],
      stream: false,
    };

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ollamaPayload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const content = data?.message?.content || "";
      const parsed = JSON.parse(content.trim());

      // Ensure weights sum to 100
      const keys = ["access", "safety", "crowd", "convenience", "cost"];
      const total = keys.reduce((sum, k) => sum + (parsed[k] || 0), 0);
      if (total !== 100) {
        keys.forEach((k) => {
          parsed[k] = Math.round((parsed[k] / total) * 100);
        });
        const diff = 100 - keys.reduce((s, k) => s + parsed[k], 0);
        parsed[keys[0]] += diff;
      }
      return res.json({ ...parsed, provider: "ollama" });
    }
  } catch {
    // Ollama offline / timed out → use smart local fallback
  }

  const fallback = fallbackParseProfile(profileText);
  res.json({ ...fallback, provider: "local-parser" });
});

/**
 * POST /api/llm/recovery-explanation
 * Body: {
 *   scenario: string,
 *   recommendedRoute: string,
 *   beforeScores: object,
 *   afterScores: object,
 *   stageName?: string
 * }
 * Returns: { explanation: string }
 */
router.post("/recovery-explanation", async (req, res) => {
  let scenario = req.body.scenario || req.body.scenarioName;
  if (typeof scenario === "object" && scenario !== null) {
    scenario = scenario.label || scenario.name || scenario.id || "";
  }
  let recommendedRoute = req.body.recommendedRoute || req.body.recommendedRouteName;
  if (typeof recommendedRoute === "object" && recommendedRoute !== null) {
    recommendedRoute = recommendedRoute.shortName || recommendedRoute.name || recommendedRoute.id || "";
  }
  const beforeScores = req.body.beforeScores || {};
  const afterScores = req.body.afterScores || {};
  const stageName = req.body.stageName || req.body.stage || "";

  if (!scenario || !recommendedRoute) {
    return res.status(400).json({ error: "scenario and recommendedRoute are required" });
  }

  const timeoutMs = Number(req.body.timeout) || 3500;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const userMessage = `Disruption scenario: ${scenario}
Stage/Position: ${stageName || "Mid-journey"}
Recommended route after disruption: ${recommendedRoute}
Before scores: ${JSON.stringify(beforeScores)}
After scores:  ${JSON.stringify(afterScores)}`;

    const ollamaPayload = {
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: RECOVERY_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      options: {
        num_predict: 90,
        temperature: 0.3,
      },
      stream: false,
    };

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ollamaPayload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const explanation = data?.message?.content?.trim() || "";
      if (explanation) {
        return res.json({ explanation, provider: "ollama" });
      }
    }
  } catch {
    // Ollama offline / timed out → use smart fallback
  }

  const explanation = fallbackRecoveryExplanation(scenario, recommendedRoute, beforeScores, afterScores, stageName);
  res.json({ explanation, provider: "local-generator" });
});

export default router;
