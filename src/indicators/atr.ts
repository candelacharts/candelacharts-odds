/**
 * ATR (Average True Range) Indicator
 * Measures market volatility
 * Using technicalindicators library
 */

import { ATR } from "technicalindicators";

export function computeATR(
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

	const atrResult = ATR.calculate({
		high,
		low,
		close,
		period,
	});

	return atrResult.length > 0 ? atrResult[atrResult.length - 1] : null;
}
