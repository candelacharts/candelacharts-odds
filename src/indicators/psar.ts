/**
 * PSAR (Parabolic SAR)
 * Trailing stop and trend indicator
 * Using technicalindicators library
 */

import { PSAR } from "technicalindicators";

export function computePSAR(
	high: number[],
	low: number[],
	step: number = 0.02,
	max: number = 0.2,
): number | null {
	if (
		!Array.isArray(high) ||
		!Array.isArray(low) ||
		high.length < 2 ||
		low.length < 2
	) {
		return null;
	}

	const psarResult = PSAR.calculate({
		high,
		low,
		step,
		max,
	});

	return psarResult.length > 0 ? psarResult[psarResult.length - 1] : null;
}
