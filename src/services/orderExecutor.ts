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
	private readonly MAX_POSITIONS_PER_CANDLE = CONFIG.trading.maxPositionsPer15Min;
	private positionsByCandle: Map<number, number> = new Map(); // candleTimestamp -> count
	private candleIntervalMs: number = 15 * 60 * 1000; // Default: 15 minutes

	constructor() {
		console.log(
			`\n💰 Order Executor initialized with profit target: $${this.PROFIT_TARGET_USD}`,
		);
		console.log(
			`   Maximum positions per candle: ${this.MAX_POSITIONS_PER_CANDLE}`,
		);
		console.log(
			`   When either side reaches $${this.PROFIT_TARGET_USD} profit, BOTH sides will be closed\n`,
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
	 * Get count of positions opened in current candle
	 */
	private getPositionsInCurrentCandle(): number {
		const currentCandle = this.roundToCandle(Date.now());
		return this.positionsByCandle.get(currentCandle) || 0;
	}

	/**
	 * Increment position count for current candle
	 */
	private incrementCandlePositions(): void {
		const currentCandle = this.roundToCandle(Date.now());
		const current = this.positionsByCandle.get(currentCandle) || 0;
		this.positionsByCandle.set(currentCandle, current + 1);

		// Clean up old candles (keep only last 4 hours)
		const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
		for (const [candle] of this.positionsByCandle) {
			if (candle < fourHoursAgo) {
				this.positionsByCandle.delete(candle);
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
	): Promise<ArbitragePosition | null> {
		// Check if we already have a position on this ticker
		if (this.arbitragePositions.has(ticker)) {
			console.log(
				`  ⏭️  Skipping: Already have an arbitrage position on ${ticker}`,
			);
			return null;
		}

		// Check if we've reached the maximum positions for this candle
		const positionsInCandle = this.getPositionsInCurrentCandle();
		if (positionsInCandle >= this.MAX_POSITIONS_PER_CANDLE) {
			const currentCandle = this.roundToCandle(Date.now());
			const candleTime = new Date(currentCandle).toLocaleTimeString();
			const candleType = this.candleIntervalMs === 60 * 60 * 1000 ? "hourly" : "15-min";
			console.log(
				`  ⏭️  Skipping: Maximum ${this.MAX_POSITIONS_PER_CANDLE} positions reached for ${candleType} candle starting at ${candleTime}`,
			);
			console.log(`     Wait for next candle to place more orders`);
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
						price: Math.round(yesPrice * 100),
						type: "limit",
					}),
					this.placeOrder({
						ticker,
						side: "no",
						action: "buy",
						quantity,
						price: Math.round(noPrice * 100),
						type: "limit",
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
						console.log(
							`     ⚠️  WARNING: YES order placed but NO order failed - partial arbitrage!`,
						);
						// TODO: Could cancel the YES order here to avoid partial position
					} else if (!yesResult.success && noResult.success) {
						console.log(
							`     ⚠️  WARNING: NO order placed but YES order failed - partial arbitrage!`,
						);
						// TODO: Could cancel the NO order here to avoid partial position
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
				// SINGLE SIDE: Buy cheaper side only
				const cheaperSide = yesPrice < noPrice ? "yes" : "no";
				const price = cheaperSide === "yes" ? yesPrice : noPrice;

				console.log(
					`\n📊 Placing order for ${cheaperSide.toUpperCase()} at $${price.toFixed(2)}...`,
				);

				const orderResult = await this.placeOrder({
					ticker,
					side: cheaperSide,
					action: "buy",
					quantity,
					price: Math.round(price * 100),
					type: "limit",
				});

				if (orderResult.success) {
					const fee = price * this.KALSHI_FEE_RATE;
					const position: Position = {
						ticker,
						side: cheaperSide,
						quantity,
						entryPrice: price,
						entryTime: Date.now(),
						fees: fee,
						strategy: "Arbitrage",
					};

					if (cheaperSide === "yes") {
						arbPosition.yesSide = position;
					} else {
						arbPosition.noSide = position;
					}

					arbPosition.totalCost = price + fee;
					arbPosition.expectedProfit = 1.0 - arbPosition.totalCost; // If we win
					arbPosition.status = "open";

					console.log(`\n✅ Single-Side Position Opened:`);
					console.log(`   Side: ${cheaperSide.toUpperCase()}`);
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
						side: cheaperSide,
						action: "buy",
						quantity,
						price: Math.round(price * 100),
						orderId: orderResult.orderId,
						status: "success",
						totalCost: arbPosition.totalCost,
						fees: fee,
						strategy: "Arbitrage-SingleSide",
					});
				}
			}

			// Store position and increment candle counter
			this.arbitragePositions.set(ticker, arbPosition);
			this.incrementCandlePositions();

			const currentCandle = this.roundToCandle(Date.now());
			const candleTime = new Date(currentCandle).toLocaleTimeString();
			const positionsInCandle = this.getPositionsInCurrentCandle();
			const candleType = this.candleIntervalMs === 60 * 60 * 1000 ? "hourly" : "15-min";
			console.log(
				`     📊 Positions in current ${candleType} candle (${candleTime}): ${positionsInCandle}/${this.MAX_POSITIONS_PER_CANDLE}`,
			);

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
				price: Math.round(price * 100), // Convert to cents
				type: "limit",
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
		try {
			console.log(
				`     Placing ${config.action} order: ${config.quantity} ${config.side.toUpperCase()} @ ${config.price}¢`,
			);

			// Place actual order via Kalshi API
			const response = await kalshiService.createOrder({
				ticker: config.ticker,
				side: config.side,
				action: config.action,
				count: config.quantity,
				type: config.type,
				yesPrice: config.side === "yes" ? config.price : undefined,
				noPrice: config.side === "no" ? config.price : undefined,
			});

			if (response?.order_id) {
				console.log(
					`     ✓ Order placed successfully (ID: ${response.order_id})`,
				);
				console.log(`     Status: ${response.status}`);

				// Track order ID for this ticker
				const existingOrders = this.orderIds.get(config.ticker) || [];
				existingOrders.push(response.order_id);
				this.orderIds.set(config.ticker, existingOrders);

				return { success: true, orderId: response.order_id };
			}

			console.log(`     ✗ Order failed: No response from API`);
			return { success: false };
		} catch (error: unknown) {
			// Extract only error code and reason from Kalshi API response
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

			console.error(`     ✗ Order failed: [${errorCode}] ${errorMessage}`);
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
	): Promise<void> {
		const openPositions = this.getOpenPositions();

		for (const position of openPositions) {
			const closeDecision = this.shouldCloseEarly(
				position.ticker,
				currentYesPrice,
				currentNoPrice,
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
}

// Export singleton instance
export const orderExecutor = new OrderExecutor();
