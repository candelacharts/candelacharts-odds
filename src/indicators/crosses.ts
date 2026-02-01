/**
 * Cross Detection Utilities
 * Detects crossovers and crossunders for technical analysis
 */

export interface CrossResult {
	crossed: boolean;
	direction: "up" | "down" | "none";
	previousDiff: number;
	currentDiff: number;
}

/**
 * Detect if series1 crossed above series2 (bullish cross)
 * @param series1 - Fast/signal line (e.g., MACD line, fast EMA, price)
 * @param series2 - Slow/baseline (e.g., Signal line, slow EMA, VWAP)
 * @param lookback - Number of periods to check (default: 2 for immediate cross)
 */
export function crossUp(
	series1: number[],
	series2: number[],
	lookback: number = 2,
): boolean {
	if (series1.length < lookback || series2.length < lookback) {
		return false;
	}

	const current1 = series1[series1.length - 1];
	const current2 = series2[series2.length - 1];
	const prev1 = series1[series1.length - lookback];
	const prev2 = series2[series2.length - lookback];

	// Current: series1 > series2 (above)
	// Previous: series1 <= series2 (below or equal)
	return current1 > current2 && prev1 <= prev2;
}

/**
 * Detect if series1 crossed below series2 (bearish cross)
 * @param series1 - Fast/signal line (e.g., MACD line, fast EMA, price)
 * @param series2 - Slow/baseline (e.g., Signal line, slow EMA, VWAP)
 * @param lookback - Number of periods to check (default: 2 for immediate cross)
 */
export function crossDown(
	series1: number[],
	series2: number[],
	lookback: number = 2,
): boolean {
	if (series1.length < lookback || series2.length < lookback) {
		return false;
	}

	const current1 = series1[series1.length - 1];
	const current2 = series2[series2.length - 1];
	const prev1 = series1[series1.length - lookback];
	const prev2 = series2[series2.length - lookback];

	// Current: series1 < series2 (below)
	// Previous: series1 >= series2 (above or equal)
	return current1 < current2 && prev1 >= prev2;
}

/**
 * Detect any cross (up or down) between two series
 */
export function crossOver(
	series1: number[],
	series2: number[],
	lookback: number = 2,
): CrossResult {
	if (series1.length < lookback || series2.length < lookback) {
		return {
			crossed: false,
			direction: "none",
			previousDiff: 0,
			currentDiff: 0,
		};
	}

	const current1 = series1[series1.length - 1];
	const current2 = series2[series2.length - 1];
	const prev1 = series1[series1.length - lookback];
	const prev2 = series2[series2.length - lookback];

	const currentDiff = current1 - current2;
	const previousDiff = prev1 - prev2;

	// Check for cross up
	if (currentDiff > 0 && previousDiff <= 0) {
		return {
			crossed: true,
			direction: "up",
			previousDiff,
			currentDiff,
		};
	}

	// Check for cross down
	if (currentDiff < 0 && previousDiff >= 0) {
		return {
			crossed: true,
			direction: "down",
			previousDiff,
			currentDiff,
		};
	}

	return {
		crossed: false,
		direction: "none",
		previousDiff,
		currentDiff,
	};
}

/**
 * Detect if a value crossed above a threshold (e.g., RSI > 50)
 */
export function crossAbove(
	series: number[],
	threshold: number,
	lookback: number = 2,
): boolean {
	if (series.length < lookback) {
		return false;
	}

	const current = series[series.length - 1];
	const prev = series[series.length - lookback];

	return current > threshold && prev <= threshold;
}

/**
 * Detect if a value crossed below a threshold (e.g., RSI < 50)
 */
export function crossBelow(
	series: number[],
	threshold: number,
	lookback: number = 2,
): boolean {
	if (series.length < lookback) {
		return false;
	}

	const current = series[series.length - 1];
	const prev = series[series.length - lookback];

	return current < threshold && prev >= threshold;
}

/**
 * Check if series1 is currently above series2 (no cross required)
 */
export function isAbove(series1: number[], series2: number[]): boolean {
	if (series1.length === 0 || series2.length === 0) {
		return false;
	}

	const current1 = series1[series1.length - 1];
	const current2 = series2[series2.length - 1];

	return current1 > current2;
}

/**
 * Check if series1 is currently below series2 (no cross required)
 */
export function isBelow(series1: number[], series2: number[]): boolean {
	if (series1.length === 0 || series2.length === 0) {
		return false;
	}

	const current1 = series1[series1.length - 1];
	const current2 = series2[series2.length - 1];

	return current1 < current2;
}

/**
 * Calculate standard deviation of recent price movements
 * Used to assess volatility
 */
export function calculateStandardDeviation(
	values: number[],
	period: number = 20,
): number | null {
	if (values.length < period) {
		return null;
	}

	const recentValues = values.slice(-period);
	const mean = recentValues.reduce((sum, val) => sum + val, 0) / period;
	const squaredDiffs = recentValues.map((val) => Math.pow(val - mean, 2));
	const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / period;

	return Math.sqrt(variance);
}

/**
 * Calculate percentage distance between current price and strike
 * Positive = above strike, Negative = below strike
 */
export function calculateStrikeDistance(
	currentPrice: number,
	strikePrice: number,
): {
	absolute: number;
	percentage: number;
	direction: "above" | "below" | "at";
} {
	const absolute = currentPrice - strikePrice;
	const percentage = (absolute / strikePrice) * 100;

	let direction: "above" | "below" | "at";
	if (Math.abs(percentage) < 0.01) {
		direction = "at";
	} else if (absolute > 0) {
		direction = "above";
	} else {
		direction = "below";
	}

	return {
		absolute,
		percentage,
		direction,
	};
}
