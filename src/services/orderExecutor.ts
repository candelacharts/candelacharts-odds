/**
 * Order Executor
 * Handles placing and managing orders on Kalshi based on strategy signals
 */

import { CONFIG } from "../config/config";
import { kalshiService } from "./kalshi";
import { orderLogger } from "../utils/orderLogger";

export interface OrderConfig {
	ticker: string;
	side: "yes" | "no";
	action: "buy" | "sell";
	quantity: number; // Number of contracts
	price: number; // Limit price in cents (1-99)
	type: "limit" | "market";
}

export interface Position {
	ticker: string;
	side: "yes" | "no";
	quantity: number;
	entryPrice: number; // Price paid per contract (in dollars)
	entryTime: number; // Timestamp
	fees: number; // Fees paid (in dollars)
	strategy: string; // Which strategy opened this position
	strikePrice?: number; // Strike price at entry (for stop loss)
}

export interface ArbitragePosition {
	ticker: string;
	yesSide?: Position;
	noSide?: Position;
	totalCost: number; // Total dollars invested
	expectedProfit: number; // Expected profit at expiry
	entryTime: number;
	status: "open" | "closed" | "partial";
}

export class OrderExecutor {
	private arbitragePositions: Map<string, ArbitragePosition> = new Map();
	private orderIds: Map<string, string[]> = new Map(); // ticker -> order IDs
	private readonly KALSHI_FEE_RATE = 0.007; // 0.7% taker fee
	private readonly PROFIT_TARGET_USD = CONFIG.trading.profitTargetUsd;
	private readonly MAX_ARBITRAGE_POSITIONS = CONFIG.trading.maxArbitragePositions;
	private readonly MAX_TECHNICAL_POSITIONS = CONFIG.trading.maxTechnicalPositions;
	// Track positions per asset (series ticker) and per candle
	// Structure: Map<candleTimestamp, Map<seriesTicker, { arbitrage: count, technical: count }>>
	private positionsByCandle: Map<number, Map<string, { arbitrage: number; technical: number }>> = new Map();
	private failedOrdersByCandle: Map<number, Map<string, number>> = new Map(); // ticker -> retry count
	private readonly MAX_RETRIES = CONFIG.trading.maxOrderRetries;
	private candleIntervalMs: number = 15 * 60 * 1000; // Default: 15 minutes
	private readonly AUTO_CLEAR_MINUTES = CONFIG.trading.autoClearMinutes;
	private lastCandleTimestamp: number = 0; // Track last candle for new candle detection

	constructor() {
		console.log(
			`\n💰 Order Executor initialized with profit target: $${this.PROFIT_TARGET_USD}`,
		);
		console.log(
			`   Maximum arbitrage positions per candle: ${this.MAX_ARBITRAGE_POSITIONS}`,
		);
		console.log(
			`   Maximum technical positions per candle: ${this.MAX_TECHNICAL_POSITIONS}`,
		);
		console.log(
			`   When either side reaches $${this.PROFIT_TARGET_USD} profit, BOTH sides will be closed`,
		);
		console.log(
			`   Auto-clear stale positions after: ${this.AUTO_CLEAR_MINUTES} minutes\n`,
		);
	}

	/**
	 * Set the candle interval based on the market type
	 * @param seriesTicker - The Kalshi series ticker (e.g., KXBTC15M, KXBTCD)
	 */
	setCandleInterval(seriesTicker: string): void {
		// Hourly markets end with 'D', 15-minute markets end with '15M'
		const isHourly = seriesTicker.toUpperCase().endsWith("D");
		this.candleIntervalMs = isHourly ? 60 * 60 * 1000 : 15 * 60 * 1000; // 1 hour or 15 minutes
	}

	/**
	 * Round timestamp to candle period (15-min or 1-hour)
	 */
	private roundToCandle(timestamp: number): number {
		return Math.floor(timestamp / this.candleIntervalMs) * this.candleIntervalMs;
	}

	/**
	 * Extract series ticker from market ticker (e.g., "KXBTC15M-26FEB010800-00-1769949900000" -> "KXBTC15M")
	 */
	private extractSeriesTicker(marketTicker: string): string {
		const seriesMatch = marketTicker.match(/^([A-Z0-9]+)-/);
		return seriesMatch?.[1] ?? marketTicker;
	}

	/**
	 * Get count of positions opened in current candle by strategy type for a specific asset
	 */
	private getPositionsInCurrentCandle(seriesTicker: string, strategyType: "arbitrage" | "technical"): number {
		const currentCandle = this.roundToCandle(Date.now());
		const seriesMap = this.positionsByCandle.get(currentCandle) || new Map();
		const counts = seriesMap.get(seriesTicker) || { arbitrage: 0, technical: 0 };
		return counts[strategyType];
	}

	/**
	 * Increment position count for current candle by strategy type for a specific asset
	 */
	private incrementCandlePositions(seriesTicker: string, strategyType: "arbitrage" | "technical"): void {
		const currentCandle = this.roundToCandle(Date.now());
		let seriesMap = this.positionsByCandle.get(currentCandle);
		if (!seriesMap) {
			seriesMap = new Map();
			this.positionsByCandle.set(currentCandle, seriesMap);
		}
		const counts = seriesMap.get(seriesTicker) || { arbitrage: 0, technical: 0 };
		counts[strategyType]++;
		seriesMap.set(seriesTicker, counts);

		// Clean up old candles (keep only last 4 hours)
		const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
		for (const [candle] of this.positionsByCandle) {
			if (candle < fourHoursAgo) {
				this.positionsByCandle.delete(candle);
			}
		}
	}

	/**
	 * Track failed order for current candle (increment retry count)
	 */
	private trackFailedOrder(ticker: string): void {
		const currentCandle = this.roundToCandle(Date.now());
		const failedOrders = this.failedOrdersByCandle.get(currentCandle) || new Map();
		const currentCount = failedOrders.get(ticker) || 0;
		failedOrders.set(ticker, currentCount + 1);
		this.failedOrdersByCandle.set(currentCandle, failedOrders);

		// Clean up old candles (keep only last 4 hours)
		const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
		for (const [candle] of this.failedOrdersByCandle) {
			if (candle < fourHoursAgo) {
				this.failedOrdersByCandle.delete(candle);
			}
		}
	}

