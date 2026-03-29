import { describe, expect, it } from "vitest";
import { calculateScores, formatRateResult } from "./rate.js";

describe("calculateScores", () => {
	it("should calculate scores from metrics", () => {
		const result = calculateScores(
			95, // typeCoverage
			80, // complexityScore
			0, // securityFindings
			0, // archViolations
			0, // deadCodeCount
			100, // testPassRate
		);

		expect(result.overall).toBeGreaterThan(80);
		expect(result.categories).toHaveLength(6);

		const typeCat = result.categories.find((c) => c.name === "Type Safety");
		expect(typeCat?.score).toBe(95);
	});

	it("should penalize security findings", () => {
		const result = calculateScores(100, 100, 3, 0, 0, 100);
		const secCat = result.categories.find((c) => c.name === "Security");
		expect(secCat?.score).toBe(40); // 100 - 3*20
	});

	it("should penalize architecture violations", () => {
		const result = calculateScores(100, 100, 0, 2, 0, 100);
		const archCat = result.categories.find((c) => c.name === "Architecture");
		expect(archCat?.score).toBe(70); // 100 - 2*15
	});

	it("should include issues for low scores", () => {
		const result = calculateScores(70, 50, 1, 1, 5, 80);
		expect(result.categories[0].issues.length).toBeGreaterThan(0); // Type Safety
		expect(result.categories[1].issues.length).toBeGreaterThan(0); // Complexity
	});
});

describe("formatRateResult", () => {
	it("should format a visual score breakdown", () => {
		const result = calculateScores(85, 70, 0, 1, 3, 100);
		const output = formatRateResult(result);

		expect(output).toContain("CODE QUALITY SCORE");
		expect(output).toContain("Type Safety");
		expect(output).toContain("Security");
		expect(output).toContain("Tests");
	});

	it("should show grade", () => {
		const result = calculateScores(95, 90, 0, 0, 0, 100);
		const output = formatRateResult(result);
		expect(output).toContain("A");
	});

	it("should show issues section when there are problems", () => {
		const result = calculateScores(50, 50, 3, 2, 10, 50);
		const output = formatRateResult(result);
		expect(output).toContain("Issues to address");
		expect(output).toContain("/lens-booboo");
	});

	it("should not show issues section when clean", () => {
		const result = calculateScores(100, 100, 0, 0, 0, 100);
		const output = formatRateResult(result);
		expect(output).not.toContain("Issues to address");
	});
});
