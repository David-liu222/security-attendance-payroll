#!/usr/bin/env node
import fs from "node:fs/promises";

function namesFrom(value) {
  const items = Array.isArray(value) ? value : value?.workers;
  if (!Array.isArray(items)) throw new Error("Input must be a JSON name array or an object with workers");
  return items.map((item) => typeof item === "string" ? item.trim() : String(item.name ?? "").trim()).filter(Boolean);
}

function duplicates(names) {
  const seen = new Set();
  return [...new Set(names.filter((name) => seen.has(name) || !seen.add(name)))];
}

export function reconcileRoster(expectedInput, actualInput) {
  const expected = namesFrom(expectedInput);
  const actual = namesFrom(actualInput);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    expectedCount: expected.length,
    actualCount: actual.length,
    missingFromActual: expected.filter((name) => !actualSet.has(name)),
    extraInActual: actual.filter((name) => !expectedSet.has(name)),
    duplicateExpected: duplicates(expected),
    duplicateActual: duplicates(actual)
  };
}

async function main() {
  const [expectedPath, actualPath] = process.argv.slice(2);
  if (!expectedPath || !actualPath) throw new Error("Usage: node reconcile_roster.mjs expected.json actual.json");
  const expected = JSON.parse(await fs.readFile(expectedPath, "utf8"));
  const actual = JSON.parse(await fs.readFile(actualPath, "utf8"));
  process.stdout.write(`${JSON.stringify(reconcileRoster(expected, actual), null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