	/**
	 * Execute an arbitrage trade (buy one or both sides)
	 */
	async executeArbitrage(
		ticker: string,
		yesPrice: number,
		noPrice: number,
		quantity: number = 1,
		bothSides: boolean = false, // true = risk-free, false = single side
		forceSide?: "yes" | "no", // Force a specific side (for technical analysis)
		strikePrice?: number, // Strike price for stop loss tracking
	): Promise<ArbitragePosition | null> {
		// First, check if market is still open/active before attempting any order
		try {
			const market = await kalshiService.getMarket(ticker);
			const marketStatus = market?.status;

			// Log market status for debugging
			console.log(`  🔍 Checking market status for ${ticker}: ${marketStatus || "unknown"}`);

			// Check market status
			if (marketStatus !== "open" && marketStatus !== "active") {
				console.log(
					`  ⏭️  Skipping: Market is closed (status: ${marketStatus})`,
				);
				console.log(`     Ticker: ${ticker}`);
				console.log(`     Only "open" or "active" markets can accept orders`);
				// Clear any failed order tracking for this closed market
				const currentCandle = this.roundToCandle(Date.now());
				const failedOrders = this.failedOrdersByCandle.get(currentCandle);
				if (failedOrders?.has(ticker)) {
					failedOrders.delete(ticker);
					if (failedOrders.size === 0) {
						this.failedOrdersByCandle.delete(currentCandle);
					} else {
						this.failedOrdersByCandle.set(currentCandle, failedOrders);
					}
				}
				return null;
			}

			// Also check if market has expired (close_time has passed)
			if (market?.close_time) {
				const closeTime = new Date(market.close_time).getTime();
				const now = Date.now();
				if (now >= closeTime) {
					console.log(
						`  ⏭️  Skipping: Market has expired (closed at ${new Date(market.close_time).toLocaleString()})`,
					);
					console.log(`     Ticker: ${ticker}`);
					console.log(`     Market close time has passed`);
					// Clear any failed order tracking for this expired market
					const currentCandle = this.roundToCandle(Date.now());
					const failedOrders = this.failedOrdersByCandle.get(currentCandle);
					if (failedOrders?.has(ticker)) {
						failedOrders.delete(ticker);
						if (failedOrders.size === 0) {
							this.failedOrdersByCandle.delete(currentCandle);
						} else {
							this.failedOrdersByCandle.set(currentCandle, failedOrders);
						}
					}
					return null;
				}
			}

			// Market is open and active - proceed with order
			console.log(`  ✓ Market is active (status: ${marketStatus}) - proceeding with order`);
		} catch (error) {
			// If we can't fetch market, assume it's closed and skip
			console.log(
				`  ⏭️  Skipping: Cannot verify market status (market may be closed)`,
			);
			console.log(`     Ticker: ${ticker}`);
			console.log(`     Error: ${error instanceof Error ? error.message : "Unknown error"}`);
			return null;
		}

		// Check if we already have a position on this ticker
		const existingPosition = this.arbitragePositions.get(ticker);
		if (existingPosition) {
			// Determine strategy type
			const existingStrategy = existingPosition.yesSide?.strategy || existingPosition.noSide?.strategy || "Unknown";
			const newStrategy = forceSide ? "Technical-Directional" : bothSides ? "Arbitrage" : "Arbitrage-SingleSide";

			const ageMinutes = Math.floor((Date.now() - existingPosition.entryTime) / 60000);
			const entryTime = new Date(existingPosition.entryTime).toLocaleString();

			console.log(
				`  ⏭️  Skipping: Already have a ${existingStrategy} position on ${ticker}`,
			);
			console.log(
				`     Cannot open new ${newStrategy} position while existing position is active`,
			);
			console.log(
				`     Existing position age: ${ageMinutes} minutes (opened at ${entryTime})`,
			);
			console.log(
				`     Status: ${existingPosition.status}`,
			);
			console.log(
				`     💡 Tip: If this position is stale, run: bun run clear-positions.ts clear`,
			);
			return null;
		}

		// Check retry count for this ticker in current candle
		const currentCandle = this.roundToCandle(Date.now());
		const failedOrders = this.failedOrdersByCandle.get(currentCandle) || new Map();
		const retryCount = failedOrders.get(ticker) || 0;

		// If this is a retry, check if market is still active
		if (retryCount > 0) {
			try {
				const market = await kalshiService.getMarket(ticker);
				const marketStatus = market?.status;
				if (marketStatus !== "open" && marketStatus !== "active") {
					console.log(
						`  ⏭️  Skipping retry: Market is closed (status: ${marketStatus})`,
					);
					console.log(`     Ticker: ${ticker}`);
					console.log(`     Clearing failed order tracking for closed market`);
					// Clear failed order tracking for this closed market
					failedOrders.delete(ticker);
					if (failedOrders.size === 0) {
						this.failedOrdersByCandle.delete(currentCandle);
					} else {
						this.failedOrdersByCandle.set(currentCandle, failedOrders);
					}
					return null;
				}
				console.log(`  🔄 Retry attempt ${retryCount + 1}/${this.MAX_RETRIES} for ${ticker}`);
			} catch (error) {
				// If we can't fetch market, assume it's closed and skip retry
				console.log(
					`  ⏭️  Skipping retry: Cannot verify market status (market may be closed)`,
				);
				console.log(`     Ticker: ${ticker}`);
				// Clear failed order tracking
				failedOrders.delete(ticker);
				if (failedOrders.size === 0) {
					this.failedOrdersByCandle.delete(currentCandle);
				} else {
					this.failedOrdersByCandle.set(currentCandle, failedOrders);
				}
				return null;
			}
		}

		if (retryCount >= this.MAX_RETRIES) {
			const candleTime = new Date(currentCandle).toLocaleTimeString();
			const candleType = this.candleIntervalMs === 60 * 60 * 1000 ? "hourly" : "15-min";
			console.log(
				`  ⏭️  Skipping: ${ticker} reached max retries (${retryCount}/${this.MAX_RETRIES}) in current ${candleType} candle (${candleTime})`,
			);
			console.log(`     Will retry in next candle`);
			return null;
		}

		// Determine strategy type and check position limits
		const strategyType = forceSide ? "technical" : "arbitrage";
		const orderType = "market"; // Always use market orders for instant execution
		const maxPositions = strategyType === "arbitrage"
			? this.MAX_ARBITRAGE_POSITIONS
			: this.MAX_TECHNICAL_POSITIONS;

		// Extract series ticker to track positions per asset
		const seriesTicker = this.extractSeriesTicker(ticker);
		const positionsInCandle = this.getPositionsInCurrentCandle(seriesTicker, strategyType);
		if (positionsInCandle >= maxPositions) {
			const currentCandle = this.roundToCandle(Date.now());
			const candleTime = new Date(currentCandle).toLocaleTimeString();
			const candleType = this.candleIntervalMs === 60 * 60 * 1000 ? "hourly" : "15-min";
			console.log(
				`  ⏭️  Skipping: Maximum ${maxPositions} ${strategyType} positions reached for ${seriesTicker} in ${candleType} candle starting at ${candleTime}`,
			);
			console.log(`     Wait for next candle to place more orders for this asset`);
			return null;
		}

		console.log(`  🎯 Executing Arbitrage on ${ticker}`);
		console.log(`  YES: $${yesPrice.toFixed(2)}, NO: $${noPrice.toFixed(2)}`);
		console.log(
			`  Strategy: ${bothSides ? "Both Sides (Risk-Free)" : "Single Side (Cheaper)"}`,
		);

		// Calculate total cost
		const totalCost =
			(yesPrice + noPrice + (yesPrice + noPrice) * this.KALSHI_FEE_RATE) *
			quantity;
		console.log(`  Estimated Total Cost: $${totalCost.toFixed(4)}`);

		// Safety check: Only execute if total cost is less than $1.00 per contract
		if (bothSides && totalCost / quantity >= 1.0) {
			console.log(
				`  ❌ INVALID ARBITRAGE: Total cost ($${(totalCost / quantity).toFixed(4)}) >= $1.00 per contract`,
			);
			console.log(
				`  ⚠️  This is not a valid arbitrage opportunity - skipping trade`,
			);
			console.log();
			return null;
		}

		// Confirm valid arbitrage
		if (bothSides) {
			const costPerContract = totalCost / quantity;
			const profitPerContract = 1.0 - costPerContract;
			console.log(
				`  ✅ VALID ARBITRAGE: Total cost $${costPerContract.toFixed(4)} < $1.00`,
			);
			console.log(
				`  💰 Expected profit: $${profitPerContract.toFixed(4)} per contract (${(profitPerContract * 100).toFixed(2)}% ROI)`,
			);
		}

		// Check balance before placing orders
		try {
			const balance = await kalshiService.getBalance();
			const availableBalance = balance.balance; // Already in dollars from kalshiService
			console.log(`  Available Balance: $${availableBalance.toFixed(2)}`);

			if (availableBalance < totalCost) {
				console.log(
					`  ❌ INSUFFICIENT BALANCE: Need $${totalCost.toFixed(4)}, have $${availableBalance.toFixed(2)}`,
				);
				console.log(
					`  ⚠️  Please deposit at least $${(totalCost - availableBalance + 5).toFixed(2)} to continue trading`,
				);
				console.log();
				return null;
			}

			console.log(`  ✓ Sufficient balance to place orders`);
		} catch {
			console.log(`  ⚠️  Could not verify balance, proceeding with caution...`);
		}

		console.log();

		const arbPosition: ArbitragePosition = {
			ticker,
			totalCost: 0,
			expectedProfit: 0,
			entryTime: Date.now(),
			status: "open",
		};

		try {
			if (bothSides) {
				// TRUE ARBITRAGE: Buy both YES and NO (risk-free)
				console.log("  📊 Placing BOTH orders simultaneously (parallel)...");

				// Place both orders in parallel using Promise.all for maximum speed
				// This sends both requests at the exact same time
				const [yesResult, noResult] = await Promise.all([
					this.placeOrder({
						ticker,
						side: "yes",
						action: "buy",
						quantity,
						price: yesPrice, // Price in dollars for market orders (used to calculate buyMaxCost)
						type: "market",
					}),
					this.placeOrder({
						ticker,
						side: "no",
						action: "buy",
						quantity,
						price: noPrice, // Price in dollars for market orders (used to calculate buyMaxCost)
						type: "market",
					}),
				]);

				if (yesResult.success && noResult.success) {
					// Both orders succeeded
					const yesOrder = { orderId: yesResult.orderId, status: "success" };
					const noOrder = { orderId: noResult.orderId, status: "success" };

					const yesFee = yesPrice * this.KALSHI_FEE_RATE;
					arbPosition.yesSide = {
						ticker,
						side: "yes",
						quantity,
						entryPrice: yesPrice,
						entryTime: Date.now(),
						fees: yesFee,
						strategy: "Arbitrage",
					};
					arbPosition.totalCost += yesPrice + yesFee;

					const noFee = noPrice * this.KALSHI_FEE_RATE;
					arbPosition.noSide = {
						ticker,
						side: "no",
						quantity,
						entryPrice: noPrice,
						entryTime: Date.now(),
						fees: noFee,
						strategy: "Arbitrage",
					};
					arbPosition.totalCost += noPrice + noFee;

					// Calculate expected profit (one side pays $1.00)
					arbPosition.expectedProfit = 1.0 - arbPosition.totalCost;
					arbPosition.status = "open";

					console.log(`     ✓ Both orders placed successfully`);
					console.log(`     YES Order ID: ${yesOrder.orderId}`);
					console.log(`     NO Order ID: ${noOrder.orderId}`);

					// Log orders to CSV
					const timestamp = Date.now();
					orderLogger.logBatchOrders([
						{
							timestamp,
							ticker,
							side: "yes",
							action: "buy",
							quantity,
							price: Math.round(yesPrice * 100),
							orderId: yesOrder.orderId,
							status: "success",
							totalCost: yesPrice + yesFee,
							fees: yesFee,
							strategy: "Arbitrage",
						},
						{
							timestamp,
							ticker,
							side: "no",
							action: "buy",
							quantity,
							price: Math.round(noPrice * 100),
							orderId: noOrder.orderId,
							status: "success",
							totalCost: noPrice + noFee,
							fees: noFee,
							strategy: "Arbitrage",
						},
					]);

					// Store position and increment candle counter ONLY on success
					this.arbitragePositions.set(ticker, arbPosition);
					this.incrementCandlePositions(seriesTicker, strategyType);

					const currentCandle = this.roundToCandle(Date.now());
					const candleTime = new Date(currentCandle).toLocaleTimeString();
					const positionsInCandle = this.getPositionsInCurrentCandle(seriesTicker, strategyType);
					const maxPositions = strategyType === "arbitrage"
						? this.MAX_ARBITRAGE_POSITIONS
						: this.MAX_TECHNICAL_POSITIONS;
					const candleType = this.candleIntervalMs === 60 * 60 * 1000 ? "hourly" : "15-min";
					console.log(
						`     📊 ${strategyType.charAt(0).toUpperCase() + strategyType.slice(1)} positions for ${seriesTicker} in current ${candleType} candle (${candleTime}): ${positionsInCandle}/${maxPositions}`,
					);
				} else {
					// One or both orders failed
					console.log(`     ✗ Order placement failed`);
					if (!yesResult.success) console.log(`       YES order failed`);
					if (!noResult.success) console.log(`       NO order failed`);

					arbPosition.status = "partial";

					// Log failed orders
					const timestamp = Date.now();
					const failedOrders = [];

					if (!yesResult.success) {
						failedOrders.push({
							timestamp,
							ticker,
							side: "yes" as const,
							action: "buy" as const,
							quantity,
							price: Math.round(yesPrice * 100),
							status: "failed" as const,
							errorMessage: "Order placement failed",
							strategy: "Arbitrage",
						});
					}

					if (!noResult.success) {
						failedOrders.push({
							timestamp,
							ticker,
							side: "no" as const,
							action: "buy" as const,
							quantity,
							price: Math.round(noPrice * 100),
							status: "failed" as const,
							errorMessage: "Order placement failed",
							strategy: "Arbitrage",
						});
					}

					if (failedOrders.length > 0) {
						orderLogger.logBatchOrders(failedOrders);
					}

					// If one succeeded and one failed, we have a partial position - need to handle this
					if (yesResult.success && !noResult.success) {
						this.trackFailedOrder(ticker);
						const currentCandle = this.roundToCandle(Date.now());
						const failedOrders = this.failedOrdersByCandle.get(currentCandle) || new Map();
						const retryCount = failedOrders.get(ticker) || 0;

						console.log(
							`     ⚠️  WARNING: YES order placed but NO order failed - partial arbitrage!`,
						);
						console.log(`     💡 Position NOT created (both sides required for arbitrage)`);
						console.log(`     Attempts: ${retryCount}/${this.MAX_RETRIES}`);
						// TODO: Could cancel the YES order here to avoid partial position
						return null;
					} else if (!yesResult.success && noResult.success) {
						this.trackFailedOrder(ticker);
						const currentCandle = this.roundToCandle(Date.now());
						const failedOrders = this.failedOrdersByCandle.get(currentCandle) || new Map();
						const retryCount = failedOrders.get(ticker) || 0;

						console.log(
							`     ⚠️  WARNING: NO order placed but YES order failed - partial arbitrage!`,
						);
						console.log(`     💡 Position NOT created (both sides required for arbitrage)`);
						console.log(`     Attempts: ${retryCount}/${this.MAX_RETRIES}`);
						// TODO: Could cancel the NO order here to avoid partial position
						return null;
					} else {
						// Both failed
						this.trackFailedOrder(ticker);
						const currentCandle = this.roundToCandle(Date.now());
						const failedOrders = this.failedOrdersByCandle.get(currentCandle) || new Map();
						const retryCount = failedOrders.get(ticker) || 0;

						console.log(`     ❌ Both orders failed - Position NOT created`);
						console.log(`     💡 Position counter NOT incremented (orders failed)`);
						console.log(`     Attempts: ${retryCount}/${this.MAX_RETRIES}`);

						if (retryCount >= this.MAX_RETRIES) {
							console.log(`     💡 Max retries reached - will try again next candle`);
						} else {
							console.log(`     💡 Will retry (${this.MAX_RETRIES - retryCount} attempts left)`);
						}
						return null;
					}
				}

				console.log();
				console.log(`  ✅ Risk-Free Arbitrage Position Opened:`);
				console.log(`     Total Cost: $${arbPosition.totalCost.toFixed(4)}`);
				console.log(
					`     Expected Profit: $${arbPosition.expectedProfit.toFixed(4)}`,
				);
				console.log(
					`     ROI: ${((arbPosition.expectedProfit / arbPosition.totalCost) * 100).toFixed(2)}%`,
				);
				console.log(`     Strategy: BOTH SIDES (Guaranteed Profit)`);
				console.log(`     Risk: ZERO`);
			} else {
				// SINGLE SIDE: Buy one side only
				// Use forceSide if provided (for technical analysis), otherwise pick cheaper side
				const side = forceSide || (yesPrice < noPrice ? "yes" : "no");
				const price = side === "yes" ? yesPrice : noPrice;

				console.log(
					`\n📊 Placing order for ${side.toUpperCase()} at $${price.toFixed(2)}...`,
				);

				const orderResult = await this.placeOrder({
					ticker,
					side,
					action: "buy",
					quantity,
					price: orderType === "market" ? price : Math.round(price * 100), // Market: price in dollars for buyMaxCost calc, Limit: price in cents
					type: orderType,
				});

				if (orderResult.success) {
					const fee = price * this.KALSHI_FEE_RATE;
					const strategyName = forceSide ? "Technical-Directional" : "Arbitrage-SingleSide";
					const position: Position = {
						ticker,
						side,
						quantity,
						entryPrice: price,
						entryTime: Date.now(),
						fees: fee,
						strategy: strategyName,
						strikePrice: strikePrice, // Store strike for stop loss
					};

					if (side === "yes") {
						arbPosition.yesSide = position;
					} else {
						arbPosition.noSide = position;
					}

					arbPosition.totalCost = price + fee;
					arbPosition.expectedProfit = 1.0 - arbPosition.totalCost; // If we win
					arbPosition.status = "open";

					console.log(`\n✅ Single-Side Position Opened:`);
					console.log(`   Side: ${side.toUpperCase()}`);
					console.log(`   Cost: $${arbPosition.totalCost.toFixed(4)}`);
					console.log(
						`   Potential Profit (if wins): $${arbPosition.expectedProfit.toFixed(4)}`,
					);
					console.log(
						`   Potential Loss (if loses): $${arbPosition.totalCost.toFixed(4)}`,
					);

					// Log order to CSV
					orderLogger.logOrder({
						timestamp: Date.now(),
						ticker,
						side,
						action: "buy",
						quantity,
						price: Math.round(price * 100),
						orderId: orderResult.orderId,
						status: "success",
						totalCost: arbPosition.totalCost,
						fees: fee,
						strategy: strategyName,
					});

					// Store position and increment candle counter ONLY on success
					this.arbitragePositions.set(ticker, arbPosition);
					this.incrementCandlePositions(seriesTicker, strategyType);

					const currentCandle = this.roundToCandle(Date.now());
					const candleTime = new Date(currentCandle).toLocaleTimeString();
					const positionsInCandle = this.getPositionsInCurrentCandle(seriesTicker, strategyType);
					const maxPositions = strategyType === "arbitrage"
						? this.MAX_ARBITRAGE_POSITIONS
						: this.MAX_TECHNICAL_POSITIONS;
					const candleType = this.candleIntervalMs === 60 * 60 * 1000 ? "hourly" : "15-min";
					console.log(
						`     📊 ${strategyType.charAt(0).toUpperCase() + strategyType.slice(1)} positions for ${seriesTicker} in current ${candleType} candle (${candleTime}): ${positionsInCandle}/${maxPositions}`,
					);
				} else {
					// Order failed - track and return null
					this.trackFailedOrder(ticker);
					const currentCandle = this.roundToCandle(Date.now());
					const failedOrders = this.failedOrdersByCandle.get(currentCandle) || new Map();
					const retryCount = failedOrders.get(ticker) || 0;

					console.log(`\n❌ Single-Side Order Failed - Position NOT created`);
					console.log(`   Ticker: ${ticker}`);
					console.log(`   Side: ${side.toUpperCase()}`);
					console.log(`   Price: $${price.toFixed(2)}`);
					console.log(`   Attempts: ${retryCount}/${this.MAX_RETRIES}`);
					console.log(`   💡 Position counter NOT incremented (order failed)`);

					if (retryCount >= this.MAX_RETRIES) {
						console.log(`   💡 Max retries reached - will try again next candle`);
					} else {
						console.log(`   💡 Will retry (${this.MAX_RETRIES - retryCount} attempts left)`);
					}
					return null;
				}
			}

			return arbPosition;
		} catch (error: unknown) {
			// Extract only error code and reason
			let errorCode = "unknown";
			let errorMessage = "Unknown error";

			if (error && typeof error === "object" && "response" in error) {
				const axiosError = error as any;
				if (axiosError.response?.data?.error) {
					errorCode = axiosError.response.data.error.code || "unknown";
					errorMessage =
						axiosError.response.data.error.message || "Unknown error";
				}
			} else if (error instanceof Error) {
				errorMessage = error.message;
			}

			console.error(
				`❌ Error executing arbitrage: [${errorCode}] ${errorMessage}`,
			);
			return null;
		}
	}

