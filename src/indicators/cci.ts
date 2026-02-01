/**
 * CCI (Commodity Channel Index)
 * Identifies overbought/oversold conditions
 * Using technicalindicators library
 */

import { CCI } from "technicalindicators";

export function computeCCI(
	high: number[],
	low: number[],
	close: number[],
	period: number = 20,
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

	const cciResult = CCI.calculate({
		high,
		low,
		close,
		period,
	});

	return cciResult.length > 0 ? cciResult[cciResult.length - 1] : null;
}
