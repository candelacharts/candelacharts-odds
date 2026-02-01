import { fetchKlines } from "../integrations/binance";
import { kalshiService, GetMarketCandlesticksPeriodIntervalEnum } from "./kalshi";
import { orderExecutor } from "./orderExecutor";
import { displayStrategyAnalysis } from "../utils/consoleDisplay";
import {
	analyzeOrderbookDOM,
	fetchLatestBitcoinMarket,
	summarizeOrderbook,
} from "../utils/kalshiMarkets";
// Core indicators (6 reliable ones only)
import { computeRsi } from "../indicators/rsi";
import { computeMacd } from "../indicators/macd";
import { computeVwapSeries } from "../indicators/vwap";
import { computeDelta } from "../indicators/delta";
import { computeADX } from "../indicators/adx";
import { analyzeTechnicalSignals } from "../strategies/technicalStrategy";
import { CONFIG } from "../config/config";
import type { MarketCandlestick } from "kalshi-typescript/dist/esm/models/market-candlestick";

interface StrategySignal {
	name: string;
	signal: "BUY_YES" | "BUY_NO" | "NEUTRAL";
	confidence: number;
	reason: string;
}

export class StrategyRunner {
	private seriesTicker: string;
	private binanceSymbol: string;
	private binanceInterval: string;

	constructor(
		seriesTicker: string = "KXBTC15M",
		binanceSymbol: string = "BTCUSDT",
	) {
		this.seriesTicker = seriesTicker;
		this.binanceSymbol = binanceSymbol;
		// Determine interval based on series ticker
		// Hourly markets end with 'D' (daily/hourly), 15m markets end with '15M'
		this.binanceInterval = seriesTicker.toUpperCase().endsWith("D") ? "1h" : "15m";
		// Configure orderExecutor for this market's candle interval
		orderExecutor.setCandleInterval(seriesTicker);
	}

