/**
 * Heiken Ashi Candles
 * Smoothed candlesticks that filter out noise and highlight trends
 */

export interface HeikenAshiCandle {
	open: number;
	high: number;
	low: number;
	close: number;
	isGreen: boolean;
	body: number;
}

export interface Candle {
	open: number;
	high: number;
	low: number;
	close: number;
}

export function computeHeikenAshi(candles: Candle[]): HeikenAshiCandle[] {
	if (!Array.isArray(candles) || candles.length === 0) return [];

	const ha: HeikenAshiCandle[] = [];
	for (let i = 0; i < candles.length; i += 1) {
		const c = candles[i];
		const haClose = (c.open + c.high + c.low + c.close) / 4;

		const prev = ha[i - 1];
		const haOpen = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;

		const haHigh = Math.max(c.high, haOpen, haClose);
		const haLow = Math.min(c.low, haOpen, haClose);

		ha.push({
			open: haOpen,
			high: haHigh,
			low: haLow,
			close: haClose,
			isGreen: haClose >= haOpen,
			body: Math.abs(haClose - haOpen),
		});
	}
	return ha;
}

export function countConsecutive(haCandles: HeikenAshiCandle[]): {
	color: "green" | "red" | null;
	count: number;
} {
	if (!Array.isArray(haCandles) || haCandles.length === 0)
		return { color: null, count: 0 };

	const last = haCandles[haCandles.length - 1];
	const target = last.isGreen ? "green" : "red";

	let count = 0;
	for (let i = haCandles.length - 1; i >= 0; i -= 1) {
		const c = haCandles[i];
		const color = c.isGreen ? "green" : "red";
		if (color !== target) break;
		count += 1;
	}

	return { color: target, count };
}
