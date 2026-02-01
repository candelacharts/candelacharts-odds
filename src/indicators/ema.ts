/**
 * EMA (Exponential Moving Average) Indicator
 * Using technicalindicators library
 */

import { EMA } from "technicalindicators";

export function computeEMA(values: number[], period: number): number | null {
	if (!Array.isArray(values) || values.length < period) return null;

	const emaResult = EMA.calculate({
		values,
		period,
	});

	return emaResult.length > 0 ? emaResult[emaResult.length - 1] : null;
}

export function computeEMASeries(values: number[], period: number): number[] {
	if (!Array.isArray(values) || values.length < period) return [];

	return EMA.calculate({
		values,
		period,
	});
}