	async run(): Promise<void> {
		try {
			const market = await fetchLatestBitcoinMarket(this.seriesTicker);
			if (!market) {
				console.log("No active markets found");
				return;
			}

			// Auto-cleanup stale and closed positions
			orderExecutor.autoCleanupPositions();

			// Clean up positions for expired/closed markets
			this.cleanupExpiredPositions(market.ticker);

			// Get strike price from Kalshi API (floor_strike is the threshold price in dollars)
			const strikePrice = market.floor_strike ?? undefined;

			const [klines, orderbookRaw, kalshiCandles] = await Promise.all([
				fetchKlines({
					symbol: this.binanceSymbol,
					interval: this.binanceInterval,
					limit: 100,
				}),
				kalshiService.getMarketOrderbook(market.ticker),
				this.fetchKalshiCandlesticks(market.ticker),
			]);

			const currentPrice = klines[klines.length - 1]?.close ?? 0;
			const orderbookSummary = summarizeOrderbook(orderbookRaw);
			const domAnalysis = analyzeOrderbookDOM(orderbookRaw);

		// Determine strategy mode early
		const strategyMode = CONFIG.strategy.mode;

		// Compute core indicators (6 reliable ones only)
		const closes = klines.map((k) => k.close);
		const highs = klines.map((k) => k.high);
		const lows = klines.map((k) => k.low);
		const volumes = klines.map((k) => k.volume);

		// 1. RSI (momentum direction)
		const rsiData = computeRsi(closes, 14);
		const rsiNow = rsiData && rsiData.length > 0 ? rsiData[rsiData.length - 1] : undefined;

		// 2. MACD (momentum shifts)
		const macdData = computeMacd(closes, 12, 26, 9);

		// 3. VWAP (institutional signal with volume)
		const vwapSeries = computeVwapSeries(
			klines.map((k) => ({
				high: k.high,
				low: k.low,
				close: k.close,
				volume: k.volume,
			})),
		);

		// 4. Delta (direct price momentum)
		const deltaData = computeDelta(closes);

		// 5. ADX (trend strength filter - HARD REQUIREMENT for technical mode)
		const adxData = strategyMode === "technical" ? computeADX(highs, lows, closes, 14) : undefined;

			// Get best ask prices from market object (more reliable than parsing orderbook)
			const bestYesAsk = market.yes_ask ? market.yes_ask / 100 : null; // Convert cents to dollars
			const bestNoAsk = market.no_ask ? market.no_ask / 100 : null; // Convert cents to dollars

		// 💰 Monitor open positions for auto-close (profit target reached)
		// Use ask prices for monitoring (current market prices to buy/sell)
		const currentYesPrice = bestYesAsk ?? 0;
		const currentNoPrice = bestNoAsk ?? 0;
		await orderExecutor.monitorPositions(currentYesPrice, currentNoPrice, closes, market.ticker);

			const marketCloseTime = market.close_time
				? new Date(market.close_time)
				: new Date();
			const now = new Date();
			const timeLeftMs = marketCloseTime.getTime() - now.getTime();
			const timeLeftMin = Math.max(0, timeLeftMs / 1000 / 60);

			// Run strategy based on mode
			let signals: StrategySignal[] = [];
			type Decision = {
				action: "BUY_YES" | "BUY_NO" | "NO_TRADE";
				reason: string;
				confidence?: number;
			};
			let decision: Decision;

		if (strategyMode === "technical") {
			// Technical Analysis Strategy - Streamlined (6 indicators only)
			const technicalDecision = analyzeTechnicalSignals({
				// Current values
				rsi: rsiNow,
				macd: macdData ?? undefined,
				delta: deltaData ?? undefined,
				price: currentPrice,
				
				// Series data for cross detection
				rsiSeries: rsiData ?? undefined,
				macdSeries: macdData
					? {
							macd: klines.map((_, i) => {
								const macd = computeMacd(closes.slice(0, i + 1), 12, 26, 9);
								return macd?.macd ?? 0;
							}),
							signal: klines.map((_, i) => {
								const macd = computeMacd(closes.slice(0, i + 1), 12, 26, 9);
								return macd?.signal ?? 0;
							}),
							hist: klines.map((_, i) => {
								const macd = computeMacd(closes.slice(0, i + 1), 12, 26, 9);
								return macd?.hist ?? 0;
							}),
						}
					: undefined,
				vwapSeries: vwapSeries ?? undefined,
				priceSeries: closes,
				
				// Kalshi-specific data
				strikePrice,
				timeLeftMinutes: timeLeftMin,
				
				// ADX - HARD REQUIREMENT (trend strength filter)
				adx: adxData ?? undefined,
				
				// Optional (for display only)
				imbalanceRatio: domAnalysis.imbalanceRatio ?? undefined,
			});

				// Convert technical decision to signals format
				if (technicalDecision.action !== "NO_TRADE") {
					signals = [
						{
							name: "Technical Analysis",
							signal: technicalDecision.action,
							confidence: technicalDecision.confidence,
							reason: technicalDecision.reason,
						},
					];
				}

				decision = {
					action: technicalDecision.action,
					reason: technicalDecision.reason,
					confidence: technicalDecision.confidence,
				};
			} else {
				// Arbitrage Strategy (default)
				signals = this.runArbitrageStrategy(bestYesAsk, bestNoAsk);
				decision = this.makeFinalDecision(signals, timeLeftMin);
			}

			const imbalanceSide =
				(domAnalysis.imbalanceRatio ?? 1) > 1.5
					? "YES"
					: (domAnalysis.imbalanceRatio ?? 1) < 0.67
						? "NO"
						: "BALANCED";

			// Calculate price to beat (breakeven after Kalshi fees: ~0.7% per side)
			const kalshiFeeRate = 0.007; // 0.7%
			const yesPrice = orderbookSummary.yesPrice ?? 0;
			const noPrice = orderbookSummary.noPrice ?? 0;

			// For YES: need to sell at higher price to cover buy cost + fees
			const priceToBeatYes =
				yesPrice > 0 ? yesPrice / (1 - kalshiFeeRate * 2) : 0;
			// For NO: need to sell at higher price to cover buy cost + fees
			const priceToBeatNo = noPrice > 0 ? noPrice / (1 - kalshiFeeRate * 2) : 0;

			displayStrategyAnalysis({
				market: {
					ticker: market.ticker,
					btcPrice: currentPrice,
					timeLeftMin,
					marketClose: marketCloseTime.toLocaleTimeString("en-US"),
					strikePrice,
				},
				orderbook: {
					// Use ASK prices from market object (what we pay to buy)
					yesPrice: bestYesAsk,
					noPrice: bestNoAsk,
					spread: orderbookSummary.spread ?? 0,
					yesLiquidity: orderbookSummary.yesLiquidity ?? 0,
					noLiquidity: orderbookSummary.noLiquidity ?? 0,
					imbalance: domAnalysis.imbalanceRatio ?? 0,
					imbalanceSide,
					execQuality: domAnalysis.executionQuality ?? "unknown",
					depthL1Yes: domAnalysis.yesDepth?.[0] ?? 0,
					depthL1No: domAnalysis.noDepth?.[0] ?? 0,
					yesWeightedPrice: domAnalysis.yesWeightedPrice ?? undefined,
					noWeightedPrice: domAnalysis.noWeightedPrice ?? undefined,
					spreadPct: domAnalysis.spreadPct ?? undefined,
					priceToBeatYes: priceToBeatYes > 0 ? priceToBeatYes : undefined,
					priceToBeatNo: priceToBeatNo > 0 ? priceToBeatNo : undefined,
				},
			strategies: signals,
			decision,
			technicals: {
				// Core indicators (6 reliable ones)
				rsi: rsiNow,
				macd: macdData ?? undefined,
				vwap: vwapSeries && vwapSeries.length > 0 ? vwapSeries[vwapSeries.length - 1] : undefined,
				delta: deltaData ?? undefined,
				adx: adxData ?? undefined,
				binancePrice: currentPrice,
			},
			strategyMode,
		});

		// 🎯 EXECUTE TRADES BASED ON STRATEGY MODE
		if (decision.action !== "NO_TRADE") {
			// Check if market is still open/active
			const marketStatus = market.status;
			if (marketStatus !== "open" && marketStatus !== "active") {
				console.log(
					`  ⏭️  Skipping: Market is closed (status: ${marketStatus})`,
				);
				console.log(`     Market: ${market.ticker}`);
				console.log(`     Only "open" or "active" markets can accept orders`);
				return;
			}

			// Check time to expiry - don't trade if less than configured minimum
			// Kalshi rejects orders too close to market close
			const minTimeToExpiry = CONFIG.trading.minTimeToExpiryMin;
			if (timeLeftMin < minTimeToExpiry) {
				console.log(
					`  ⏭️  Skipping: Too close to expiry (${timeLeftMin.toFixed(1)} min < ${minTimeToExpiry} min minimum)`,
				);
				console.log(`     Market: ${market.ticker}`);
				console.log(`     Kalshi rejects orders within ${minTimeToExpiry} minutes of market close`);
				return;
			}

			// Validate orderbook has valid asks (market is ready for trading)
			if (bestYesAsk === null || bestNoAsk === null) {
				console.log(
					`  ⏭️  Skipping: Orderbook not ready (missing ask prices)`,
				);
				console.log(`     Market: ${market.ticker}`);
				console.log(`     YES Ask: ${bestYesAsk ?? "null"}, NO Ask: ${bestNoAsk ?? "null"}`);
				console.log(`     Market may have just opened - wait for liquidity`);
				return;
			}

			// Check if market has been open for at least 1 minute (avoid brand new markets)
			const marketOpenTime = market.open_time ? new Date(market.open_time).getTime() : null;
			if (marketOpenTime) {
				const marketAgeMs = Date.now() - marketOpenTime;
				const marketAgeMin = marketAgeMs / 1000 / 60;
				if (marketAgeMin < 1) {
					console.log(
						`  ⏭️  Skipping: Market too new (opened ${marketAgeMin.toFixed(1)} min ago < 1 min minimum)`,
					);
					console.log(`     Market: ${market.ticker}`);
					console.log(`     Wait for market to stabilize before trading`);
					return;
				}
			}

			// Validate orderbook has sufficient liquidity
			const yesLiquidity = orderbookSummary.yesLiquidity ?? 0;
			const noLiquidity = orderbookSummary.noLiquidity ?? 0;
			if (yesLiquidity < 1 || noLiquidity < 1) {
				console.log(
					`  ⏭️  Skipping: Insufficient liquidity`,
				);
				console.log(`     Market: ${market.ticker}`);
				console.log(`     YES Liquidity: ${yesLiquidity}, NO Liquidity: ${noLiquidity}`);
				console.log(`     Need at least 1 contract available`);
				return;
			}

			// Validate depth at best ask price (L1 depth) - critical for market orders
			// Market orders need immediate fill, so we need at least 1 contract at the best ask
			const yesDepthL1 = domAnalysis.yesDepth?.[0] ?? 0;
			const noDepthL1 = domAnalysis.noDepth?.[0] ?? 0;
			if (yesDepthL1 < 1 || noDepthL1 < 1) {
				console.log(
					`  ⏭️  Skipping: Insufficient depth at best ask price`,
				);
				console.log(`     Market: ${market.ticker}`);
				console.log(`     YES L1 Depth: ${yesDepthL1}, NO L1 Depth: ${noDepthL1}`);
				console.log(`     Need at least 1 contract at best ask for market order fill`);
				return;
			}

			// Use best ASK prices from market object (what we need to pay to buy)
			const yesAskPrice = bestYesAsk ?? 0;
			const noAskPrice = bestNoAsk ?? 0;

			// Validate prices are reasonable
			if (
				yesAskPrice > 0.01 &&
				yesAskPrice < 0.99 &&
				noAskPrice > 0.01 &&
				noAskPrice < 0.99
			) {
					if (strategyMode === "arbitrage") {
						// ARBITRAGE MODE: Only execute if total cost < $1.00
						const totalCost = yesAskPrice + noAskPrice;
						const estimatedFees = (yesAskPrice + noAskPrice) * 0.007; // 0.7% fee per side
						const totalWithFees = totalCost + estimatedFees;

						if (totalWithFees < 1.0) {
							const profit = 1.0 - totalWithFees;
							console.log(
								`  💰 Valid arbitrage found: $${totalWithFees.toFixed(4)} < $1.00 (profit: $${profit.toFixed(4)})`,
							);

							// Execute risk-free arbitrage (both sides)
							await orderExecutor.executeArbitrage(
								market.ticker,
								yesAskPrice,
								noAskPrice,
								1, // quantity: 1 contract
								true, // bothSides: true (risk-free arbitrage)
							);
						} else {
							console.log(
								`  ⏭️  Skipping: Total cost $${totalWithFees.toFixed(4)} >= $1.00 (not profitable)`,
							);
						}
					} else if (strategyMode === "technical") {
						// TECHNICAL MODE: Execute directional trade based on signal
						console.log(
							`  📊 Technical signal: ${decision.action} (confidence: ${(decision.confidence * 100).toFixed(0)}%)`,
						);

						// Determine which side to buy based on signal
						const side = decision.action === "BUY_YES" ? "yes" : "no";

						// Execute directional trade (single side only) with strike price for stop loss
						await orderExecutor.executeArbitrage(
							market.ticker,
							yesAskPrice,
							noAskPrice,
							1, // quantity: 1 contract
							false, // bothSides: false (directional trade)
							side, // forceSide: buy the side indicated by technical signal
							strikePrice, // Pass strike price for stop loss
						);
					}
				} else {
					console.log(
						`  ⏭️  Skipping: Invalid prices (YES: $${yesAskPrice.toFixed(2)}, NO: $${noAskPrice.toFixed(2)})`,
					);
				}
			}
		} catch (error) {
			console.error("Strategy runner error:", error);
		}
	}

