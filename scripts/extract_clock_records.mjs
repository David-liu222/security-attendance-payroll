#!/usr/bin/env node
import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const TIME_RE = /\b(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\b/g;

export function parseCardPoints(value) {
  const raw = String(value ?? "").trim();
  const cardTimes = [...raw.matchAll(TIME_RE)].map((match) => match[0]);
  const nonTimeTokens = raw.split(/\s+/).filter(Boolean).filter((token) => !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(token));
  return {
    raw,
    cardTimes,
    distinctCardTimes: [...new Set(cardTimes)],
    nonTimeTokens,
    recordState: raw === "59" ? "no_valid_time_sentinel_59" : cardTimes.length ? "has_clock_times" : "unparseable_card_points"
  };
}

export function normalizeClockRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new Error("Clock workbook must include a header row and data rows");
  const header = rows[0].map((value) => String(value ?? "").trim());
  const required = ["人员ID", "姓名", "部门", "日期", "星期", "卡点"];
  const index = Object.fromEntries(required.map((name) => [name, header.indexOf(name)]));
  const missing = required.filter((name) => index[name] < 0);
  if (missing.length) throw new Error(`Missing required clock columns: ${missing.join(", ")}`);
  const records = rows.slice(1).filter((row) => row.some((value) => value !== null && value !== "")).map((row, offset) => ({
    sourceRow: offset + 2,
    employeeId: String(row[index["人员ID"]] ?? "").trim(),
    name: String(row[index["姓名"]] ?? "").trim(),
    department: String(row[index["部门"]] ?? "").trim(),
    date: String(row[index["日期"]] ?? "").slice(0, 10),
    weekday: String(row[index["星期"]] ?? "").trim(),
    ...parseCardPoints(row[index["卡点"]])
  }));
  const names = [...new Set(records.map((record) => record.name).filter(Boolean))].sort();
  const summary = {
    recordCount: records.length,
    employeeCount: names.length,
    employees: names,
    sentinel59Count: records.filter((record) => record.recordState === "no_valid_time_sentinel_59").length,
    unparseableCardPointCount: records.filter((record) => record.recordState === "unparseable_card_points").length
  };
  return { summary, records };
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error("Usage: node extract_clock_records.mjs input.xlsx output.json");
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
  const sheet = workbook.worksheets.getItemAt(0);
  const used = sheet.getUsedRange(true);
  const output = normalizeClockRows(used.values);
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(output.summary)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
