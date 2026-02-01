/**
 * ADX (Average Directional Index)
 * Measures trend strength (0-100)
 * Using technicalindicators library
 */

import { ADX } from "technicalindicators";

export interface ADXResult {
	adx: number;
	pdi: number; // Plus Directional Indicator
	mdi: number; // Minus Directional Indicator
}

export function computeADX(
	high: number[],
	low: number[],
	close: number[],
	period: number = 14,
): ADXResult | null {
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

	const adxResult = ADX.calculate({
		high,
		low,
		close,
		period,
	});

	if (adxResult.length === 0) return null;

	const current = adxResult[adxResult.length - 1];

	return {
		adx: current.adx,
		pdi: current.pdi,
		mdi: current.mdi,
	};
}
