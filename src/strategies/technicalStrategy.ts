/**
 * Technical Analysis Strategy - Streamlined Version
 * Uses only 6 reliable indicators to reduce false signals:
 * 1. ADX - Trend strength filter (hard requirement)
 * 2. Price × Strike Cross - The actual outcome (8 points)
 * 3. MACD Cross - Classic momentum (5 points)
 * 4. Price × VWAP Cross - Institutional signal (5 points)
 * 5. RSI × 50 Cross - Momentum shift (4 points)
 * 6. Delta - Direct price momentum (2 points)
 */

import type { MacdResult } from "../indicators/macd";
import type { DeltaResult } from "../indicators/delta";
import type { ADXResult } from "../indicators/adx";
import {
	crossUp,
	crossDown,
	crossAbove,
	crossBelow,
	isAbove,
	isBelow,
	calculateStandardDeviation,
	calculateStrikeDistance,
} from "../indicators/crosses";
import { CONFIG } from "../config/config";

export interface TechnicalSignals {
	// Core indicators (6 reliable ones)
	rsi?: number;
	rsiSeries?: number[]; // Full RSI series for cross detection
	macd?: MacdResult;
	macdSeries?: { macd: number[]; signal: number[]; hist: number[] }; // Full MACD series
	vwap?: number;
	vwapSeries?: number[]; // Full VWAP series for cross detection
	delta?: DeltaResult;
	price: number;
	priceSeries?: number[]; // Price history for cross detection and volatility
	strikePrice?: number; // Kalshi strike price (the key threshold!)
	timeLeftMinutes?: number; // Time until market expiry
	adx?: ADXResult; // Trend strength filter
	
	// Optional (for display only)
	imbalanceRatio?: number;
}

export interface TechnicalDecision {
	action: "BUY_YES" | "BUY_NO" | "NO_TRADE";
	confidence: number;
	reason: string;
	signals: {
		bullish: string[];
		bearish: string[];
	};
}

