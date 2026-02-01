/**
 * Delta Indicator
 * Measures price change over different timeframes
 */

export interface DeltaResult {
	delta1: number; // 1-candle change
	delta3: number; // 3-candle change
	deltaPercent1: number; // 1-candle % change
	deltaPercent3: number; // 3-candle % change
}

export function computeDelta(closes: number[]): DeltaResult | null {
	if (!Array.isArray(closes) || closes.length < 4) return null;

	const current = closes[closes.length - 1];
	const prev1 = closes[closes.length - 2];
	const prev3 = closes[closes.length - 4];

	const delta1 = current - prev1;
	const delta3 = current - prev3;

	const deltaPercent1 = prev1 !== 0 ? (delta1 / prev1) * 100 : 0;
	const deltaPercent3 = prev3 !== 0 ? (delta3 / prev3) * 100 : 0;

	return {
		delta1,
		delta3,
		deltaPercent1,
		deltaPercent3,
	};
}
