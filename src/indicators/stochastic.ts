/**
 * Stochastic Oscillator
 * Using technicalindicators library
 */

import { Stochastic } from "technicalindicators";

export interface StochasticResult {
	k: number; // %K line
	d: number; // %D line (signal)
}

export function computeStochastic(
	high: number[],
	low: number[],
	close: number[],
	period: number = 14,
	signalPeriod: number = 3,
): StochasticResult | null {
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

	const stochResult = Stochastic.calculate({
		high,
		low,
		close,
		period,
		signalPeriod,
	});

	if (stochResult.length === 0) return null;

	const current = stochResult[stochResult.length - 1];

	return {
		k: current.k,
		d: current.d,
	};
}