	private runArbitrageStrategy(
		bestYesAsk: number | null,
		bestNoAsk: number | null,
	): StrategySignal[] {
		const signals: StrategySignal[] = [];

		// ARBITRAGE STRATEGY ONLY
		// When YES + NO ASK prices don't equal $1.00, there's an arbitrage opportunity
		// This is risk-free profit: buy both sides for less than $1.00, get $1.00 at expiry
		// Example: If YES ask = $0.36 and NO ask = $0.04, total = $0.40
		// You can buy both for $0.40 and guaranteed get $1.00 at expiry = 60¢ profit

		const yesPrice = bestYesAsk ?? 0;
		const noPrice = bestNoAsk ?? 0;

		// Only proceed if we have valid prices
		if (
			yesPrice > 0.02 &&
			yesPrice < 0.98 &&
			noPrice > 0.02 &&
			noPrice < 0.98
		) {
			const impliedTotal = yesPrice + noPrice;
			const arbitrageGap = Math.abs(1.0 - impliedTotal);

			// Kalshi fee: 0.7% per side (taker fee)
			// For arbitrage, we buy BOTH sides
			// Total fees = (YES price * 0.007) + (NO price * 0.007)

			if (arbitrageGap > 0.02) {
				const grossProfitCents = arbitrageGap * 100;

				// Calculate actual fees for buying BOTH sides
				const feeRate = 0.007; // 0.7% Kalshi taker fee
				const yesFee = yesPrice * feeRate;
				const noFee = noPrice * feeRate;
				const totalFees = (yesFee + noFee) * 100; // Convert to cents

				const netProfitCents = grossProfitCents - totalFees;

				if (netProfitCents > 0.5) {
					// At least 0.5¢ profit after fees
					if (impliedTotal < 1.0) {
						// YES + NO < $1.00 → Buy BOTH sides for guaranteed profit
						const reason = `ARBITRAGE: Buy BOTH - YES ($${yesPrice.toFixed(2)}) + NO ($${noPrice.toFixed(2)}) = $${impliedTotal.toFixed(2)} < $1.00. Net profit: ${netProfitCents.toFixed(1)}¢ after fees [RISK-FREE]`;

						signals.push({
							name: "Arbitrage",
							signal: "BUY_YES", // Signal doesn't matter since we buy both sides
							confidence: 0.95, // Highest confidence - this is risk-free money
							reason,
						});
					}
				}
			}
		}

		return signals;
	}

