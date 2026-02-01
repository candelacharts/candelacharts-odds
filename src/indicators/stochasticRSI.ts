/**
 * Stochastic RSI
 * More sensitive version of RSI
 * Using technicalindicators library
 */

import { StochasticRSI } from "technicalindicators";

export interface StochRSIResult {
	k: number; // %K line (0-100)
	d: number; // %D line (signal)
}

export function computeStochRSI(
	values: number[],
	rsiPeriod: number = 14,
	stochasticPeriod: number = 14,
	kPeriod: number = 3,
	dPeriod: number = 3,
): StochRSIResult | null {
	if (!Array.isArray(values) || values.length < rsiPeriod + stochasticPeriod) {
		return null;
	}

	const stochRSIResult = StochasticRSI.calculate({
		values,
		rsiPeriod,
		stochasticPeriod,
		kPeriod,
		dPeriod,
	});

	if (stochRSIResult.length === 0) return null;

	const current = stochRSIResult[stochRSIResult.length - 1];

	return {
		k: current.stochRSI,
		d: current.d,
	};
}