	/**
	 * Execute a regular directional trade (non-arbitrage)
	 */
	async executeDirectionalTrade(
		ticker: string,
		side: "yes" | "no",
		price: number,
		quantity: number = 1,
		strategy: string = "Multi-Signal",
	): Promise<Position | null> {
		console.log(`  🎯 Executing ${side.toUpperCase()} trade on ${ticker}`);
		console.log(`  Price: $${price.toFixed(2)}`);
		console.log(`  Strategy: ${strategy}`);
		console.log();

		try {
			const orderResult = await this.placeOrder({
				ticker,
				side,
				action: "buy",
				quantity,
				price: orderType === "market" ? 0 : Math.round(price * 100), // Market orders use price 0
				type: orderType,
			});

			if (orderResult.success) {
				const fee = price * this.KALSHI_FEE_RATE;
				const position: Position = {
					ticker,
					side,
					quantity,
					entryPrice: price,
					entryTime: Date.now(),
					fees: fee,
					strategy,
					strikePrice: strikePrice, // Store strike for stop loss
				};

				const totalCost = price + fee;
				const potentialProfit = 1.0 - totalCost;
				const potentialLoss = totalCost;

				console.log(`  ✅ Position Opened:`);
				console.log(`     Side: ${side.toUpperCase()}`);
				console.log(`     Entry Price: $${price.toFixed(4)}`);
				console.log(`     Total Cost: $${totalCost.toFixed(4)}`);
				console.log(
					`     Potential Profit (if wins): $${potentialProfit.toFixed(4)} (${((potentialProfit / totalCost) * 100).toFixed(2)}%)`,
				);
				console.log(
					`     Potential Loss (if loses): $${potentialLoss.toFixed(4)} (100%)`,
				);

				// Log order to CSV
				orderLogger.logOrder({
					timestamp: Date.now(),
					ticker,
					side,
					action: "buy",
					quantity,
					price: Math.round(price * 100),
					orderId: orderResult.orderId,
					status: "success",
					totalCost,
					fees: fee,
					strategy,
				});

				return position;
			}

			// Log failed order
			orderLogger.logOrder({
				timestamp: Date.now(),
				ticker,
				side,
				action: "buy",
				quantity,
				price: Math.round(price * 100),
				status: "failed",
				errorMessage: "Order execution failed",
				strategy,
			});

			return null;
		} catch (error: unknown) {
			// Extract only error code and reason
			let errorCode = "unknown";
			let errorMessage = "Unknown error";

			if (error && typeof error === "object" && "response" in error) {
				const axiosError = error as any;
				if (axiosError.response?.data?.error) {
					errorCode = axiosError.response.data.error.code || "unknown";
					errorMessage =
						axiosError.response.data.error.message || "Unknown error";
				}
			} else if (error instanceof Error) {
				errorMessage = error.message;
			}

			console.error(
				`❌ Error executing directional trade: [${errorCode}] ${errorMessage}`,
			);
			return null;
		}
	}