	private makeFinalDecision(
		signals: StrategySignal[],
		timeLeftMin: number,
	): {
		action: "BUY_YES" | "BUY_NO" | "NO_TRADE";
		reason: string;
		confidence?: number;
		executeOrder?: boolean;
	} {
		// Don't trade too close to expiry
		if (timeLeftMin < 2) {
			return {
				action: "NO_TRADE",
				reason: "Too close to expiry (<2 min) - too risky",
			};
		}

		// No signals
		if (signals.length === 0) {
			return {
				action: "NO_TRADE",
				reason:
					"No arbitrage opportunities detected. Waiting for risk-free trades...",
			};
		}

		// Check for arbitrage signal
		const arbitrageSignal = signals.find((s) => s.name === "Arbitrage");
		if (arbitrageSignal && arbitrageSignal.confidence >= 0.9) {
			return {
				action: arbitrageSignal.signal as "BUY_YES" | "BUY_NO",
				reason: `🎯 ARBITRAGE TRADE: ${arbitrageSignal.reason}`,
				confidence: arbitrageSignal.confidence,
				executeOrder: true, // ✅ EXECUTE THIS TRADE
			};
		}

		return {
			action: "NO_TRADE",
			reason:
				"No arbitrage opportunities detected. Waiting for risk-free trades...",
			executeOrder: false,
		};
	}

