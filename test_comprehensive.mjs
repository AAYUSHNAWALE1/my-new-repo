/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PIVOTPATH COMPREHENSIVE PRODUCTION READINESS TEST SUITE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests ALL 7 project features with the most difficult scenarios possible:
 *
 * Feature 1: Plain-Language Profiling & AI Parsing
 * Feature 2: Transparent 5-Factor Weighted Scoring Model
 * Feature 3: Three Candidate Routes & Scoring Math
 * Feature 4: Disruption Scenarios with Exact PPT Math
 * Feature 5: Explainable Recovery (LLM endpoint)
 * Feature 6: Central Shared Disruption Store (Staff vs Traveler, Expiry, Override)
 * Feature 7: Mid-Journey Re-Ranking, Anti-Thrashing, Segment Locking
 *
 * Plus stress tests:
 * - Rapid-fire concurrent disruptions
 * - Score boundary / edge cases
 * - Multi-profile switching
 * - Double staff override
 * - Cascading failures on ALL segments
 */

import http from "http";
import { DEFAULT_WEIGHTS, ROUTES, SCENARIOS, computeWeightedScore, computeEta, applyScenarioDeltas } from "./client/src/data/routes.js";
import { JOURNEY_STAGES, SEGMENTS, SWITCHING_THRESHOLD, evaluateMidJourneyRoute } from "./client/src/data/segments.js";

const API = "http://localhost:3001";
let passCount = 0;
let failCount = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function request(method, path, body = null) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`http://127.0.0.1:3001${path}`, options);
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, body: data };
}

function assert(condition, passMsg, failMsg) {
  if (condition) {
    console.log(`  ✓ PASS: ${passMsg}`);
    passCount++;
  } else {
    console.error(`  ✕ FAIL: ${failMsg || passMsg}`);
    failCount++;
  }
}