	/**
	 * Place a single order on Kalshi
	 */
	private async placeOrder(
		config: OrderConfig,
	): Promise<{ success: boolean; orderId?: string }> {
		type OrderParams = {
			ticker: string;
			side: "yes" | "no";
			action: "buy" | "sell";
			count: number;
			type: "market" | "limit";
			yesPriceDollars?: string;
			noPriceDollars?: string;
			buyMaxCost?: number;
		};

		// Build order parameters (defined outside try block for error logging)
		const orderParams: OrderParams = {
			ticker: config.ticker,
			side: config.side,
			action: config.action,
			count: Math.floor(config.quantity), // Ensure whole number (no fractional contracts)
			type: config.type,
		};

		try {
			const priceDisplay = config.type === "market" ? "market" : `${config.price}¢`;
			console.log(
				`     Placing ${config.action} order: ${config.quantity} ${config.side.toUpperCase()} @ ${priceDisplay} for ${config.ticker}`,
			);

			// Market orders only - Kalshi requires price_dollars parameter even for market orders
			if (config.type !== "market") {
				console.error(`     ✗ Only market orders are supported, received type: ${config.type}`);
				return { success: false };
			}
			
			// For market orders, Kalshi requires exactly one of: yes_price, no_price, yes_price_dollars, or no_price_dollars
			// We use price_dollars format: fixed-point decimal string with exactly 4 decimal places
			if (config.price > 0 && config.price < 1.0) {
				const priceDollars = config.price.toFixed(4); // Format to exactly 4 decimal places
				if (config.side === "yes") {
					orderParams.yesPriceDollars = priceDollars;
				} else {
					orderParams.noPriceDollars = priceDollars;
				}
			}
			
			// For market buy orders, also calculate buyMaxCost: maximum total cost in cents for all contracts
			if (config.action === "buy") {
				if (config.price <= 0 || config.price >= 1.0) {
					console.error(`     ✗ Invalid price for market buy order: $${config.price} (must be between $0.01 and $0.99)`);
					return { success: false };
				}
				if (config.quantity <= 0) {
					console.error(`     ✗ Invalid quantity: ${config.quantity} (must be > 0)`);
					return { success: false };
				}
				// Price is per contract in dollars, convert to cents and multiply by quantity
				const pricePerContractCents = Math.round(config.price * 100);
				const totalCostCents = pricePerContractCents * config.quantity;
				// Add 5% buffer for slippage and fees
				const maxCostCents = Math.ceil(totalCostCents * 1.05);
				
				// Validate buyMaxCost is reasonable (should be at least quantity cents, at most 10000 cents per contract)
				if (maxCostCents < config.quantity || maxCostCents > 10000 * config.quantity) {
					console.error(`     ✗ Invalid buyMaxCost: ${maxCostCents}¢ (calculated from price $${config.price}, quantity ${config.quantity})`);
					return { success: false };
				}
				
				orderParams.buyMaxCost = maxCostCents;
				console.log(`     Market buy: ${config.quantity} contract(s) @ $${config.price.toFixed(2)} each`);
				console.log(`     buyMaxCost: ${maxCostCents}¢ (max total cost for ${config.quantity} contract(s))`);
			}
			// For sell orders, market orders don't require buyMaxCost

			// Log exact parameters being sent for debugging
			console.log(`     Order parameters:`, JSON.stringify(orderParams, null, 2));

			const response = await kalshiService.createOrder(orderParams);

			if (response?.order_id) {
				console.log(
					`     ✓ Order placed successfully (ID: ${response.order_id}) for ${config.ticker}`,
				);
				console.log(`     Status: ${response.status}`);

				// Track order ID for this ticker
				const existingOrders = this.orderIds.get(config.ticker) || [];
				existingOrders.push(response.order_id);
				this.orderIds.set(config.ticker, existingOrders);

				return { success: true, orderId: response.order_id };
			}

			console.log(`     ✗ Order failed: No response from API (${config.ticker})`);
			return { success: false };
		} catch (error: unknown) {
			// Extract error details from Kalshi API response
			let errorCode = "unknown";
			let errorMessage = "Unknown error";
			let fullError: unknown = null;

			interface AxiosErrorResponse {
				response?: {
					data?: {
						error?: {
							code?: string;
							message?: string;
						};
					};
				};
			}

			if (error && typeof error === "object" && "response" in error) {
				const axiosError = error as AxiosErrorResponse;
				fullError = axiosError.response?.data;
				if (axiosError.response?.data?.error) {
					errorCode = axiosError.response.data.error.code || "unknown";
					errorMessage =
						axiosError.response.data.error.message || "Unknown error";
				}
			} else if (error instanceof Error) {
				errorMessage = error.message;
			}

			console.error(`     ✗ Order failed for ${config.ticker}: [${errorCode}] ${errorMessage}`);
			if (fullError) {
				console.error(`     Full error response:`, JSON.stringify(fullError, null, 2));
			}
			console.error(`     Order parameters that failed:`, JSON.stringify(orderParams, null, 2));
			return { success: false };
		}
	}