	/**
	 * Clean up positions for markets that are no longer active
	 */
	private cleanupExpiredPositions(currentMarketTicker: string): void {
		const openPositions = orderExecutor.getOpenPositions();
		
		for (const position of openPositions) {
			const ageMinutes = Math.floor((Date.now() - position.entryTime) / 60000);
			
			// Clear positions if:
			// 1. Different ticker AND older than 30 minutes, OR
			// 2. Same ticker but older than 60 minutes (definitely expired)
			const isDifferentTicker = position.ticker !== currentMarketTicker;
			const isVeryOld = ageMinutes > 60;
			const isOldAndDifferent = isDifferentTicker && ageMinutes > 30;
			
			if (isVeryOld || isOldAndDifferent) {
				console.log(`\n🧹 Cleaning up expired position: ${position.ticker}`);
				console.log(`   Age: ${ageMinutes} minutes`);
				console.log(`   Current market: ${currentMarketTicker}`);
				console.log(`   Reason: ${isVeryOld ? 'Very old (>60 min)' : 'Different ticker & old (>30 min)'}`);
				orderExecutor.clearPosition(position.ticker);
				orderExecutor.clearFailedOrderTracking(position.ticker);
			}
		}
		
		// Also clear failed order tracking for any ticker that's not the current market
		// This prevents retry spam on old/expired markets
		const allPositions = orderExecutor.getOpenPositions();
		const allTickers = new Set(allPositions.map(p => p.ticker));
		allTickers.add(currentMarketTicker); // Keep current market
		
		// Clear failed orders for tickers not in active positions and not current market
		orderExecutor.clearStaleFailedOrders(currentMarketTicker);
	}

