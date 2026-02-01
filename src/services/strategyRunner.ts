import { fetchKlines } from "../integrations/binance";
import { kalshiService, GetMarketCandlesticksPeriodIntervalEnum } from "./kalshi";
import { orderExecutor } from "./orderExecutor";
import { displayStrategyAnalysis } from "../utils/consoleDisplay";
import {
	analyzeOrderbookDOM,
	fetchLatestBitcoinMarket,
	summarizeOrderbook,
} from "../utils/kalshiMarkets";

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

			// Get best ask prices from market object (more reliable than parsing orderbook)
			const bestYesAsk = market.yes_ask ? market.yes_ask / 100 : null; // Convert cents to dollars
			const bestNoAsk = market.no_ask ? market.no_ask / 100 : null; // Convert cents to dollars

			// 💰 Monitor open positions for auto-close (profit target reached)
			// Use ask prices for monitoring (current market prices to buy/sell)
			const currentYesPrice = bestYesAsk ?? 0;
			const currentNoPrice = bestNoAsk ?? 0;
			await orderExecutor.monitorPositions(currentYesPrice, currentNoPrice);

			const marketCloseTime = market.close_time
				? new Date(market.close_time)
				: new Date();
			const now = new Date();
			const timeLeftMs = marketCloseTime.getTime() - now.getTime();
			const timeLeftMin = Math.max(0, timeLeftMs / 1000 / 60);

			// Run arbitrage strategy
			const signals = this.runArbitrageStrategy(bestYesAsk, bestNoAsk);

			// Make final decision
			const decision = this.makeFinalDecision(signals, timeLeftMin);

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
		});

		// 🎯 EXECUTE ARBITRAGE TRADES ONLY
			if (decision.executeOrder && decision.action !== "NO_TRADE") {
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
					// Check if it's a valid arbitrage (total cost < $1.00)
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
			const seriesTicker = seriesMatch ? seriesMatch[1] : this.seriesTicker;
			
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
				ticker,
				startTs,
				endTs,
				periodInterval,
			);
			
			// Convert MarketCandlestick to our Candlestick format
			const candlesticks = (response.candlesticks || []).map(candle => ({
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
