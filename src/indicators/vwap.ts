/**
 * VWAP (Volume Weighted Average Price)
 * Using technicalindicators library
 */

import { VWAP } from "technicalindicators";

export interface Candle {
	high: number;
	low: number;
	close: number;
	volume: number;
}

export function computeSessionVwap(candles: Candle[]): number | null {
	if (!Array.isArray(candles) || candles.length === 0) return null;

	const vwapResult = VWAP.calculate({
		high: candles.map((c) => c.high),
		low: candles.map((c) => c.low),
		close: candles.map((c) => c.close),
		volume: candles.map((c) => c.volume),
	});

	return vwapResult.length > 0 ? vwapResult[vwapResult.length - 1] : null;
}

export function computeVwapSeries(candles: Candle[]): number[] {
	if (!Array.isArray(candles) || candles.length === 0) return [];

	const vwapResult = VWAP.calculate({
		high: candles.map((c) => c.high),
		low: candles.map((c) => c.low),
		close: candles.map((c) => c.close),
		volume: candles.map((c) => c.volume),
	});

	return vwapResult;
}