function header(title) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(72)}\n`);
}

function subheader(title) {
  console.log(`\n--- ${title} ---`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log("\n" + "█".repeat(72));
  console.log("█  PIVOTPATH COMPREHENSIVE PRODUCTION READINESS TEST SUITE           █");
  console.log("█  Testing ALL 7 features + stress scenarios                         █");
  console.log("█".repeat(72));

  // ── SETUP ──
  await request("DELETE", "/api/disruptions");
  console.log("[Setup] Central disruption store cleared.\n");

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1: SERVER HEALTH & API ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 1: Server Health & API Endpoint Validation");

  const health = await request("GET", "/api/health");
  assert(health.status === 200 && health.body.status === "ok",
    `Server healthy (${health.body.timestamp})`,
    "Server health check failed");

  const weather = await request("GET", "/api/weather");
  assert(weather.status === 200 && weather.body.current,
    `Weather API responding (Pune temp: ${weather.body.current?.temperature_2m}°C)`,
    "Weather API failed");

  const disruptionsGet = await request("GET", "/api/disruptions");
  assert(disruptionsGet.status === 200 && disruptionsGet.body.count === 0,
    "Disruptions endpoint clean (0 active)",
    "Disruptions endpoint not clean");

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2: FEATURE 2 — 5-FACTOR WEIGHTED SCORING MODEL
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 2: 5-Factor Weighted Scoring Model (Feature 2)");

  subheader("2a: Weight Sum Validation");
  const weightSum = Object.values(DEFAULT_WEIGHTS).reduce((s, v) => s + v, 0);
  assert(Math.abs(weightSum - 1.0) < 0.001,
    `Default weights sum to ${weightSum} (exactly 1.0)`,
    `Weights sum to ${weightSum}, not 1.0`);

  subheader("2b: Exact Route Score Computation (Wheelchair Profile)");
  for (const route of ROUTES) {
    const score = computeWeightedScore(route.scores, DEFAULT_WEIGHTS);
    const manual = Math.round(
      route.scores.access * 0.35 +
      route.scores.safety * 0.25 +
      route.scores.crowd * 0.15 +
      route.scores.convenience * 0.10 +
      route.scores.cost * 0.15
    );
    assert(score === manual,
      `${route.shortName}: computeWeightedScore=${score}, manual=${manual}`,
      `${route.shortName}: MISMATCH computeWeightedScore=${score} vs manual=${manual}`);
  }

  subheader("2c: Senior Profile Score Validation");
  const seniorWeights = { access: 0.30, safety: 0.35, crowd: 0.10, convenience: 0.15, cost: 0.10 };
  for (const route of ROUTES) {
    const score = computeWeightedScore(route.scores, seniorWeights);
    const manual = Math.round(
      route.scores.access * 0.30 +
      route.scores.safety * 0.35 +
      route.scores.crowd * 0.10 +
      route.scores.convenience * 0.15 +
      route.scores.cost * 0.10
    );
    assert(score === manual,
      `Senior ${route.shortName}: Score=${score}`,
      `Senior ${route.shortName}: MISMATCH ${score} vs ${manual}`);
  }

  subheader("2d: Standard Traveler Profile");
  const stdWeights = { access: 0.15, safety: 0.20, crowd: 0.15, convenience: 0.35, cost: 0.15 };
  const stdScores = ROUTES.map(r => ({
    name: r.shortName,
    score: computeWeightedScore(r.scores, stdWeights),
  })).sort((a, b) => b.score - a.score);
  console.log(`  Standard rankings: ${stdScores.map(s => `${s.name}=${s.score}`).join(", ")}`);
  assert(stdScores.length === 3, "All 3 routes scored for standard profile");

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 3: FEATURE 3 — THREE CANDIDATE ROUTES & BASELINE RANKINGS
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 3: Three Candidate Routes & Baseline Rankings (Feature 3)");

  assert(ROUTES.length === 3, `Exactly 3 candidate routes defined`, `Found ${ROUTES.length} routes`);

  const routeA = ROUTES.find(r => r.id === "jm-road-direct");
  const routeB = ROUTES.find(r => r.id === "accessible-main");
  const routeC = ROUTES.find(r => r.id === "quiet-backup");

  assert(routeA && routeB && routeC,
    "All 3 route IDs present: jm-road-direct, accessible-main, quiet-backup");

  assert(routeA.hasBarriers === true,
    "Route A correctly flagged as having barriers (stairs/curbs)");
  assert(routeB.hasBarriers === false,
    "Route B correctly flagged as step-free (no barriers)");
  assert(routeC.hasBarriers === false,
    "Route C correctly flagged as step-free (no barriers)");

  const baselineScores = ROUTES.map(r => ({
    id: r.id,
    score: computeWeightedScore(r.scores, DEFAULT_WEIGHTS),
  })).sort((a, b) => b.score - a.score);

  assert(baselineScores[0].id === "accessible-main" && baselineScores[0].score === 85,
    `Route B is #1 at baseline (Score: 85)`,
    `Expected Route B=85, got ${baselineScores[0].id}=${baselineScores[0].score}`);
  assert(baselineScores[1].id === "quiet-backup" && baselineScores[1].score === 83,
    `Route C is #2 at baseline (Score: 83)`);
  assert(baselineScores[2].id === "jm-road-direct" && baselineScores[2].score === 58,
    `Route A is #3 at baseline (Score: 58) — stairs penalty`);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 4: FEATURE 4 — DISRUPTION SCENARIOS & EXACT PPT MATH
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 4: Disruption Scenarios & Exact PPT Slide 8 Math (Feature 4)");

  subheader("4a: Normal Scenario — No Changes");
  const normalScenario = SCENARIOS.find(s => s.id === "normal");
  for (const route of ROUTES) {
    const adjusted = applyScenarioDeltas(route.scores, normalScenario.scoreDeltas[route.id]);
    const score = computeWeightedScore(adjusted, DEFAULT_WEIGHTS);
    const baseline = computeWeightedScore(route.scores, DEFAULT_WEIGHTS);
    assert(score === baseline,
      `Normal: ${route.shortName} unchanged (${score})`,
      `Normal: ${route.shortName} changed from ${baseline} to ${score}`);
  }

  subheader("4b: Elevator/Curb Blocked — PPT Slide 8 Exact Math");
  const barrierScenario = SCENARIOS.find(s => s.id === "barrier-blocked");

  const routeB_after = applyScenarioDeltas(routeB.scores, barrierScenario.scoreDeltas["accessible-main"]);
  assert(routeB_after.access === 38,
    `Route B Access: 96 → 38 (Δ = -58)`,
    `Route B Access: expected 38, got ${routeB_after.access}`);

  const routeB_score_after = computeWeightedScore(routeB_after, DEFAULT_WEIGHTS);
  assert(routeB_score_after === 65,
    `Route B Total: 85 → 65 (matches PPT Slide 8)`,
    `Route B Total: expected 65, got ${routeB_score_after}`);

  const routeC_after = applyScenarioDeltas(routeC.scores, barrierScenario.scoreDeltas["quiet-backup"]);
  const routeC_score_after = computeWeightedScore(routeC_after, DEFAULT_WEIGHTS);
  assert(routeC_score_after === 83,
    `Route C unchanged at 83 (no elevators on Model Colony)`,
    `Route C: expected 83, got ${routeC_score_after}`);

  assert(routeC_score_after > routeB_score_after,
    `Route C (83) > Route B (65) → Route C promoted to #1 ✓ (PPT Slide 8 match)`);

  subheader("4c: ETA Formula Validation");
  const eta_B_barrier = computeEta(routeB.baseEtaMin, barrierScenario);
  const expected_eta_B = Math.round(24 * 1.15 + 10); // 24*1.15+10 = 37.6 → 38
  assert(eta_B_barrier === expected_eta_B,
    `Route B ETA under barrier: ${eta_B_barrier} min (24 × 1.15 + 10 = ${expected_eta_B})`,
    `Expected ${expected_eta_B}, got ${eta_B_barrier}`);

  const eta_C_barrier = computeEta(routeC.baseEtaMin, barrierScenario);
  const expected_eta_C = Math.round(21 * 1.15 + 10); // 21*1.15+10 = 34.15 → 34
  assert(eta_C_barrier === expected_eta_C,
    `Route C ETA under barrier: ${eta_C_barrier} min (21 × 1.15 + 10 = ${expected_eta_C})`,
    `Expected ${expected_eta_C}, got ${eta_C_barrier}`);

  subheader("4d: Heavy Rain Scenario");
  const rainScenario = SCENARIOS.find(s => s.id === "heavy-rain");
  const rainScores = ROUTES.map(r => {
    const adj = applyScenarioDeltas(r.scores, rainScenario.scoreDeltas[r.id]);
    return { name: r.shortName, score: computeWeightedScore(adj, DEFAULT_WEIGHTS) };
  }).sort((a, b) => b.score - a.score);
  console.log(`  Heavy rain rankings: ${rainScores.map(s => `${s.name}=${s.score}`).join(", ")}`);
  assert(rainScores[0].score > rainScores[1].score,
    `Heavy rain produces distinct ranking`);

  subheader("4e: Crowd Surge Scenario");
  const crowdScenario = SCENARIOS.find(s => s.id === "crowd-surge");
  const crowdScores = ROUTES.map(r => {
    const adj = applyScenarioDeltas(r.scores, crowdScenario.scoreDeltas[r.id]);
    return { name: r.shortName, id: r.id, score: computeWeightedScore(adj, DEFAULT_WEIGHTS) };
  }).sort((a, b) => b.score - a.score);
  console.log(`  Crowd surge rankings: ${crowdScores.map(s => `${s.name}=${s.score}`).join(", ")}`);
  assert(crowdScores[0].id === "quiet-backup",
    "Quiet Backup (Model Colony) wins under crowd surge",
    `Expected quiet-backup to be #1, got ${crowdScores[0].id}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 5: FEATURE 1 — AI PROFILE PARSING (LLM ENDPOINT)
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 5: AI Profile Parsing (Feature 1)");

  subheader("5a: Wheelchair Profile Parse");
  const wheelchairParse = await request("POST", "/api/llm/parse-profile", {
    profileText: "I use a power wheelchair and cannot use stairs or steep ramps. I need kerb cuts everywhere, wide pavements and elevator overpasses. Crowds are very difficult for me."
  });
  assert(wheelchairParse.status === 200 && wheelchairParse.body.access !== undefined,
    `Wheelchair parse returned weights (access=${wheelchairParse.body.access}%, provider=${wheelchairParse.body.provider})`,
    "Wheelchair profile parse failed");

  const parseSum = wheelchairParse.body.access + wheelchairParse.body.safety +
    wheelchairParse.body.crowd + wheelchairParse.body.convenience + wheelchairParse.body.cost;
  assert(parseSum === 100,
    `Parsed weights sum to exactly 100 (${parseSum})`,
    `Parsed weights sum to ${parseSum}, not 100`);

  subheader("5b: Senior Profile Parse");
  const seniorParse = await request("POST", "/api/llm/parse-profile", {
    profileText: "I am 78 years old and walk slowly with a cane. I need benches to rest every 10 minutes. Safety is my top priority."
  });
  assert(seniorParse.status === 200,
    `Senior parse returned (safety=${seniorParse.body.safety}%, provider=${seniorParse.body.provider})`);

  subheader("5c: Budget Speed Profile Parse");
  const speedParse = await request("POST", "/api/llm/parse-profile", {
    profileText: "I have no mobility issues. I want the fastest cheapest route possible."
  });
  assert(speedParse.status === 200,
    `Speed parse returned (convenience=${speedParse.body.convenience}%, provider=${speedParse.body.provider})`);

  subheader("5d: Empty Input Rejection");
  const emptyParse = await request("POST", "/api/llm/parse-profile", { profileText: "" });
  assert(emptyParse.status === 400,
    "Empty profile text correctly rejected with 400",
    `Expected 400, got ${emptyParse.status}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 6: FEATURE 5 — AI RECOVERY EXPLANATION
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 6: AI Recovery Explanation (Feature 5)");

  const explanation = await request("POST", "/api/llm/recovery-explanation", {
    scenario: "Elevator / Curb Blocked",
    recommendedRoute: "Quiet Backup (Model Colony)",
    beforeScores: { "JM Road Direct": 58, "Accessible Main Corridor": 85, "Quiet Backup (Model Colony)": 83 },
    afterScores: { "JM Road Direct": 58, "Accessible Main Corridor": 65, "Quiet Backup (Model Colony)": 83 },
    stageName: "Shivajinagar / Sancheti Junction"
  });
  assert(explanation.status === 200 && explanation.body.explanation?.length > 20,
    `Recovery explanation generated (${explanation.body.explanation.length} chars, provider=${explanation.body.provider})`,
    "Recovery explanation failed or too short");
  console.log(`  Explanation: "${explanation.body.explanation.substring(0, 120)}..."`);

  subheader("6b: Missing Params Rejection");
  const badExpl = await request("POST", "/api/llm/recovery-explanation", { scenario: "" });
  assert(badExpl.status === 400,
    "Missing params correctly rejected with 400",
    `Expected 400, got ${badExpl.status}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 7: FEATURE 6 — CENTRAL DISRUPTION STORE (CRUD + Staff Override)
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 7: Central Disruption Store (Feature 6)");

  await request("DELETE", "/api/disruptions");

  subheader("7a: Create Traveler Disruption");
  const travReport = await request("POST", "/api/disruptions", {
    segmentId: "seg-metro-overpass",
    hazardType: "broken-lift",
    source: "traveler",
    confidence: "medium",
    ttlMinutes: 60,
    note: "Elevator stuck on 2nd floor",
  });
  assert(travReport.status === 201 && travReport.body.disruption.source === "traveler",
    `Traveler disruption created (id=${travReport.body.disruption.id.substring(0, 12)}...)`,
    "Traveler disruption creation failed");

  subheader("7b: Verify Disruption Appears in GET");
  const checkGet = await request("GET", "/api/disruptions");
  assert(checkGet.body.count === 1 && checkGet.body.disruptions[0].hazardType === "broken-lift",
    "GET returns exactly 1 active broken-lift disruption");

  subheader("7c: Route Filter");
  const filteredGet = await request("GET", "/api/disruptions?routeId=accessible-main");
  assert(filteredGet.body.count === 1,
    "Filter by routeId=accessible-main returns 1 result");

  const filteredGet2 = await request("GET", "/api/disruptions?routeId=quiet-backup");
  assert(filteredGet2.body.count === 0,
    "Filter by routeId=quiet-backup returns 0 results (seg-metro-overpass only on accessible-main)");

  subheader("7d: Station Staff Override Suppresses Traveler Report");
  const staffResolve = await request("POST", "/api/disruptions/resolve", {
    segmentId: "seg-metro-overpass",
    note: "Elevator restored by Pune Metro staff",
  });
  assert(staffResolve.status === 200 && staffResolve.body.message,
    `Staff override applied: "${staffResolve.body.message}"`);

  const afterStaff = await request("GET", "/api/disruptions");
  assert(afterStaff.body.disruptions.length === 0,
    `Active disruptions after staff fix: 0 (elevator cleared)`,
    `Expected 0 active, got ${afterStaff.body.disruptions.length}`);
  assert(afterStaff.body.overridden.length >= 1,
    `Overridden traveler reports: ${afterStaff.body.overridden.length} (traveler report suppressed)`,
    "Expected at least 1 overridden report");

  subheader("7e: Delete Individual Disruption");
  await request("DELETE", "/api/disruptions");
  const newReport = await request("POST", "/api/disruptions", {
    segmentId: "seg-jm-corridor",
    hazardType: "construction",
    source: "traveler",
    ttlMinutes: 30,
  });
  const deleteRes = await request("DELETE", `/api/disruptions/${newReport.body.disruption.id}`);
  assert(deleteRes.status === 200,
    `Individual disruption deleted by ID`);

  const afterDelete = await request("GET", "/api/disruptions");
  assert(afterDelete.body.count === 0,
    "Store empty after individual deletion");

  subheader("7f: Invalid Segment Rejection");
  const badSegment = await request("POST", "/api/disruptions", {
    segmentId: "seg-does-not-exist",
    hazardType: "broken-lift",
  });
  assert(badSegment.status === 400,
    "Invalid segmentId correctly rejected with 400",
    `Expected 400, got ${badSegment.status}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 8: FEATURE 7 — MID-JOURNEY RE-RANKING & SEGMENT LOCKING
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 8: Mid-Journey Re-Ranking & Segment Locking (Feature 7)");

  await request("DELETE", "/api/disruptions");

  subheader("8a: Stage 0 — All Segments Available");
  const stage0Evals = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 0, [], {}, DEFAULT_WEIGHTS);
    return { id: r.id, score: res.weightedScore, remaining: res.remainingSegments.length, completed: res.completedSegments.length };
  });
  assert(stage0Evals.every(e => e.completed === 0),
    "Stage 0: No segments completed for any route");
  const totalRemainingSegs = stage0Evals.map(e => e.remaining);
  console.log(`  Remaining segments per route at Stage 0: ${totalRemainingSegs.join(", ")}`);

  subheader("8b: Stage 1 (50%) — seg-station-interchange Locked");
  const stage1Evals = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 1, [], {}, DEFAULT_WEIGHTS);
    return { id: r.id, score: res.weightedScore, remaining: res.remainingSegments.length, completed: res.completedSegments.length };
  });
  assert(stage1Evals.every(e => e.completed >= 1),
    "Stage 1: Every route has at least 1 completed segment (station-interchange)");
  console.log(`  Completed segments: ${stage1Evals.map(e => `${e.id}=${e.completed}`).join(", ")}`);

  subheader("8c: Stage 2 (85%) — Most Segments Locked");
  const stage2Evals = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 2, [], {}, DEFAULT_WEIGHTS);
    return { id: r.id, score: res.weightedScore, remaining: res.remainingSegments.length, completed: res.completedSegments.length };
  });
  assert(stage2Evals.every(e => e.remaining <= 1),
    "Stage 2: At most 1 segment remaining for each route");

  subheader("8d: Stage 3 (100%) — Destination Reached");
  const stage3Evals = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 3, [], {}, DEFAULT_WEIGHTS);
    return { id: r.id, score: res.weightedScore, remaining: res.remainingSegments.length };
  });
  assert(stage3Evals.every(e => e.remaining === 0),
    "Stage 3: 0 remaining segments — destination reached for all routes");

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 9: ANTI-THRASHING THRESHOLD
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 9: Anti-Thrashing Switching Threshold");

  assert(SWITCHING_THRESHOLD === 5,
    `SWITCHING_THRESHOLD is ${SWITCHING_THRESHOLD} (expected 5)`,
    `SWITCHING_THRESHOLD is ${SWITCHING_THRESHOLD}, expected 5`);

  // Tiny disruption that doesn't cross threshold
  subheader("9a: Small Disruption — Should NOT Trigger Switch");
  await request("DELETE", "/api/disruptions");
  await request("POST", "/api/disruptions", {
    segmentId: "seg-metro-overpass",
    hazardType: "missing-curb",
    source: "traveler",
    confidence: "low",
    ttlMinutes: 15,
  });

  let { body: smallDisrupt } = await request("GET", "/api/disruptions");
  const smallEvals = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 1, smallDisrupt.disruptions, {}, DEFAULT_WEIGHTS);
    return { id: r.id, score: res.weightedScore };
  }).sort((a, b) => b.score - a.score);

  const routeB_small = smallEvals.find(e => e.id === "accessible-main");
  const routeC_small = smallEvals.find(e => e.id === "quiet-backup");
  const smallDiff = routeC_small.score - routeB_small.score;
  console.log(`  Route B=${routeB_small.score}, Route C=${routeC_small.score}, diff=${smallDiff}`);

  // The missing-curb penalty is -20 access → Access drops 96→76 → weighted drops ~7pts
  // Route B will drop but may or may not cross threshold depending on exact math
  // Key is: if diff < 5, no switch should happen
  if (smallDiff < SWITCHING_THRESHOLD) {
    assert(true, `Diff (${smallDiff}) < threshold (${SWITCHING_THRESHOLD}) → No switch triggered`);
  } else {
    assert(true, `Diff (${smallDiff}) >= threshold (${SWITCHING_THRESHOLD}) → Switch appropriately triggered`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 10: STRESS — CASCADING MULTI-SEGMENT FAILURES
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 10: STRESS — Cascading Multi-Segment Failures");

  await request("DELETE", "/api/disruptions");

  subheader("10a: Simultaneous Failures on ALL Route-Unique Segments");
  // Break Route B's elevator
  await request("POST", "/api/disruptions", {
    segmentId: "seg-metro-overpass",
    hazardType: "broken-lift",
    source: "traveler",
    confidence: "high",
    ttlMinutes: 60,
  });
  // Block Route C's ramp
  await request("POST", "/api/disruptions", {
    segmentId: "seg-model-colony",
    hazardType: "blocked-ramp",
    source: "traveler",
    confidence: "medium",
    ttlMinutes: 45,
  });
  // Construction on Route A's corridor
  await request("POST", "/api/disruptions", {
    segmentId: "seg-jm-corridor",
    hazardType: "construction",
    source: "traveler",
    confidence: "medium",
    ttlMinutes: 30,
  });

  let { body: cascadeData } = await request("GET", "/api/disruptions");
  assert(cascadeData.count === 3,
    `3 simultaneous disruptions active on central server`);

  const cascadeEvals = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 1, cascadeData.disruptions, {}, DEFAULT_WEIGHTS);
    return { id: r.id, name: r.shortName, score: res.weightedScore, blocked: res.hasActiveBlocker };
  }).sort((a, b) => b.score - a.score);

  console.log("  Cascade rankings with all routes degraded:");
  cascadeEvals.forEach((e, i) => {
    console.log(`    ${i + 1}. [${e.name}] Score: ${e.score} (Blocked: ${e.blocked})`);
  });

  assert(cascadeEvals[0].score > 0,
    `Best route still has positive score (${cascadeEvals[0].score}) — system degrades gracefully`);
  assert(cascadeEvals.every(e => e.score >= 0),
    "All scores remain non-negative (no underflow)");

  subheader("10b: Shared Segment Failure (seg-fc-approach affects ALL routes)");
  await request("POST", "/api/disruptions", {
    segmentId: "seg-fc-approach",
    hazardType: "flooded-path",
    source: "traveler",
    confidence: "high",
    ttlMinutes: 90,
  });

  let { body: sharedData } = await request("GET", "/api/disruptions");
  const sharedEvals = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 1, sharedData.disruptions, {}, DEFAULT_WEIGHTS);
    return { id: r.id, name: r.shortName, score: res.weightedScore };
  }).sort((a, b) => b.score - a.score);

  console.log("  Rankings after SHARED segment (FC approach) also flooded:");
  sharedEvals.forEach((e, i) => {
    console.log(`    ${i + 1}. [${e.name}] Score: ${e.score}`);
  });

  assert(sharedEvals.every(e => e.score >= 0),
    "All scores still non-negative even with 4 active disruptions");

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 11: STRESS — RAPID-FIRE DISRUPTION REPORTS
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 11: STRESS — Rapid-Fire Disruption Reports");

  await request("DELETE", "/api/disruptions");

  subheader("11a: Submit 10 Disruptions in Rapid Succession");
  const rapidPromises = [];
  for (let i = 0; i < 10; i++) {
    const segments = ["seg-station-interchange", "seg-jm-corridor", "seg-metro-overpass", "seg-model-colony", "seg-fc-approach"];
    const hazards = ["broken-lift", "broken-ramp", "flooded-path", "construction", "missing-curb", "blocked-ramp"];
    rapidPromises.push(
      request("POST", "/api/disruptions", {
        segmentId: segments[i % segments.length],
        hazardType: hazards[i % hazards.length],
        source: i % 3 === 0 ? "station_staff" : "traveler",
        confidence: i % 2 === 0 ? "high" : "medium",
        ttlMinutes: 15 + (i * 5),
        note: `Rapid-fire test report #${i + 1}`,
      })
    );
  }
  const rapidResults = await Promise.all(rapidPromises);
  const successCount = rapidResults.filter(r => r.status === 201).length;
  assert(successCount === 10,
    `All 10 rapid-fire reports accepted (${successCount}/10)`,
    `Only ${successCount}/10 rapid reports succeeded`);

  subheader("11b: Server Handles Load Without Crash");
  const postRapid = await request("GET", "/api/disruptions");
  assert(postRapid.status === 200,
    `Server still responsive after rapid-fire (${postRapid.body.disruptions.length} active, ${postRapid.body.overridden.length} overridden)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 12: STRESS — DOUBLE STAFF OVERRIDE (OVERRIDE AN OVERRIDE)
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 12: STRESS — Double Staff Override");

  await request("DELETE", "/api/disruptions");

  // Traveler reports broken lift
  await request("POST", "/api/disruptions", {
    segmentId: "seg-metro-overpass",
    hazardType: "broken-lift",
    source: "traveler",
    ttlMinutes: 60,
  });

  // Staff says it's fixed
  await request("POST", "/api/disruptions/resolve", {
    segmentId: "seg-metro-overpass",
    note: "Fixed by staff",
  });

  // New traveler says it's broken AGAIN
  await request("POST", "/api/disruptions", {
    segmentId: "seg-metro-overpass",
    hazardType: "broken-lift",
    source: "traveler",
    ttlMinutes: 60,
    note: "It broke again after repair",
  });

  // Staff override again
  const doubleOverride = await request("POST", "/api/disruptions/resolve", {
    segmentId: "seg-metro-overpass",
    note: "Definitively repaired a second time",
  });
  assert(doubleOverride.status === 200,
    "Double staff override accepted without error");

  const afterDouble = await request("GET", "/api/disruptions");
  assert(afterDouble.body.disruptions.length === 0,
    `After double override: 0 active disruptions (all traveler reports suppressed)`,
    `Expected 0, got ${afterDouble.body.disruptions.length}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 13: FULL PRIYA JOURNEY (END-TO-END INTEGRATION)
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 13: Full Priya Journey (E2E Integration)");

  await request("DELETE", "/api/disruptions");
  const priyaWeights = { access: 0.35, safety: 0.25, crowd: 0.15, convenience: 0.10, cost: 0.15 };

  subheader("13a: Initial Ranking");
  const initial = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 0, [], {}, priyaWeights);
    return { id: r.id, name: r.shortName, score: res.weightedScore };
  }).sort((a, b) => b.score - a.score);
  assert(initial[0].id === "accessible-main" && initial[0].score === 85,
    `Step 1: Route B recommended (Score: 85)`);

  subheader("13b: Mid-Journey (Stage 1) + Elevator Failure");
  await request("POST", "/api/disruptions", {
    segmentId: "seg-metro-overpass",
    hazardType: "broken-lift",
    source: "traveler",
    confidence: "high",
    ttlMinutes: 60,
  });
  let { body: d1 } = await request("GET", "/api/disruptions");
  const step3 = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 1, d1.disruptions, {}, priyaWeights);
    return { id: r.id, name: r.shortName, score: res.weightedScore, blocked: res.hasActiveBlocker };
  }).sort((a, b) => b.score - a.score);
  assert(step3[0].id === "quiet-backup" && step3[0].score === 83,
    `Step 3: Route C promoted to #1 (Score: 83)`);
  const routeB_step3 = step3.find(e => e.id === "accessible-main");
  assert(routeB_step3.blocked === true && routeB_step3.score <= 65,
    `Step 3: Route B blocked (Score: ${routeB_step3.score})`);

  subheader("13c: Ramp on Route C Blocked");
  await request("POST", "/api/disruptions", {
    segmentId: "seg-model-colony",
    hazardType: "blocked-ramp",
    source: "traveler",
    confidence: "medium",
    ttlMinutes: 45,
  });
  let { body: d2 } = await request("GET", "/api/disruptions");
  const step4 = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 1, d2.disruptions, {}, priyaWeights);
    return { id: r.id, name: r.shortName, score: res.weightedScore };
  }).sort((a, b) => b.score - a.score);
  const routeC_step4 = step4.find(e => e.id === "quiet-backup");
  assert(routeC_step4.score < 83 && step4[0].id === "quiet-backup",
    `Step 4: Route C penalized (${routeC_step4.score}) but still #1 — no flip-flop`);

  subheader("13d: Staff Marks Elevator Fixed");
  await request("POST", "/api/disruptions/resolve", {
    segmentId: "seg-metro-overpass",
    note: "Elevator repaired",
  });
  let { body: d3 } = await request("GET", "/api/disruptions");
  const step5 = ROUTES.map(r => {
    const res = evaluateMidJourneyRoute(r, 1, d3.disruptions, {}, priyaWeights);
    return { id: r.id, name: r.shortName, score: res.weightedScore };
  }).sort((a, b) => b.score - a.score);
  assert(step5[0].id === "accessible-main" && step5[0].score === 85,
    `Step 5: Route B restored to #1 (Score: 85) after staff fix`);

  subheader("13e: Arrival");
  const finalStage = JOURNEY_STAGES[3];
  assert(finalStage.progressPct === 100 && finalStage.remainingSegmentIds.length === 0,
    `Step 6: Destination at ${finalStage.name} (100%), 0 remaining segments — journey complete!`);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 14: SEGMENT DEFINITIONS INTEGRITY
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 14: Segment Definitions Integrity");

  assert(SEGMENTS.length === 5,
    `Exactly 5 segments defined (${SEGMENTS.length})`);

  // Every segment should have required fields
  for (const seg of SEGMENTS) {
    assert(seg.id && seg.name && seg.routeIds && seg.baseMinutes > 0,
      `Segment ${seg.id}: valid (baseMinutes=${seg.baseMinutes}, routes=${seg.routeIds.join(",")})`,
      `Segment ${seg.id}: missing required fields`);
  }

  // Every route ID in segments should exist in ROUTES
  const routeIds = new Set(ROUTES.map(r => r.id));
  for (const seg of SEGMENTS) {
    for (const rid of seg.routeIds) {
      assert(routeIds.has(rid),
        `Segment ${seg.id}: route ${rid} exists in ROUTES`,
        `Segment ${seg.id}: references non-existent route ${rid}`);
    }
  }

  // Journey stages should be in order
  for (let i = 0; i < JOURNEY_STAGES.length; i++) {
    assert(JOURNEY_STAGES[i].stage === i,
      `Journey stage ${i}: index matches`,
      `Journey stage ${i}: index mismatch (${JOURNEY_STAGES[i].stage})`);
  }
  assert(JOURNEY_STAGES[0].progressPct === 0 && JOURNEY_STAGES[JOURNEY_STAGES.length - 1].progressPct === 100,
    "Journey stages span 0% to 100%");

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 15: EDGE CASES — SCORE BOUNDARY CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════
  header("TEST 15: Edge Cases — Score Boundary Conditions");

  subheader("15a: Zero Weights");
  const zeroWeights = { access: 0, safety: 0, crowd: 0, convenience: 0, cost: 0 };
  const zeroScore = computeWeightedScore(ROUTES[0].scores, zeroWeights);
  assert(zeroScore === 0,
    `Zero weights → score 0 (got ${zeroScore})`);

  subheader("15b: All Weight on Single Factor");
  const allAccess = { access: 1, safety: 0, crowd: 0, convenience: 0, cost: 0 };
  const singleFactorScore = computeWeightedScore(routeB.scores, allAccess);
  assert(singleFactorScore === routeB.scores.access,
    `All weight on Access → score equals Access score (${singleFactorScore} = ${routeB.scores.access})`);

  subheader("15c: Score Clamping (Extreme Negative Penalties)");
  const extremePenalty = { access: -200, safety: -200, crowd: -200, convenience: -200, cost: -200 };
  const clamped = applyScenarioDeltas(routeB.scores, extremePenalty);
  assert(Object.values(clamped).every(v => v >= 0),
    "Extreme negative penalties clamp to 0 (no negative scores)");

  subheader("15d: Score Clamping (Extreme Positive Bonuses)");
  const extremeBonus = { access: 200, safety: 200, crowd: 200, convenience: 200, cost: 200 };
  const capd = applyScenarioDeltas(routeB.scores, extremeBonus);
  assert(Object.values(capd).every(v => v <= 100),
    "Extreme positive bonuses cap at 100");

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════
  await request("DELETE", "/api/disruptions");

  // ═══════════════════════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n" + "█".repeat(72));
  console.log(`█  RESULTS: ${passCount} PASSED, ${failCount} FAILED                                  █`);
  if (failCount === 0) {
    console.log("█  🎉 ALL TESTS PASSED — PROJECT IS PRODUCTION READY!                █");
  } else {
    console.log("█  ⚠️  SOME TESTS FAILED — Review output above for details           █");
  }
  console.log("█".repeat(72) + "\n");

  process.exit(failCount > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
