import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

const resultsRoute = readFileSync(new URL("../../src/app/api/admin/monday-league/results/route.ts", import.meta.url), "utf8");
const standingsRoute = readFileSync(new URL("../../src/app/api/admin/monday-league/standings/route.ts", import.meta.url), "utf8");

test("H2 routes order league phases by the installed sequence column", () => {
  for (const source of [resultsRoute, standingsRoute]) {
    assert.doesNotMatch(source, /sequence_number/);
    assert.match(source, /from\("league_phases"\)[\s\S]*?\.order\("sequence"\)/);
  }
});

test("H2 routes distinguish absent data from database failures", () => {
  for (const source of [resultsRoute, standingsRoute]) {
    assert.match(source, /error: seasonError/);
    assert.match(source, /if \(seasonError\) return admin\w+ReadFailure\("season", seasonError\);/);
    assert.match(source, /if \(!season\) return NextResponse\.json\(\{ data: null \}\);/);
    assert.match(source, /error: phaseError/);
    assert.match(source, /if \(phaseError\) return admin\w+ReadFailure\("phases", phaseError\);/);
  }
});

test("H2 route failures are controlled without returning raw PostgREST details", () => {
  for (const source of [resultsRoute, standingsRoute]) {
    assert.doesNotMatch(source, /NextResponse\.json\(\{ error: error\.message \}/);
    assert.doesNotMatch(source, /details\s*:/);
    assert.doesNotMatch(source, /hint\s*:/);
  }
  assert.match(resultsRoute, /response\.error\) return adminResultsReadFailure/);
  assert.match(standingsRoute, /if \(error\) return adminStandingsReadFailure\("standings", error\);/);
});

test("simulated query failure produces a generic 500 response", async () => {
  const errorLog = mock.method(console, "error", () => {});
  try {
    const { mondayLeagueAdminReadError } = await import("../../src/lib/monday-league/admin-read-error.ts");
    const failure = mondayLeagueAdminReadError("results", "phases", {
      code: "42703",
      message: "column league_phases.secret_internal_column does not exist",
      details: "private SQL details",
    });
    assert.equal(failure.status, 500);
    assert.deepEqual(failure.body, {
      error: "Dati Monday League temporaneamente non disponibili",
      code: "ML_ADMIN_DATA_UNAVAILABLE",
    });
    assert.equal(errorLog.mock.calls.length, 1);
  } finally {
    errorLog.mock.restore();
  }
});