	/**
	 * Check if we should close a position early
	 */
	shouldCloseEarly(
		ticker: string,
		currentYesPrice: number,
		currentNoPrice: number,
		priceHistory?: number[],
	): {
		shouldClose: boolean;
		shouldCloseYes?: boolean;
		shouldCloseNo?: boolean;
		reason: string;
		profit?: number;
	} {
		const arbPosition = this.arbitragePositions.get(ticker);
		if (!arbPosition) {
			return { shouldClose: false, reason: "No position found" };
		}

		// 🛑 STOP LOSS: Only for technical strategy (single-side positions)
		// Skip stop loss for arbitrage (both sides held)
		const isTechnicalPosition = (arbPosition.yesSide && !arbPosition.noSide) || (arbPosition.noSide && !arbPosition.yesSide);

		if (isTechnicalPosition && priceHistory && priceHistory.length > 0) {
			const currentPrice = priceHistory[priceHistory.length - 1];

			// Check YES side stop loss (technical long position)
			if (arbPosition.yesSide?.strikePrice && !arbPosition.noSide) {
				const strikePrice = arbPosition.yesSide.strikePrice;
				const STOP_LOSS_THRESHOLD = 0.0005; // 0.05% tolerance

				// If we bought YES (betting price goes up), stop loss if price comes back to strike
				if (currentPrice <= strikePrice * (1 + STOP_LOSS_THRESHOLD)) {
					return {
						shouldClose: true,
						shouldCloseYes: true,
						shouldCloseNo: false,
						reason: `STOP LOSS (Technical): Price $${currentPrice.toFixed(2)} returned to strike $${strikePrice.toFixed(2)} - Closing YES position`,
						profit: 0,
					};
				}
			}

			// Check NO side stop loss (technical short position)
			if (arbPosition.noSide?.strikePrice && !arbPosition.yesSide) {
				const strikePrice = arbPosition.noSide.strikePrice;
				const STOP_LOSS_THRESHOLD = 0.0005; // 0.05% tolerance

				// If we bought NO (betting price goes down), stop loss if price comes back to strike
				if (currentPrice >= strikePrice * (1 - STOP_LOSS_THRESHOLD)) {
					return {
						shouldClose: true,
						shouldCloseYes: false,
						shouldCloseNo: true,
						reason: `STOP LOSS (Technical): Price $${currentPrice.toFixed(2)} returned to strike $${strikePrice.toFixed(2)} - Closing NO position`,
						profit: 0,
					};
				}
			}
		}

		// Calculate price move percentage if price history available
		let priceMovePercent: number | null = null;
		if (priceHistory && priceHistory.length > 0) {
			const currentPrice = priceHistory[priceHistory.length - 1];
			const entryPrice = priceHistory[0]; // Approximate entry
			const priceMove = Math.abs(currentPrice - entryPrice);
			priceMovePercent = (priceMove / entryPrice) * 100; // Convert to percentage
		}

		// Get standard deviation thresholds from config (in percentage)
		const stdev1Threshold = CONFIG.trading.stdevLevels.stdev1;
		const stdev2Threshold = CONFIG.trading.stdevLevels.stdev2;
		const stdev3Threshold = CONFIG.trading.stdevLevels.stdev3;
		const stdev4Threshold = CONFIG.trading.stdevLevels.stdev4;

		// 🎯 Check if YES side profit exceeds target → Close BOTH sides
		if (arbPosition.yesSide) {
			const yesQuantity = arbPosition.yesSide.quantity;
			const yesEntryPrice = arbPosition.yesSide.entryPrice;
			const yesEntryCost = yesEntryPrice + arbPosition.yesSide.fees;

			// Current value if we sell YES at current price
			const yesSellValue =
				(currentYesPrice - currentYesPrice * this.KALSHI_FEE_RATE) *
				yesQuantity;
			const yesProfit = yesSellValue - yesEntryCost * yesQuantity;

			// Standard deviation exit: Check against configured thresholds
			if (priceMovePercent !== null && yesProfit > 0) {
				let stdevLevel = "";
				let shouldExit = false;

				// Check which standard deviation level was reached
				if (priceMovePercent >= stdev4Threshold) {
					stdevLevel = "4σ";
					shouldExit = true;
				} else if (priceMovePercent >= stdev3Threshold) {
					stdevLevel = "3σ";
					shouldExit = true;
				} else if (priceMovePercent >= stdev2Threshold) {
					stdevLevel = "2σ";
					shouldExit = true;
				} else if (priceMovePercent >= stdev1Threshold) {
					stdevLevel = "1σ";
					shouldExit = true;
				}

				if (shouldExit) {
					return {
						shouldClose: true,
						shouldCloseYes: true,
						shouldCloseNo: true,
						reason: `YES side: ${stdevLevel} move (${priceMovePercent.toFixed(3)}%) + profit $${yesProfit.toFixed(2)} - Taking profit`,
						profit: yesProfit,
					};
				}
			}

			if (yesProfit >= this.PROFIT_TARGET_USD) {
				return {
					shouldClose: true,
					shouldCloseYes: true,
					shouldCloseNo: true, // 🔥 Close BOTH sides
					reason: `YES side profit reached $${yesProfit.toFixed(2)} (≥$${this.PROFIT_TARGET_USD} target) - Closing BOTH sides`,
					profit: yesProfit,
				};
			}
		}

		// 🎯 Check if NO side profit exceeds target → Close BOTH sides
		if (arbPosition.noSide) {
			const noQuantity = arbPosition.noSide.quantity;
			const noEntryPrice = arbPosition.noSide.entryPrice;
			const noEntryCost = noEntryPrice + arbPosition.noSide.fees;

			// Current value if we sell NO at current price
			const noSellValue =
				(currentNoPrice - currentNoPrice * this.KALSHI_FEE_RATE) * noQuantity;
			const noProfit = noSellValue - noEntryCost * noQuantity;

			// Standard deviation exit: Check against configured thresholds
			if (priceMovePercent !== null && noProfit > 0) {
				let stdevLevel = "";
				let shouldExit = false;

				// Check which standard deviation level was reached
				if (priceMovePercent >= stdev4Threshold) {
					stdevLevel = "4σ";
					shouldExit = true;
				} else if (priceMovePercent >= stdev3Threshold) {
					stdevLevel = "3σ";
					shouldExit = true;
				} else if (priceMovePercent >= stdev2Threshold) {
					stdevLevel = "2σ";
					shouldExit = true;
				} else if (priceMovePercent >= stdev1Threshold) {
					stdevLevel = "1σ";
					shouldExit = true;
				}

				if (shouldExit) {
					return {
						shouldClose: true,
						shouldCloseYes: true,
						shouldCloseNo: true,
						reason: `NO side: ${stdevLevel} move (${priceMovePercent.toFixed(3)}%) + profit $${noProfit.toFixed(2)} - Taking profit`,
						profit: noProfit,
					};
				}
			}

			if (noProfit >= this.PROFIT_TARGET_USD) {
				return {
					shouldClose: true,
					shouldCloseYes: true, // 🔥 Close BOTH sides
					shouldCloseNo: true,
					reason: `NO side profit reached $${noProfit.toFixed(2)} (≥$${this.PROFIT_TARGET_USD} target) - Closing BOTH sides`,
					profit: noProfit,
				};
			}
		}

		// Check if prices have normalized (YES + NO ≈ $1.00)
		const currentTotal = currentYesPrice + currentNoPrice;
		const isNormalized = Math.abs(1.0 - currentTotal) < 0.02; // Within 2¢ of $1.00

		if (isNormalized && arbPosition.yesSide && arbPosition.noSide) {
			// Both sides held - can close both for small profit
			const yesSellValue =
				currentYesPrice - currentYesPrice * this.KALSHI_FEE_RATE;
			const noSellValue =
				currentNoPrice - currentNoPrice * this.KALSHI_FEE_RATE;
			const totalSellValue = yesSellValue + noSellValue;
			const profit = totalSellValue - arbPosition.totalCost;

			if (profit > 0) {
				return {
					shouldClose: true,
					shouldCloseYes: true,
					shouldCloseNo: true,
					reason: "Prices normalized - can lock in profit early",
					profit,
				};
			}
		}

		// Check for stop loss (single side only)
		if (arbPosition.yesSide && !arbPosition.noSide) {
			const currentValue = currentYesPrice;
			const entryValue = arbPosition.yesSide.entryPrice;
			const loss = entryValue - currentValue;
			const lossPercent = (loss / entryValue) * 100;

			if (lossPercent > 15) {
				// 15% stop loss
				return {
					shouldClose: true,
					shouldCloseYes: true,
					shouldCloseNo: false,
					reason: `Stop loss triggered (${lossPercent.toFixed(1)}% loss)`,
					profit: -loss,
				};
			}
		}

		if (arbPosition.noSide && !arbPosition.yesSide) {
			const currentValue = currentNoPrice;
			const entryValue = arbPosition.noSide.entryPrice;
			const loss = entryValue - currentValue;
			const lossPercent = (loss / entryValue) * 100;

			if (lossPercent > 15) {
				return {
					shouldClose: true,
					shouldCloseYes: false,
					shouldCloseNo: true,
					reason: `Stop loss triggered (${lossPercent.toFixed(1)}% loss)`,
					profit: -loss,
				};
			}
		}

		return { shouldClose: false, reason: "Hold until expiry" };
	}

