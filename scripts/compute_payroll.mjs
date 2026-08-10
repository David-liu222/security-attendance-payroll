#!/usr/bin/env node
import fs from "node:fs/promises";

function requiredNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function nonNegative(value, label) {
  const n = value ?? 0;
  requiredNumber(n, label);
  if (n < 0) throw new Error(`${label} must be non-negative`);
  return n;
}

function roundYuan(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computePayroll(input) {
  const pool = requiredNumber(input.coefficientWagePool, "coefficientWagePool");
  const performancePool = nonNegative(input.performancePool, "performancePool");
  const perEvent = requiredNumber(input.lateAndMissingCardDeductionPerEvent, "lateAndMissingCardDeductionPerEvent");
  if (!Array.isArray(input.workers) || input.workers.length === 0) {
    throw new Error("workers must be a non-empty array");
  }
  if (pool < 0 || perEvent < 0) throw new Error("pools and deductions must be non-negative");

  const prepared = input.workers.map((worker, index) => {
    if (!worker?.name || typeof worker.name !== "string") throw new Error(`workers[${index}].name is required`);
    const coefficient = nonNegative(worker.coefficient, `${worker.name}.coefficient`);
    const actualAttendanceDays = nonNegative(worker.actualAttendanceDays, `${worker.name}.actualAttendanceDays`);
    const paidLeaveDays = nonNegative(worker.paidLeaveDays, `${worker.name}.paidLeaveDays`);
    const totalCoefficient = (actualAttendanceDays + paidLeaveDays) * coefficient;
    return { worker, coefficient, actualAttendanceDays, paidLeaveDays, totalCoefficient };
  });

  const totalCoefficient = prepared.reduce((sum, row) => sum + row.totalCoefficient, 0);
  if (totalCoefficient <= 0 && (pool > 0 || performancePool > 0)) throw new Error("total coefficient must be greater than zero when a wage pool exists");
  const unitCoefficientWage = totalCoefficient === 0 ? 0 : pool / totalCoefficient;
  const performanceShares = prepared.map((row) => roundYuan(totalCoefficient === 0 ? 0 : performancePool * row.totalCoefficient / totalCoefficient));
  if (performanceShares.length > 0) {
    const previous = performanceShares.slice(0, -1).reduce((sum, value) => roundYuan(sum + value), 0);
    performanceShares[performanceShares.length - 1] = roundYuan(performancePool - previous);
  }

  const workers = prepared.map(({ worker, coefficient, actualAttendanceDays, paidLeaveDays, totalCoefficient }, index) => {
    const coefficientWageBase = Math.round(unitCoefficientWage * totalCoefficient);
    const performancePay = performanceShares[index];
    const coefficientWage = roundYuan(coefficientWageBase + performancePay);
    const lateCount = nonNegative(worker.lateCount, `${worker.name}.lateCount`);
    const missingCardCount = nonNegative(worker.missingCardCount, `${worker.name}.missingCardCount`);
    const lateAndMissingCardDeduction = roundYuan((lateCount + missingCardCount) * perEvent);
    const deductionCoefficientWage = nonNegative(worker.deductionCoefficientWage, `${worker.name}.deductionCoefficientWage`);
    const netCoefficientWage = coefficientWage - deductionCoefficientWage;
    const paidLeaveAllowance = nonNegative(worker.paidLeaveAllowance, `${worker.name}.paidLeaveAllowance`);
    const classLeaderAllowance = nonNegative(worker.classLeaderAllowance, `${worker.name}.classLeaderAllowance`);
    const extraProjectReward = nonNegative(worker.extraProjectReward, `${worker.name}.extraProjectReward`);
    const departmentReward = nonNegative(worker.departmentReward, `${worker.name}.departmentReward`);
    const springFestivalOvertime = nonNegative(worker.springFestivalOvertime, `${worker.name}.springFestivalOvertime`);
    const other = nonNegative(worker.other, `${worker.name}.other`);
    const penalty = nonNegative(worker.penalty, `${worker.name}.penalty`);
    const salaryTotal = roundYuan(netCoefficientWage + paidLeaveAllowance + classLeaderAllowance + extraProjectReward + departmentReward + springFestivalOvertime + other - penalty - lateAndMissingCardDeduction);
    return { name: worker.name, coefficient, actualAttendanceDays, paidLeaveDays, totalCoefficient, coefficientWageBase, performancePay, coefficientWage, deductionCoefficientWage, netCoefficientWage, lateCount, missingCardCount, lateAndMissingCardDeduction, paidLeaveAllowance, classLeaderAllowance, extraProjectReward, departmentReward, springFestivalOvertime, other, penalty, salaryTotal };
  });

  const total = (key) => roundYuan(workers.reduce((sum, worker) => sum + worker[key], 0));
  return {
    coefficientWagePool: pool,
    performancePool,
    lateAndMissingCardDeductionPerEvent: perEvent,
    totalCoefficient,
    unitCoefficientWage,
    workers,
    totals: {
      coefficientWage: total("coefficientWage"),
      coefficientWageBase: total("coefficientWageBase"),
      performancePay: total("performancePay"),
      classLeaderAllowance: total("classLeaderAllowance"),
      extraProjectReward: total("extraProjectReward"),
      departmentReward: total("departmentReward"),
      penalty: total("penalty"),
      lateAndMissingCardDeduction: total("lateAndMissingCardDeduction"),
      salaryTotal: total("salaryTotal"),
      coefficientWageRoundingDifference: roundYuan(total("coefficientWage") - pool)
    }
  };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Usage: node compute_payroll.mjs input.json");
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  process.stdout.write(`${JSON.stringify(computePayroll(input), null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
