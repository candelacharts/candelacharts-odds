/**
 * Williams %R
 * Fast momentum oscillator
 * Using technicalindicators library
 */

import { WilliamsR } from "technicalindicators";

export function computeWilliamsR(
	high: number[],
	low: number[],
	close: number[],
	period: number = 14,
): number | null {
	if (
		!Array.isArray(high) ||
		!Array.isArray(low) ||
		!Array.isArray(close) ||
		high.length < period ||
		low.length < period ||
		close.length < period
	) {
		return null;
	}

	const williamsRResult = WilliamsR.calculate({
		high,
		low,
		close,
		period,
	});

	return williamsRResult.length > 0 ? williamsRResult[williamsRResult.length - 1] : null;
}