	/**
	 * Close a position (sell contracts)
	 * Can close both sides or individual sides
	 */
	async closePosition(
		ticker: string,
		reason: string,
		options?: {
			closeYes?: boolean;
			closeNo?: boolean;
		},
	): Promise<boolean> {
		const arbPosition = this.arbitragePositions.get(ticker);
		if (!arbPosition) {
			console.log(`No position found for ${ticker}`);
			return false;
		}

		const closeYes = options?.closeYes ?? true; // Default: close both
		const closeNo = options?.closeNo ?? true;

		console.log(`\n🔒 Closing position for ${ticker}`);
		console.log(`Reason: ${reason}`);
		console.log(
			`Sides to close: ${closeYes ? "YES" : ""}${closeYes && closeNo ? " + " : ""}${closeNo ? "NO" : ""}`,
		);

		try {
			let yesClosed = false;
			let noClosed = false;

			// Close YES side if requested and exists
			if (closeYes && arbPosition.yesSide) {
				const yesResult = await this.placeOrder({
					ticker,
					side: "yes",
					action: "sell",
					quantity: arbPosition.yesSide.quantity,
					price: 0, // Market order
					type: "market",
				});
				yesClosed = yesResult.success;

				if (yesClosed) {
					console.log(`   ✓ YES side closed`);
					// Log the close order
					orderLogger.logOrder({
						timestamp: Date.now(),
						ticker,
						side: "yes",
						action: "sell",
						quantity: arbPosition.yesSide.quantity,
						price: 0,
						orderId: yesResult.orderId,
						status: "success",
						strategy: arbPosition.yesSide.strategy,
					});
					// Remove YES side from position
					arbPosition.yesSide = undefined;
				}
			}

			// Close NO side if requested and exists
			if (closeNo && arbPosition.noSide) {
				const noResult = await this.placeOrder({
					ticker,
					side: "no",
					action: "sell",
					quantity: arbPosition.noSide.quantity,
					price: 0, // Market order
					type: "market",
				});
				noClosed = noResult.success;

				if (noClosed) {
					console.log(`   ✓ NO side closed`);
					// Log the close order
					orderLogger.logOrder({
						timestamp: Date.now(),
						ticker,
						side: "no",
						action: "sell",
						quantity: arbPosition.noSide.quantity,
						price: 0,
						orderId: noResult.orderId,
						status: "success",
						strategy: arbPosition.noSide.strategy,
					});
					// Remove NO side from position
					arbPosition.noSide = undefined;
				}
			}

			// Update position status
			if (!arbPosition.yesSide && !arbPosition.noSide) {
				arbPosition.status = "closed";
				console.log(`✅ Position fully closed`);
			} else if (arbPosition.yesSide || arbPosition.noSide) {
				arbPosition.status = "partial";
				console.log(`⚠️  Position partially closed`);
			}

			return yesClosed || noClosed;
		} catch (error: unknown) {
			// Extract only error code and reason
			let errorCode = "unknown";
			let errorMessage = "Unknown error";

			if (error && typeof error === "object" && "response" in error) {
				const axiosError = error as any;
				if (axiosError.response?.data?.error) {
					errorCode = axiosError.response.data.error.code || "unknown";
					errorMessage =
						axiosError.response.data.error.message || "Unknown error";
				}
			} else if (error instanceof Error) {
				errorMessage = error.message;
			}

			console.error(
				`❌ Error closing position: [${errorCode}] ${errorMessage}`,
			);
			return false;
		}
	}

