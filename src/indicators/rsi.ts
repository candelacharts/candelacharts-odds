/**
 * RSI (Relative Strength Index) Indicator
 * Using technicalindicators library
 */

import { RSI, SMA } from "technicalindicators";

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function computeRsi(closes: number[], period: number = 14): number[] | null {
	if (!Array.isArray(closes) || closes.length < period + 1) return null;

	const rsiResult = RSI.calculate({
		values: closes,
		period,
	});

	return rsiResult.length > 0 ? rsiResult : null;
}

export function sma(values: number[], period: number): number | null {
	if (!Array.isArray(values) || values.length < period) return null;

	const smaResult = SMA.calculate({
		values,
		period,
	});

	return smaResult.length > 0 ? smaResult[smaResult.length - 1] : null;
}

export function slopeLast(values: number[], points: number): number | null {
	if (!Array.isArray(values) || values.length < points) return null;
	const slice = values.slice(values.length - points);
	const first = slice[0];
	const last = slice[slice.length - 1];
	return (last - first) / (points - 1);
}
