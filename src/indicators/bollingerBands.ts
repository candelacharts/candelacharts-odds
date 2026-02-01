/**
 * Bollinger Bands Indicator
 * Using technicalindicators library
 */

import { BollingerBands } from "technicalindicators";

export interface BollingerBandsResult {
	upper: number;
	middle: number;
	lower: number;
	pb: number; // %B - Position within bands (0-1)
	bandwidth: number; // Band width as percentage
}

export function computeBollingerBands(
	closes: number[],
	period: number = 20,
	stdDev: number = 2,
): BollingerBandsResult | null {
	if (!Array.isArray(closes) || closes.length < period) return null;

	const bbResult = BollingerBands.calculate({
		values: closes,
		period,
		stdDev,
	});

	if (bbResult.length === 0) return null;

	const current = bbResult[bbResult.length - 1];
	const currentPrice = closes[closes.length - 1];

	// Calculate %B (position within bands)
	const pb = current.upper !== current.lower
		? (currentPrice - current.lower) / (current.upper - current.lower)
		: 0.5;

	// Calculate bandwidth (as percentage of middle band)
	const bandwidth = current.middle !== 0
		? ((current.upper - current.lower) / current.middle) * 100
		: 0;

	return {
		upper: current.upper,
		middle: current.middle,
		lower: current.lower,
		pb,
		bandwidth,
	};
}