	/**
	 * Get all open positions
	 */
	getOpenPositions(): ArbitragePosition[] {
		return Array.from(this.arbitragePositions.values()).filter(
			(p) => p.status === "open" || p.status === "partial",
		);
	}

	/**
	 * Calculate P&L for a position at expiry
	 */
	calculatePnL(ticker: string, winner: "yes" | "no"): number {
		const arbPosition = this.arbitragePositions.get(ticker);
		if (!arbPosition) return 0;

		let payout = 0;

		// Calculate payout based on winner
		if (winner === "yes" && arbPosition.yesSide) {
			payout = 1.0 * arbPosition.yesSide.quantity; // $1 per contract
		}
		if (winner === "no" && arbPosition.noSide) {
			payout = 1.0 * arbPosition.noSide.quantity;
		}

		const profit = payout - arbPosition.totalCost;
		return profit;
	}

	/**
	 * Get order IDs for a ticker
	 */
	getOrderIds(ticker: string): string[] {
		return this.orderIds.get(ticker) || [];
	}

	/**
	 * Get all order IDs
	 */
	getAllOrderIds(): Map<string, string[]> {
		return this.orderIds;
	}

	/**
	 * Monitor open positions and auto-close if profit target reached
	 */
	async monitorPositions(
		currentYesPrice: number,
		currentNoPrice: number,
		priceHistory?: number[], // For standard deviation calculation
		currentTicker?: string, // Only apply price history to matching ticker
	): Promise<void> {
		const openPositions = this.getOpenPositions();

		for (const position of openPositions) {
			// Only use price history if it matches the current ticker
			const relevantPriceHistory = (currentTicker && position.ticker === currentTicker) ? priceHistory : undefined;

			const closeDecision = this.shouldCloseEarly(
				position.ticker,
				currentYesPrice,
				currentNoPrice,
				relevantPriceHistory,
			);

			if (closeDecision.shouldClose) {
				console.log(`\n💰 AUTO-CLOSE TRIGGERED: ${position.ticker}`);
				console.log(`   Reason: ${closeDecision.reason}`);
				console.log(`   Profit: $${closeDecision.profit?.toFixed(2) || "N/A"}`);

				await this.closePosition(position.ticker, closeDecision.reason, {
					closeYes: closeDecision.shouldCloseYes,
					closeNo: closeDecision.shouldCloseNo,
				});
			}
		}
	}

