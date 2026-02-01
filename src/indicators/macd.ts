/**
 * MACD (Moving Average Convergence Divergence) Indicator
 * Using technicalindicators library
 */

import { MACD } from "technicalindicators";

export interface MacdResult {
	macd: number;
	signal: number;
	hist: number;
	histDelta: number | null;
}

export function computeMacd(
	closes: number[],
	fast: number = 12,
	slow: number = 26,
	signal: number = 9,
): MacdResult | null {
	if (!Array.isArray(closes) || closes.length < slow + signal) return null;

	const macdResult = MACD.calculate({
		values: closes,
		fastPeriod: fast,
		slowPeriod: slow,
		signalPeriod: signal,
		SimpleMAOscillator: false,
		SimpleMASignal: false,
	});

	if (macdResult.length < 2) return null;

	const current = macdResult[macdResult.length - 1];
	const previous = macdResult[macdResult.length - 2];

	if (!current || current.MACD === undefined || current.signal === undefined || current.histogram === undefined) {
		return null;
	}

	const histDelta = previous && previous.histogram !== undefined 
		? current.histogram - previous.histogram 
		: null;

	return {
		macd: current.MACD,
		signal: current.signal,
		hist: current.histogram,
		histDelta,
	};
}