	async startPolling(intervalMs: number = 5000): Promise<void> {
		await this.run();

		setInterval(async () => {
			await this.run();
		}, intervalMs);
	}

	/**
	 * Fetch Kalshi candlestick data for the current market
	 */
	private async fetchKalshiCandlesticks(ticker: string) {
		try {
			// Extract series ticker from market ticker (e.g., KXBTC15M-26JAN311500-00 -> KXBTC15M)
		const seriesMatch = ticker.match(/^([A-Z0-9]+)-/);
		const seriesTicker = seriesMatch?.[1] ?? this.seriesTicker;
		
		// Get last 10 candles for pattern analysis
		const endTs = Math.floor(Date.now() / 1000);
		
		// Determine period interval based on market type
		// Valid values: 1 (1 minute), 60 (1 hour), 1440 (1 day)
		const periodInterval = this.binanceInterval === "1h" 
			? GetMarketCandlesticksPeriodIntervalEnum.NUMBER_60
			: GetMarketCandlesticksPeriodIntervalEnum.NUMBER_1; // Use 1 minute for 15m markets
		
		const intervalSeconds = this.binanceInterval === "1h" ? 3600 : 900;
		const startTs = endTs - (intervalSeconds * 10); // Get 10 periods of history
		
	const response = await kalshiService.getMarketCandlesticks(
		seriesTicker,
			ticker ?? "",
			startTs,
			endTs,
			periodInterval,
		);
		
		// Convert MarketCandlestick to our Candlestick format
		const candlesticks = (response.candlesticks || []).map((candle: MarketCandlestick) => ({
				end_period_ts: candle.end_period_ts,
				yes_bid: candle.yes_bid ? {
					open: candle.yes_bid.open ?? 0,
					low: candle.yes_bid.low ?? 0,
					high: candle.yes_bid.high ?? 0,
					close: candle.yes_bid.close ?? 0,
				} : undefined,
				yes_ask: candle.yes_ask ? {
					open: candle.yes_ask.open ?? 0,
					low: candle.yes_ask.low ?? 0,
					high: candle.yes_ask.high ?? 0,
					close: candle.yes_ask.close ?? 0,
				} : undefined,
				price: candle.price ? {
					open: candle.price.open ?? 0,
					low: candle.price.low ?? 0,
					high: candle.price.high ?? 0,
					close: candle.price.close ?? 0,
					mean: candle.price.mean ?? 0,
					previous: candle.price.previous ?? 0,
					min: candle.price.min ?? 0,
					max: candle.price.max ?? 0,
				} : undefined,
				volume: candle.volume,
				open_interest: candle.open_interest,
			}));
			
			return candlesticks;
		} catch (error) {
			console.error("Error fetching Kalshi candlesticks:", error);
			return [];
		}
	}
}