	/**
	 * Clear a specific position from tracking (useful when market has expired)
	 */
	clearPosition(ticker: string): boolean {
		const deleted = this.arbitragePositions.delete(ticker);
		if (deleted) {
			console.log(`✓ Cleared position tracking for ${ticker}`);
		}
		return deleted;
	}

	/**
	 * Clear failed order tracking for a specific ticker
	 * Use when market expires or changes to prevent stale retry attempts
	 */
	clearFailedOrderTracking(ticker: string): void {
		for (const [candle, failedOrders] of this.failedOrdersByCandle) {
			if (failedOrders.has(ticker)) {
				failedOrders.delete(ticker);
			}
		}
	}

	/**
	 * Clear failed order tracking for all tickers except the current market
	 * Prevents retry spam on old/expired markets
	 */
	clearStaleFailedOrders(currentMarketTicker: string): void {
		const currentCandle = this.roundToCandle(Date.now());
		const failedOrders = this.failedOrdersByCandle.get(currentCandle);

		if (failedOrders) {
			const tickersToRemove: string[] = [];
			for (const [ticker] of failedOrders) {
				// Keep only the current market ticker
				if (ticker !== currentMarketTicker) {
					tickersToRemove.push(ticker);
				}
			}

			for (const ticker of tickersToRemove) {
				failedOrders.delete(ticker);
			}

			if (tickersToRemove.length > 0) {
				console.log(`   🧹 Cleared failed order tracking for ${tickersToRemove.length} old ticker(s)`);
			}
		}
	}

	/**
	 * Clear all positions from tracking
	 */
	clearAllPositions(): void {
		const count = this.arbitragePositions.size;
		this.arbitragePositions.clear();
		console.log(`✓ Cleared ${count} position(s) from tracking`);
	}

	/**
	 * Display all current positions
	 */
	displayPositions(): void {
		const positions = Array.from(this.arbitragePositions.entries());

		if (positions.length === 0) {
			console.log("\n📊 No active positions");
			return;
		}

		console.log("\n📊 Active Positions:");
		console.log("─".repeat(80));

		for (const [ticker, position] of positions) {
			const strategy = position.yesSide?.strategy || position.noSide?.strategy || "Unknown";
			const sides = [];
			if (position.yesSide) sides.push("YES");
			if (position.noSide) sides.push("NO");

			console.log(`\nTicker: ${ticker}`);
			console.log(`  Strategy: ${strategy}`);
			console.log(`  Status: ${position.status}`);
			console.log(`  Sides: ${sides.join(" + ")}`);
			console.log(`  Total Cost: $${position.totalCost.toFixed(4)}`);
			console.log(`  Expected Profit: $${position.expectedProfit.toFixed(4)}`);

			const age = Date.now() - position.entryTime;
			const ageMinutes = Math.floor(age / 60000);
			const ageSeconds = Math.floor(age / 1000);
			console.log(`  Age: ${ageMinutes} minutes (${ageSeconds} seconds)`);
			console.log(`  Entry Time: ${new Date(position.entryTime).toLocaleString()}`);
		}

		console.log("─".repeat(80));
	}

	/**
	 * Get count of all positions (for debugging)
	 */
	getPositionCount(): number {
		return this.arbitragePositions.size;
	}

	/**
	 * Auto-clear stale positions
	 * Removes positions that are:
	 * 1. Older than AUTO_CLEAR_MINUTES
	 * 2. Have status "closed"
	 * 3. ALL positions when a new candle starts (15m or 1h)
	 * 
	 * Call this periodically from the strategy runner
	 */
	autoCleanupPositions(): void {
		const now = Date.now();
		const currentCandle = this.roundToCandle(now);

		// Check if we're in a new candle
		if (this.lastCandleTimestamp !== 0 && currentCandle !== this.lastCandleTimestamp) {
			const candleType = this.candleIntervalMs === 60 * 60 * 1000 ? "1H" : "15M";
			const candleTime = new Date(currentCandle).toLocaleTimeString();
			const positionCount = this.arbitragePositions.size;

			if (positionCount > 0) {
				console.log(`\n🕯️  NEW ${candleType} CANDLE STARTED at ${candleTime}`);
				console.log(`   Clearing all ${positionCount} position(s) for fresh start`);

				// Clear all positions
				this.arbitragePositions.clear();
				console.log(`   ✓ All positions cleared`);
			}
		}

		// Update last candle timestamp
		this.lastCandleTimestamp = currentCandle;

		// Continue with normal cleanup (for mid-candle cleanup)
		const maxAgeMs = this.AUTO_CLEAR_MINUTES * 60 * 1000;
		const positions = Array.from(this.arbitragePositions.entries());

		let clearedStale = 0;
		let clearedClosed = 0;

		for (const [ticker, position] of positions) {
			const age = now - position.entryTime;
			const ageMinutes = Math.floor(age / (60 * 1000));

			// Clear if older than max age
			if (age > maxAgeMs) {
				this.arbitragePositions.delete(ticker);
				clearedStale++;
				console.log(
					`🧹 Auto-cleared stale position: ${ticker} (age: ${ageMinutes} minutes)`,
				);
				continue;
			}

			// Clear if status is "closed"
			if (position.status === "closed") {
				this.arbitragePositions.delete(ticker);
				clearedClosed++;
				console.log(
					`🧹 Auto-cleared closed position: ${ticker}`,
				);
			}
		}

		if (clearedStale > 0 || clearedClosed > 0) {
			console.log(
				`✓ Auto-cleanup complete: ${clearedStale} stale, ${clearedClosed} closed positions removed`,
			);
		}
	}
}

// Export singleton instance
export const orderExecutor = new OrderExecutor();