export function analyzeTechnicalSignals(signals: TechnicalSignals): TechnicalDecision {
	const bullishSignals: string[] = [];
	const bearishSignals: string[] = [];
	let bullishScore = 0;
	let bearishScore = 0;

	// ============================================================================
	// STEP 0: ADX BONUS (Optional - Boosts Confidence if Present)
	// ============================================================================
	let adxMultiplier = 1.0;
	
	if (signals.adx && signals.adx.adx >= 22) {
		const diDifference = Math.abs(signals.adx.plusDI - signals.adx.minusDI);
		
		if (diDifference >= 3) {
			// ADX is strong and directional - boost confidence
			const trendStrength = 
				signals.adx.adx >= 40 ? "VERY STRONG" :
				signals.adx.adx >= 30 ? "STRONG" :
				signals.adx.adx >= 25 ? "MODERATE" : "EMERGING";
			
			const trendDirection = signals.adx.plusDI > signals.adx.minusDI ? "BULLISH" : "BEARISH";
			
			// Boost confidence based on ADX strength
			adxMultiplier = 
				signals.adx.adx >= 40 ? 1.3 :
				signals.adx.adx >= 30 ? 1.2 :
				signals.adx.adx >= 25 ? 1.15 : 1.1;
			
			if (signals.adx.plusDI > signals.adx.minusDI) {
				bullishSignals.push(`ADX ${signals.adx.adx.toFixed(1)} - ${trendStrength} ${trendDirection} trend (+DI: ${signals.adx.plusDI.toFixed(1)} > -DI: ${signals.adx.minusDI.toFixed(1)}) [+${((adxMultiplier - 1) * 100).toFixed(0)}% confidence]`);
			} else {
				bearishSignals.push(`ADX ${signals.adx.adx.toFixed(1)} - ${trendStrength} ${trendDirection} trend (-DI: ${signals.adx.minusDI.toFixed(1)} > +DI: ${signals.adx.plusDI.toFixed(1)}) [+${((adxMultiplier - 1) * 100).toFixed(0)}% confidence]`);
			}
		}
	}

	// ============================================================================
	// STEP 1: STRIKE PRICE ANALYSIS (Most Important for Kalshi!)
	// ============================================================================
	let strikeDistanceConfidence = 1.0;
	let strikeContext = "";

	if (signals.strikePrice && signals.price) {
		const strikeInfo = calculateStrikeDistance(signals.price, signals.strikePrice);

		strikeContext = `Price ${strikeInfo.direction} strike by ${Math.abs(strikeInfo.percentage).toFixed(3)}% ($${Math.abs(strikeInfo.absolute).toFixed(2)})`;

		// Distance-based confidence adjustment
		const absPercent = Math.abs(strikeInfo.percentage);
		if (absPercent < 0.1) {
			// Very close to strike (< 0.1%)
			strikeDistanceConfidence = 1.2; // Bonus - easy to cross
			strikeContext += " [VERY CLOSE - HIGH PROBABILITY]";
		} else if (absPercent < 0.3) {
			// Close to strike (< 0.3%)
			strikeDistanceConfidence = 1.1;
			strikeContext += " [CLOSE]";
		} else if (absPercent < 0.5) {
			// Medium distance (< 0.5%)
			strikeDistanceConfidence = 1.0;
			strikeContext += " [MEDIUM]";
		} else if (absPercent < 1.0) {
			// Far from strike (< 1.0%)
			strikeDistanceConfidence = 0.8;
			strikeContext += " [FAR - LOWER PROBABILITY]";
		} else {
			// Very far from strike (> 1.0%)
			strikeDistanceConfidence = 0.6;
			strikeContext += " [VERY FAR - UNLIKELY TO CROSS]";
		}

		// Add context to signals
		if (strikeInfo.direction === "below") {
			bullishSignals.push(`${strikeContext} - Need upward cross`);
		} else if (strikeInfo.direction === "above") {
			bearishSignals.push(`${strikeContext} - Need downward cross`);
		}
	}

	// ============================================================================
	// STEP 2: TIME FILTER
	// ============================================================================
	if (signals.timeLeftMinutes !== undefined && signals.timeLeftMinutes < 5) {
		return {
			action: "NO_TRADE",
			confidence: 0,
			reason: `Too close to expiry (${signals.timeLeftMinutes.toFixed(1)} min left) - Not enough time for move`,
			signals: {
				bullish: bullishSignals,
				bearish: bearishSignals,
			},
		};
	}

	// ============================================================================
	// STEP 3: VOLATILITY CHECK (Standard Deviation)
	// ============================================================================
	let volatilityMultiplier = 1.0;
	if (signals.priceSeries && signals.priceSeries.length >= 20) {
		const stdDev = calculateStandardDeviation(signals.priceSeries, 20);
		if (stdDev !== null) {
			const stdDevPercent = (stdDev / signals.price) * 100;

			if (stdDevPercent < 0.05) {
				// Very low volatility - reduce confidence
				volatilityMultiplier = 0.7;
				bearishSignals.push(`Low volatility (${stdDevPercent.toFixed(3)}%) - Choppy market`);
			} else if (stdDevPercent > 0.2) {
				// High volatility - good for trading
				volatilityMultiplier = 1.2;
				bullishSignals.push(`High volatility (${stdDevPercent.toFixed(3)}%) - Strong moves expected`);
			} else {
				// Normal volatility
				volatilityMultiplier = 1.0;
			}
		}
	}

	// ============================================================================
	// STEP 4: CROSS DETECTION - Core Signals (6 Reliable Indicators Only)
	// ============================================================================

	// Track cross events for confirmation requirement
	let priceStrikeCrossUp = false;
	let priceStrikeCrossDown = false;
	let macdCrossUp = false;
	let macdCrossDown = false;
	let priceVwapCrossUp = false;
	let priceVwapCrossDown = false;
	let rsiCross50Up = false;
	let rsiCross50Down = false;

	// 4A. PRICE × STRIKE CROSS WITH GAP (HIGHEST PRIORITY - This is what determines payout!)
	if (signals.priceSeries && signals.strikePrice && signals.priceSeries.length >= 2) {
		const GAP_PERCENT = CONFIG.trading.strikeGapPercent / 100; // Convert from percentage to decimal
		const strikeWithGapUp = signals.strikePrice * (1 + GAP_PERCENT);
		const strikeWithGapDown = signals.strikePrice * (1 - GAP_PERCENT);
		
		const currentPrice = signals.priceSeries[signals.priceSeries.length - 1];
		
		// Check if price CROSSED above strike + gap (bullish entry)
		// This detects an actual cross event, not just current position
		if (crossAbove(signals.priceSeries, strikeWithGapUp)) {
			priceStrikeCrossUp = true;
			const gapSize = ((currentPrice - signals.strikePrice) / signals.strikePrice * 100).toFixed(3);
			bullishSignals.push(`⭐ PRICE CROSSED ABOVE STRIKE + ${gapSize}% GAP - YES ENTRY!`);
			bullishScore += 8; // Massive weight - this is the actual outcome!
		}
		
		// Check if price CROSSED below strike - gap (bearish entry)
		// This detects an actual cross event, not just current position
		if (crossBelow(signals.priceSeries, strikeWithGapDown)) {
			priceStrikeCrossDown = true;
			const gapSize = ((signals.strikePrice - currentPrice) / signals.strikePrice * 100).toFixed(3);
			bearishSignals.push(`⭐ PRICE CROSSED BELOW STRIKE - ${gapSize}% GAP - NO ENTRY!`);
			bearishScore += 8;
		}
	}

	// 4B. MACD CROSS (High Priority)
	if (signals.macdSeries && signals.macdSeries.macd.length >= 2 && signals.macdSeries.signal.length >= 2) {
		macdCrossUp = crossUp(signals.macdSeries.macd, signals.macdSeries.signal);
		macdCrossDown = crossDown(signals.macdSeries.macd, signals.macdSeries.signal);

		if (macdCrossUp) {
			bullishSignals.push("🔥 MACD bullish cross (MACD crossed above signal)");
			bullishScore += 5; // High weight for crosses
		} else if (macdCrossDown) {
			bearishSignals.push("🔥 MACD bearish cross (MACD crossed below signal)");
			bearishScore += 5;
		} else if (signals.macd) {
			// No cross, but check current position
			if (signals.macd.hist > 0) {
				bullishSignals.push(`MACD above signal (hist: ${signals.macd.hist.toFixed(2)})`);
				bullishScore += 2;
			} else {
				bearishSignals.push(`MACD below signal (hist: ${signals.macd.hist.toFixed(2)})`);
				bearishScore += 2;
			}
		}
	}

	// 4C. PRICE × VWAP CROSS (High Priority - Institutional Signal)
	if (signals.priceSeries && signals.vwapSeries && signals.priceSeries.length >= 2 && signals.vwapSeries.length >= 2) {
		priceVwapCrossUp = crossUp(signals.priceSeries, signals.vwapSeries);
		priceVwapCrossDown = crossDown(signals.priceSeries, signals.vwapSeries);

		if (priceVwapCrossUp) {
			bullishSignals.push("🔥 Price crossed above VWAP (bullish institutional signal)");
			bullishScore += 5;
		} else if (priceVwapCrossDown) {
			bearishSignals.push("🔥 Price crossed below VWAP (bearish institutional signal)");
			bearishScore += 5;
		} else if (signals.vwap) {
			// No cross, but check current position
			const priceAboveVwap = isAbove(signals.priceSeries, signals.vwapSeries);
			const priceDiff = ((signals.price - signals.vwap) / signals.vwap) * 100;

			if (priceAboveVwap) {
				bullishSignals.push(`Price above VWAP (+${priceDiff.toFixed(2)}%)`);
				bullishScore += 2;
			} else {
				bearishSignals.push(`Price below VWAP (${priceDiff.toFixed(2)}%)`);
				bearishScore += 2;
			}
		}
	}

	// 4D. RSI × 50 CROSS (Medium Priority - Momentum Shift)
	if (signals.rsiSeries && signals.rsiSeries.length >= 2) {
		rsiCross50Up = crossAbove(signals.rsiSeries, 50);
		rsiCross50Down = crossBelow(signals.rsiSeries, 50);

		if (rsiCross50Up) {
			bullishSignals.push("RSI crossed above 50 (momentum shift bullish)");
			bullishScore += 4;
		} else if (rsiCross50Down) {
			bearishSignals.push("RSI crossed below 50 (momentum shift bearish)");
			bearishScore += 4;
		} else if (signals.rsi !== undefined) {
			// Check extreme levels
			if (signals.rsi < 30) {
				bullishSignals.push(`RSI oversold (${signals.rsi.toFixed(1)})`);
				bullishScore += 3;
			} else if (signals.rsi > 70) {
				bearishSignals.push(`RSI overbought (${signals.rsi.toFixed(1)})`);
				bearishScore += 3;
			} else if (signals.rsi > 55) {
				bullishSignals.push(`RSI bullish (${signals.rsi.toFixed(1)})`);
				bullishScore += 1;
			} else if (signals.rsi < 45) {
				bearishSignals.push(`RSI bearish (${signals.rsi.toFixed(1)})`);
				bearishScore += 1;
			}
		}
	}

	// ============================================================================
	// STEP 5: DELTA - Direct Price Momentum
	// ============================================================================

	// Delta (direct price momentum over 3 candles)
	if (signals.delta) {
		if (signals.delta.deltaPercent3 > 0.5) {
			bullishSignals.push(`Upward momentum (+${signals.delta.deltaPercent3.toFixed(2)}% in 3 candles)`);
			bullishScore += 2;
		} else if (signals.delta.deltaPercent3 < -0.5) {
			bearishSignals.push(`Downward momentum (${signals.delta.deltaPercent3.toFixed(2)}% in 3 candles)`);
			bearishScore += 2;
		}
	}

	// ============================================================================
	// STEP 6: STRIKE CROSS CONFIRMATION (Optional but Boosts Confidence)
	// ============================================================================
	
	// If price crossed strike with gap, check for momentum confirmation
	const strikeCrossHappened = priceStrikeCrossUp || priceStrikeCrossDown;
	const otherCrossHappened = macdCrossUp || macdCrossDown || priceVwapCrossUp || priceVwapCrossDown || rsiCross50Up || rsiCross50Down;
	
	// Boost confidence if we have momentum confirmation
	let momentumConfirmationMultiplier = 1.0;
	if (strikeCrossHappened && otherCrossHappened) {
		momentumConfirmationMultiplier = 1.3; // 30% boost if confirmed by other crosses
		if (priceStrikeCrossUp) {
			bullishSignals.push("🔥 MOMENTUM CONFIRMED - Multiple crosses aligned!");
		} else {
			bearishSignals.push("🔥 MOMENTUM CONFIRMED - Multiple crosses aligned!");
		}
	}

	// ============================================================================
	// STEP 7: FINAL DECISION WITH MULTI-FACTOR CONFIDENCE
	// ============================================================================

	const totalScore = bullishScore + bearishScore;

	// Require minimum signal strength
	if (totalScore < 8) {
		return {
			action: "NO_TRADE",
			confidence: 0,
			reason: `Insufficient signal strength (score: ${totalScore}/8 minimum). Waiting for stronger setup.`,
			signals: {
				bullish: bullishSignals,
				bearish: bearishSignals,
			},
		};
	}

	// Calculate base confidence
	let bullishConfidence = totalScore > 0 ? bullishScore / totalScore : 0.5;
	let bearishConfidence = totalScore > 0 ? bearishScore / totalScore : 0.5;

	// Apply multipliers (including ADX bonus and momentum confirmation)
	bullishConfidence *= strikeDistanceConfidence * volatilityMultiplier * adxMultiplier * momentumConfirmationMultiplier;
	bearishConfidence *= strikeDistanceConfidence * volatilityMultiplier * adxMultiplier * momentumConfirmationMultiplier;

	// Normalize to 0-1 range
	bullishConfidence = Math.min(bullishConfidence, 1.0);
	bearishConfidence = Math.min(bearishConfidence, 1.0);

	// Require strong directional bias (at least 70% confidence after adjustments)
	const CONFIDENCE_THRESHOLD = 0.70;

	// Price/Strike cross is the most important signal - if it happened, override signal count requirement
	// This ensures trades trigger when price crosses the strike threshold (the actual market outcome)
	const hasPriceStrikeCross = priceStrikeCrossUp || priceStrikeCrossDown;
	
	// Require at least 2 more bullish signals than bearish (or vice versa)
	// UNLESS we have a price/strike cross, which is the most important signal
	const signalDifference = Math.abs(bullishSignals.length - bearishSignals.length);
	if (signalDifference < 2 && !hasPriceStrikeCross) {
		return {
			action: "NO_TRADE",
			confidence: Math.max(bullishConfidence, bearishConfidence),
			reason: `Conflicting signals: ${bullishSignals.length} bullish vs ${bearishSignals.length} bearish. Need clearer direction (2+ signal difference).`,
			signals: {
				bullish: bullishSignals,
				bearish: bearishSignals,
			},
		};
	}
	
	// If price/strike cross happened, boost confidence significantly
	// This ensures the trade triggers even if other signals are conflicting
	if (hasPriceStrikeCross) {
		if (priceStrikeCrossUp) {
			bullishConfidence = Math.max(bullishConfidence, 0.75); // Ensure at least 75% confidence
		} else if (priceStrikeCrossDown) {
			bearishConfidence = Math.max(bearishConfidence, 0.75); // Ensure at least 75% confidence
		}
	}

	// Check for trades - price/strike cross takes priority
	if (priceStrikeCrossUp && bullishConfidence >= CONFIDENCE_THRESHOLD) {
		return {
			action: "BUY_YES",
			confidence: bullishConfidence,
			reason: `⭐ PRICE CROSSED STRIKE - Strong bullish setup: ${bullishSignals.length} signals, ${(bullishConfidence * 100).toFixed(0)}% confidence`,
			signals: {
				bullish: bullishSignals,
				bearish: bearishSignals,
			},
		};
	}
	
	if (priceStrikeCrossDown && bearishConfidence >= CONFIDENCE_THRESHOLD) {
		return {
			action: "BUY_NO",
			confidence: bearishConfidence,
			reason: `⭐ PRICE CROSSED STRIKE - Strong bearish setup: ${bearishSignals.length} signals, ${(bearishConfidence * 100).toFixed(0)}% confidence`,
			signals: {
				bullish: bullishSignals,
				bearish: bearishSignals,
			},
		};
	}

	// Standard checks (when no price/strike cross)
	if (bullishConfidence >= CONFIDENCE_THRESHOLD && bullishSignals.length > bearishSignals.length) {
		return {
			action: "BUY_YES",
			confidence: bullishConfidence,
			reason: `Strong bullish setup: ${bullishSignals.length} signals, ${(bullishConfidence * 100).toFixed(0)}% confidence`,
			signals: {
				bullish: bullishSignals,
				bearish: bearishSignals,
			},
		};
	}

	if (bearishConfidence >= CONFIDENCE_THRESHOLD && bearishSignals.length > bullishSignals.length) {
		return {
			action: "BUY_NO",
			confidence: bearishConfidence,
			reason: `Strong bearish setup: ${bearishSignals.length} signals, ${(bearishConfidence * 100).toFixed(0)}% confidence`,
			signals: {
				bullish: bullishSignals,
				bearish: bearishSignals,
			},
		};
	}

	return {
		action: "NO_TRADE",
		confidence: Math.max(bullishConfidence, bearishConfidence),
		reason: `Below confidence threshold: ${bullishSignals.length} bullish (${(bullishConfidence * 100).toFixed(0)}%), ${bearishSignals.length} bearish (${(bearishConfidence * 100).toFixed(0)}%). Need ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%+ confidence.`,
		signals: {
			bullish: bullishSignals,
			bearish: bearishSignals,
		},
	};
}
