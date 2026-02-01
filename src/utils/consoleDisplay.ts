interface StrategySignal {
	name: string;
	signal: "BUY_YES" | "BUY_NO" | "NEUTRAL";
	confidence: number;
	reason: string;
}

interface MarketSnapshot {
	ticker: string;
	btcPrice: number;
	timeLeftMin: number;
	marketClose: string;
	strikePrice?: number; // Kalshi strike price (e.g., $106.30 for ETH)
}

interface TechnicalIndicators {
	// Core indicators (6 reliable ones only)
	rsi?: number;
	macd?: {
		macd: number;
		signal: number;
		hist: number;
		histDelta: number | null;
	};
	vwap?: number;
	delta?: {
		delta1: number;
		delta3: number;
		deltaPercent1: number;
		deltaPercent3: number;
	};
	adx?: {
		adx: number;
		pdi: number;
		mdi: number;
	};
	binancePrice?: number;
}

interface OrderbookData {
	yesPrice: number | null;
	noPrice: number | null;
	spread: number;
	yesLiquidity: number;
	noLiquidity: number;
	imbalance: number;
	imbalanceSide: "YES" | "NO" | "BALANCED";
	execQuality: string;
	depthL1Yes: number;
	depthL1No: number;
	yesWeightedPrice?: number;
	noWeightedPrice?: number;
	spreadPct?: number;
	priceToBeatYes?: number;
	priceToBeatNo?: number;
}

interface FinalDecision {
	action: "BUY_YES" | "BUY_NO" | "NO_TRADE";
	reason: string;
	confidence?: number;
}

interface DisplayData {
	market: MarketSnapshot;
	orderbook: OrderbookData;
	strategies: StrategySignal[];
	decision: FinalDecision;
	technicals?: TechnicalIndicators;
	strategyMode?: "arbitrage" | "technical";
}

const COLORS = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	bgRed: "\x1b[41m",
	bgGreen: "\x1b[42m",
	bgYellow: "\x1b[43m",
};

function formatNumber(num: number, decimals: number = 2): string {
	return num.toLocaleString("en-US", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}

function formatPercent(num: number, decimals: number = 2): string {
	return `${formatNumber(num, decimals)}%`;
}

function formatPrice(num: number): string {
	return `$${formatNumber(num, 2)}`;
}

function colorize(text: string, color: string): string {
	return `${color}${text}${COLORS.reset}`;
}

function pad(
	text: string,
	width: number,
	align: "left" | "right" = "left",
): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes
	const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
	const padding = Math.max(0, width - stripped.length);
	if (align === "right") {
		return " ".repeat(padding) + text;
	}
	return text + " ".repeat(padding);
}

function center(text: string, width: number): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes
	const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
	const padding = Math.max(0, width - stripped.length);
	const leftPad = Math.floor(padding / 2);
	const rightPad = padding - leftPad;
	return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

function separator(char: string = "─", width: number = 175): string {
	return char.repeat(width);
}

function header(title: string, width: number = 175): string {
	return center(colorize(title, COLORS.bright + COLORS.cyan), width);
}

function row(label: string, value: string, labelWidth: number = 16): string {
	return `${pad(label, labelWidth)}${value}`;
}

export function displayStrategyAnalysis(data: DisplayData): void {
	const WIDTH = 120;
	const now = new Date();
	const timeStr = now.toLocaleTimeString("en-US");

	// Extract asset name from ticker (e.g., KXBTC15M-26JAN311500-00 -> BTC)
	const assetMatch = data.market.ticker.match(/^KX([A-Z]+)/);
	const assetName = assetMatch ? assetMatch[1] : "ASSET";

	console.clear();
	console.log(colorize(separator("═", WIDTH), COLORS.cyan));
	console.log(header(`${assetName} - ${data.market.ticker} - ${timeStr}`, WIDTH));
	console.log(colorize(separator("═", WIDTH), COLORS.cyan));
	console.log();

	// Market Overview
	console.log(""); // Blank line 1
	console.log(""); // Blank line 2
	console.log(colorize("MARKET OVERVIEW", COLORS.bright + COLORS.white));
	console.log(colorize(separator("─", WIDTH), COLORS.dim));
	
	const labelWidth = 18;
	
	console.log(
		row(
			`${assetName} Price`,
			colorize(formatPrice(data.market.btcPrice), COLORS.bright + COLORS.white),
			labelWidth,
		),
	);
	console.log(
		row(
			"Time Left",
			colorize(
				`${formatNumber(data.market.timeLeftMin, 1)} min`,
				data.market.timeLeftMin < 2
					? COLORS.red
					: data.market.timeLeftMin < 5
						? COLORS.yellow
						: COLORS.green,
			),
			labelWidth,
		),
	);
	console.log(row("Closes At", data.market.marketClose, labelWidth));

	// Show YES and NO ask prices on one row
	const yesAskCents = data.orderbook.yesPrice
		? Math.round(data.orderbook.yesPrice * 100)
		: null;
	const noAskCents = data.orderbook.noPrice
		? Math.round(data.orderbook.noPrice * 100)
		: null;

	const yesAskText =
		yesAskCents !== null
			? colorize(`YES ${yesAskCents}¢`, COLORS.bright + COLORS.green)
			: colorize(`YES N/A`, COLORS.dim);
	const noAskText =
		noAskCents !== null
			? colorize(`NO ${noAskCents}¢`, COLORS.bright + COLORS.red)
			: colorize(`NO N/A`, COLORS.dim);

	if (yesAskCents !== null && noAskCents !== null) {
		const totalCents = yesAskCents + noAskCents;
		const totalColor =
			totalCents < 100
				? COLORS.green
				: totalCents === 100
					? COLORS.yellow
					: COLORS.red;
		const totalText = colorize(`(Total: ${totalCents}¢)`, totalColor);
		console.log(row("Asks", `${yesAskText}  |  ${noAskText}  ${totalText}`, labelWidth));
	} else {
		console.log(
			row(
				"Asks",
				`${yesAskText}  |  ${noAskText}  ${colorize("(No liquidity)", COLORS.dim)}`,
				labelWidth,
			),
		);
	}

	console.log();

	// Technical Indicators Section (if available)
	if (data.technicals) {
		console.log(""); // Blank line 1
		console.log(""); // Blank line 2
		console.log(colorize("TECHNICAL ANALYSIS", COLORS.bright + COLORS.white));
		console.log(colorize(separator("─", WIDTH), COLORS.dim));

		const tech = data.technicals;
		const labelWidth = 18;

		// TA Predict (Polymarket style)
		let taPredict = "";
		let taPredictColor = COLORS.yellow;
		if (tech.macd && tech.rsi !== undefined) {
			const macdBullish = tech.macd.hist > 0;
			const rsiBullish = tech.rsi > 50;
			const bullishCount = (macdBullish ? 1 : 0) + (rsiBullish ? 1 : 0);
			const bearishCount = 2 - bullishCount;

			if (bullishCount > bearishCount) {
				taPredict = `LONG ${Math.round((bullishCount / 2) * 100)}%`;
				taPredictColor = COLORS.green;
			} else if (bearishCount > bullishCount) {
				taPredict = `SHORT ${Math.round((bearishCount / 2) * 100)}%`;
				taPredictColor = COLORS.red;
			} else {
				taPredict = "NEUTRAL 50%";
			}
		}

		// RSI & Direction (TA Predict) - Combined
		if (tech.rsi !== undefined) {
			const rsiColor =
				tech.rsi > 70
					? COLORS.red
					: tech.rsi < 30
						? COLORS.green
						: COLORS.yellow;
			const rsiValue = `${formatNumber(tech.rsi, 1)} ${tech.rsi > 70 ? "⚠" : tech.rsi < 30 ? "⚠" : ""}`;

			console.log(
				row(
					"RSI:",
					colorize(rsiValue, rsiColor) + " " + colorize(`(${taPredict})`, taPredictColor),
					labelWidth,
				),
			);
		}

		// MACD
		if (tech.macd) {
			console.log(
				row(
					"MACD:",
					colorize(
						tech.macd.hist > 0 ? "bullish" : "bearish",
						tech.macd.hist > 0 ? COLORS.green : COLORS.red,
					),
					labelWidth,
				),
			);
		}

		// Delta 1/3 (Price Delta)
		if (tech.delta) {
			const delta1Color = tech.delta.delta1 > 0 ? COLORS.green : COLORS.red;
			const delta3Color = tech.delta.delta3 > 0 ? COLORS.green : COLORS.red;
			const deltaValue = 
				colorize(`$${tech.delta.delta1 > 0 ? "+" : ""}${formatNumber(tech.delta.delta1, 2)}`, delta1Color) +
				", " +
				colorize(`${tech.delta.deltaPercent1 > 0 ? "+" : ""}${formatNumber(tech.delta.deltaPercent1, 2)}%`, delta1Color) +
				colorize(" | ", COLORS.dim) +
				colorize(`$${tech.delta.delta3 > 0 ? "+" : ""}${formatNumber(tech.delta.delta3, 2)}`, delta3Color) +
				", " +
				colorize(`${tech.delta.deltaPercent3 > 0 ? "+" : ""}${formatNumber(tech.delta.deltaPercent3, 2)}%`, delta3Color);
			
			console.log(row("Delta 1/3:", deltaValue, labelWidth));
		}

		// ADX (Trend Strength - HARD REQUIREMENT)
		if (tech.adx) {
			const adxColor = 
				tech.adx.adx >= 40 ? COLORS.green + COLORS.bright :
				tech.adx.adx >= 25 ? COLORS.green : 
				tech.adx.adx >= 22 ? COLORS.yellow : 
				COLORS.red;
			const trendDirection = tech.adx.pdi > tech.adx.mdi ? "bullish" : "bearish";
			const trendColor = tech.adx.pdi > tech.adx.mdi ? COLORS.green : COLORS.red;
			const diDiff = Math.abs(tech.adx.pdi - tech.adx.mdi);
			const clarityText = diDiff >= 5 ? "CLEAR" : diDiff >= 3 ? "OK" : "WEAK";
			const clarityColor = diDiff >= 5 ? COLORS.green : diDiff >= 3 ? COLORS.yellow : COLORS.red;
			
			console.log(
				row(
					"ADX (Filter):",
					colorize(`${formatNumber(tech.adx.adx, 1)} (${trendDirection})`, adxColor) +
					" - " +
					colorize(`${clarityText} Δ${formatNumber(diDiff, 1)}`, clarityColor),
					labelWidth,
				),
			);
			console.log(
				row(
					"+DI / -DI:",
					colorize(`${formatNumber(tech.adx.pdi, 1)} / ${formatNumber(tech.adx.mdi, 1)}`, trendColor),
					labelWidth,
				),
			);
		}

		// VWAP (Institutional Signal)
		if (tech.vwap !== undefined) {
			const vwapDiff = data.market.btcPrice - tech.vwap;
			const vwapDiffPct = (vwapDiff / tech.vwap) * 100;
			const vwapColor = vwapDiff > 0 ? COLORS.green : COLORS.red;
			const vwapPosition = vwapDiff > 0 ? "above" : "below";

			console.log(
				row(
					"VWAP:",
					colorize(
						`${formatPrice(tech.vwap)} (${vwapPosition}, ${vwapDiff > 0 ? "+" : ""}${formatNumber(vwapDiffPct, 2)}%)`,
						vwapColor,
					),
					labelWidth,
				),
			);
		}

		console.log();
	}

	// Orderbook Analysis (only show in arbitrage mode)
	const strategyMode = data.strategyMode || "arbitrage";
	
	if (strategyMode === "arbitrage") {
		console.log(""); // Blank line 1
		console.log(""); // Blank line 2
		console.log(colorize("ORDERBOOK ANALYSIS", COLORS.bright + COLORS.white));
		console.log(colorize(separator("─", WIDTH), COLORS.dim));

		const { orderbook } = data;
		const labelWidth = 18;
		const valueWidth = 20;
		const gap = "        "; // 8 spaces between columns

		// Helper to create two-column row
		const twoCol = (
			label1: string,
			value1: string,
			label2: string,
			value2: string,
		) => {
			return (
				pad(label1, labelWidth) +
				pad(value1, valueWidth) +
				gap +
				pad(label2, labelWidth) +
				value2
			);
		};

		// Best Prices
		console.log(
			twoCol(
				"Best YES",
				colorize(
					orderbook.yesPrice !== null
						? formatPercent(orderbook.yesPrice * 100, 1)
						: "N/A",
					COLORS.green,
				),
				"Best NO",
				colorize(
					orderbook.noPrice !== null
						? formatPercent(orderbook.noPrice * 100, 1)
						: "N/A",
					COLORS.red,
				),
			),
		);

		// Price to Beat (breakeven after fees)
		if (
			orderbook.priceToBeatYes !== undefined &&
			orderbook.priceToBeatNo !== undefined
		) {
			console.log(
				twoCol(
					"Price to Beat YES",
					colorize(
						formatPercent(orderbook.priceToBeatYes * 100, 1),
						COLORS.yellow,
					),
					"Price to Beat NO",
					colorize(
						formatPercent(orderbook.priceToBeatNo * 100, 1),
						COLORS.yellow,
					),
				),
			);
		}

		// Weighted Prices (if available)
		if (
			orderbook.yesWeightedPrice !== undefined &&
			orderbook.noWeightedPrice !== undefined
		) {
			console.log(
				twoCol(
					"VWAP YES",
					colorize(formatPercent(orderbook.yesWeightedPrice, 1), COLORS.dim),
					"VWAP NO",
					colorize(formatPercent(orderbook.noWeightedPrice, 1), COLORS.dim),
				),
			);
		}

		// Spread & Quality
		const spreadDisplay =
			orderbook.spreadPct !== undefined
				? `${formatNumber(orderbook.spread, 2)}¢ (${formatPercent(orderbook.spreadPct * 100, 1)})`
				: `${formatNumber(orderbook.spread, 2)}¢`;

		const qualityColor =
			orderbook.execQuality === "excellent"
				? COLORS.green
				: orderbook.execQuality === "good"
					? COLORS.cyan
					: orderbook.execQuality === "fair"
						? COLORS.yellow
						: COLORS.red;

		console.log(
			twoCol(
				"Spread",
				spreadDisplay,
				"Quality",
				colorize(orderbook.execQuality.toUpperCase(), qualityColor),
			),
		);

		// Liquidity
		console.log(
			twoCol(
				"YES Volume",
				colorize(formatNumber(orderbook.yesLiquidity, 0), COLORS.green),
				"NO Volume",
				colorize(formatNumber(orderbook.noLiquidity, 0), COLORS.red),
			),
		);

		const totalLiquidity = orderbook.yesLiquidity + orderbook.noLiquidity;
		console.log(
			twoCol(
				"Total Volume",
				colorize(formatNumber(totalLiquidity, 0), COLORS.bright),
				"Imbalance",
				colorize(
					`${formatNumber(orderbook.imbalance, 2)}x ${orderbook.imbalanceSide}`,
					orderbook.imbalance > 2.5
						? COLORS.green
						: orderbook.imbalance < 0.4
							? COLORS.red
							: COLORS.yellow,
				),
			),
		);

		// Depth at Level 1
		console.log(
			twoCol(
				"Depth L1 YES",
				colorize(formatNumber(orderbook.depthL1Yes, 0), COLORS.dim),
				"Depth L1 NO",
				colorize(formatNumber(orderbook.depthL1No, 0), COLORS.dim),
			),
		);

		console.log();
	}

	// Technical Strategy Info (only in technical mode)
	if (strategyMode === "technical") {
		console.log(""); // Blank line 1
		console.log(""); // Blank line 2
		console.log(colorize("TRADING CONTEXT", COLORS.bright + COLORS.white));
		console.log(colorize(separator("─", WIDTH), COLORS.dim));

		const { orderbook } = data;
		const labelWidth = 18;

		// Current Binance Price
		console.log(
			row(
				"Binance Price",
				colorize(formatPrice(data.market.btcPrice), COLORS.bright + COLORS.white),
				labelWidth,
			),
		);

		// TA Predict
		if (data.technicals?.rsi !== undefined && data.technicals?.macd) {
			const macdBullish = data.technicals.macd.hist > 0;
			const rsiBullish = data.technicals.rsi > 50;
			const bullishCount = (macdBullish ? 1 : 0) + (rsiBullish ? 1 : 0);
			const bearishCount = 2 - bullishCount;

			let taPredict = "";
			let taPredictColor = COLORS.yellow;
			if (bullishCount > bearishCount) {
				taPredict = `LONG ${Math.round((bullishCount / 2) * 100)}%`;
				taPredictColor = COLORS.green;
			} else if (bearishCount > bullishCount) {
				taPredict = `SHORT ${Math.round((bearishCount / 2) * 100)}%`;
				taPredictColor = COLORS.red;
			} else {
				taPredict = "NEUTRAL 50%";
			}

			console.log(
				row(
					"TA Predict",
					colorize(taPredict, taPredictColor + COLORS.bright),
					labelWidth,
				),
			);
		}

		// Price to Beat (Kalshi strike price - the threshold to cross)
		if (data.market.strikePrice !== undefined) {
			console.log(
				row(
					"Price to Beat",
					colorize(formatPrice(data.market.strikePrice), COLORS.yellow + COLORS.bright),
					labelWidth,
				),
			);
		}

		// Current Kalshi Probabilities
		if (orderbook.yesPrice !== null && orderbook.noPrice !== null) {
			console.log(
				row(
					"Kalshi YES Prob",
					colorize(formatPercent(orderbook.yesPrice * 100, 1), COLORS.green),
					labelWidth,
				),
			);
			console.log(
				row(
					"Kalshi NO Prob",
					colorize(formatPercent(orderbook.noPrice * 100, 1), COLORS.red),
					labelWidth,
				),
			);
		}

		console.log();
	}

	// Strategy Signals
	console.log(""); // Blank line 1
	console.log(""); // Blank line 2
	
	const strategyLabel = strategyMode === "arbitrage" ? "ARBITRAGE SIGNALS" : "TECHNICAL SIGNALS";
	
	console.log(colorize(strategyLabel, COLORS.bright + COLORS.white));
	console.log(colorize(separator("─", WIDTH), COLORS.dim));

	if (data.strategies.length === 0) {
		console.log(colorize("  No active signals", COLORS.dim));
	} else {
		for (const strategy of data.strategies) {
			const signalIcon =
				strategy.signal === "BUY_YES"
					? "↑"
					: strategy.signal === "BUY_NO"
						? "↓"
						: "•";
			const signalColor =
				strategy.signal === "BUY_YES"
					? COLORS.green
					: strategy.signal === "BUY_NO"
						? COLORS.red
						: COLORS.yellow;

			const confidenceBar = "█".repeat(Math.floor(strategy.confidence * 10));

			console.log(
				colorize(`  ${signalIcon} ${strategy.name}`, signalColor) +
					colorize(
						` [${confidenceBar.padEnd(10, "░")}] ${formatPercent(strategy.confidence * 100, 0)}`,
						COLORS.dim,
					),
			);
			console.log(colorize(`    ${strategy.reason}`, COLORS.dim));
		}
	}
	console.log();

	// Final Decision
	console.log(""); // Blank line 1
	console.log(""); // Blank line 2
	
	const modeLabel = strategyMode === "arbitrage" ? "[ARBITRAGE-ONLY MODE]" : "[TECHNICAL ANALYSIS MODE]";
	const modeColor = strategyMode === "arbitrage" ? COLORS.cyan : COLORS.magenta;
	
	console.log(
		colorize("DECISION", COLORS.bright + COLORS.white) +
			colorize(` ${modeLabel}`, modeColor),
	);
	console.log(colorize(separator("─", WIDTH), COLORS.dim));

	const { decision } = data;
	const decisionLabelWidth = 18;
	const actionColor =
		decision.action === "BUY_YES"
			? COLORS.bgGreen + COLORS.bright + COLORS.white
			: decision.action === "BUY_NO"
				? COLORS.bgRed + COLORS.bright + COLORS.white
				: COLORS.yellow;

	const actionIcon =
		decision.action === "BUY_YES"
			? "🎯 "
			: decision.action === "BUY_NO"
				? "🎯 "
				: "⏸️  ";

	console.log(
		row("Action", actionIcon + colorize(` ${decision.action} `, actionColor), decisionLabelWidth),
	);
	console.log(row("Reason", decision.reason, decisionLabelWidth));
	if (decision.confidence !== undefined) {
		console.log(row("Confidence", formatPercent(decision.confidence * 100, 0), decisionLabelWidth));
	}

	console.log();

	// Check if there's an arbitrage signal to execute
	const arbitrageSignal = data.strategies.find((s) => s.name === "Arbitrage");
	const willExecute = arbitrageSignal && arbitrageSignal.confidence >= 0.9;

	// Arbitrage Execution Section (only if executing) - AFTER DECISION
	if (willExecute) {
		console.log(""); // Blank line 1
		console.log(""); // Blank line 2
		console.log(colorize("ARBITRAGE EXECUTION", COLORS.bright + COLORS.green));
		console.log(colorize(separator("─", WIDTH), COLORS.dim));

		console.log(
			colorize(
				"  🚀 EXECUTING RISK-FREE ARBITRAGE TRADE",
				COLORS.green + COLORS.bright,
			),
		);
		console.log(
			colorize(
				"  Strategy: Buy BOTH YES and NO (guaranteed profit)",
				COLORS.dim,
			),
		);
		console.log(colorize("  Position: 1 contract per side", COLORS.dim));
		console.log(colorize("  Exit: Hold until market expiry", COLORS.dim));
		console.log();
		console.log(colorize(`  ${separator("·", WIDTH - 4)}`, COLORS.dim)); // Dotted divider
		console.log();
		console.log(
			colorize(
				"  📊 Order execution details will appear below...",
				COLORS.cyan,
			),
		);
		console.log();
	}

	// End of Analysis
	console.log(""); // Blank line 1
	console.log(""); // Blank line 2
	console.log(colorize("END OF ANALYSIS", COLORS.bright + COLORS.white));
	console.log(colorize(separator("─", WIDTH), COLORS.dim));
	console.log();
	console.log();
}

// ============================================================================
// BOOLEAN CANDLE ANALYSIS DISPLAY
// ============================================================================

interface BooleanDisplayData {
	current: {
		isBull: boolean;
		timestamp: number;
		open: number;
		close: number;
		change: number;
		changePct: number;
	};
	previous: {
		isBull: boolean;
		timestamp: number;
		open: number;
		close: number;
		change: number;
		changePct: number;
	};
	operations: {
		not_current: boolean;
		not_previous: boolean;
		and: boolean;
		or: boolean;
		xor: boolean;
		implication: boolean;
		pattern: string;
		interpretation: string;
	};
	sequence: {
		last3: boolean[];
		last5: boolean[];
		bullStreak: number;
		bearStreak: number;
	};
	patterns: Array<{
		name: string;
		detected: boolean;
		description: string;
	}>;
	prediction: {
		nextCandle: "BULL" | "BEAR";
		confidence: number;
		reasoning: string[];
		signals: {
			momentum: "BULL" | "BEAR" | "NEUTRAL";
			meanReversion: "BULL" | "BEAR" | "NEUTRAL";
			patternBased: "BULL" | "BEAR" | "NEUTRAL";
		};
	};
}

export function displayBooleanAnalysis(data: BooleanDisplayData): void {
	const WIDTH = 120;
	
	console.log();
	console.log(colorize(separator("═", WIDTH), COLORS.magenta));
	console.log(header("BOOLEAN CANDLE PATTERN ANALYSIS", WIDTH));
	console.log(colorize(separator("═", WIDTH), COLORS.magenta));
	console.log();
	
	// Truth Table Section
	console.log(colorize("TRUTH TABLE OPERATIONS", COLORS.bright + COLORS.white));
	console.log(colorize(separator("─", WIDTH), COLORS.dim));
	
	const P = data.previous.isBull;
	const Q = data.current.isBull;
	
	// Candle states
	const prevIcon = P ? "🟢" : "🔴";
	const currIcon = Q ? "🟢" : "🔴";
	const prevText = P ? colorize("BULL", COLORS.green) : colorize("BEAR", COLORS.red);
	const currText = Q ? colorize("BULL", COLORS.green) : colorize("BEAR", COLORS.red);
	
	console.log(row("Previous (P)", `${prevIcon} ${prevText} (${P ? "1" : "0"})`));
	console.log(row("Current (Q)", `${currIcon} ${currText} (${Q ? "1" : "0"})`));
	console.log();
	
	// Boolean operations results
	const ops = data.operations;
	
	console.log(colorize("Logic Operations:", COLORS.bright));
	console.log(row("  NOT P (¬P)", formatBoolean(ops.not_previous) + colorize(" - Inverse of previous", COLORS.dim)));
	console.log(row("  NOT Q (¬Q)", formatBoolean(ops.not_current) + colorize(" - Inverse of current", COLORS.dim)));
	console.log(row("  P AND Q (P∧Q)", formatBoolean(ops.and) + colorize(" - Both bullish (continuation)", COLORS.dim)));
	console.log(row("  P OR Q (P∨Q)", formatBoolean(ops.or) + colorize(" - At least one bullish", COLORS.dim)));
	console.log(row("  P XOR Q (P⊕Q)", formatBoolean(ops.xor) + colorize(" - Different types (reversal)", COLORS.dim)));
	console.log(row("  P → Q", formatBoolean(ops.implication) + colorize(" - Expected continuation", COLORS.dim)));
	console.log();
	
	// Pattern interpretation
	console.log(colorize("Pattern Detected:", COLORS.bright));
	console.log(row("  Type", colorize(ops.pattern, COLORS.cyan)));
	if (ops.interpretation) {
		console.log(row("  Meaning", colorize(ops.interpretation, COLORS.yellow)));
	}
	console.log();
	
	// Sequence Analysis
	console.log(colorize("SEQUENCE ANALYSIS", COLORS.bright + COLORS.white));
	console.log(colorize(separator("─", WIDTH), COLORS.dim));
	
	// Last 3 candles visualization
	if (data.sequence.last3.length > 0) {
		const seq3 = data.sequence.last3.map(b => b ? "🟢" : "🔴").join(" → ");
		const seq3Text = data.sequence.last3.map(b => b ? "1" : "0").join(" → ");
		console.log(row("Last 3 Candles", `${seq3}  (${seq3Text})`));
	}
	
	// Last 5 candles visualization
	if (data.sequence.last5.length > 0) {
		const seq5 = data.sequence.last5.map(b => b ? "🟢" : "🔴").join(" → ");
		const seq5Text = data.sequence.last5.map(b => b ? "1" : "0").join(" → ");
		console.log(row("Last 5 Candles", `${seq5}  (${seq5Text})`));
	}
	
	// Streaks
	if (data.sequence.bullStreak > 0) {
		console.log(row("Bull Streak", colorize(`${data.sequence.bullStreak} consecutive 🟢`, COLORS.green)));
	}
	if (data.sequence.bearStreak > 0) {
		console.log(row("Bear Streak", colorize(`${data.sequence.bearStreak} consecutive 🔴`, COLORS.red)));
	}
	console.log();
	
	// Complex Patterns
	console.log(colorize("COMPLEX PATTERNS", COLORS.bright + COLORS.white));
	console.log(colorize(separator("─", WIDTH), COLORS.dim));
	
	const detectedPatterns = data.patterns.filter(p => p.detected);
	
	if (detectedPatterns.length === 0) {
		console.log(colorize("  No complex patterns detected", COLORS.dim));
	} else {
		for (const pattern of detectedPatterns) {
			const icon = "✓";
			console.log(colorize(`  ${icon} ${pattern.name}`, COLORS.green + COLORS.bright));
			console.log(colorize(`    ${pattern.description}`, COLORS.dim));
		}
	}
	console.log();
	
	// Candle Details
	console.log(colorize("CANDLE DETAILS", COLORS.bright + COLORS.white));
	console.log(colorize(separator("─", WIDTH), COLORS.dim));
	
	const prevChange = data.previous.change >= 0 ? "+" : "";
	const currChange = data.current.change >= 0 ? "+" : "";
	const prevChangeColor = data.previous.change >= 0 ? COLORS.green : COLORS.red;
	const currChangeColor = data.current.change >= 0 ? COLORS.green : COLORS.red;
	
	console.log(colorize("Previous Candle:", COLORS.bright));
	console.log(row("  Open → Close", `$${formatNumber(data.previous.open, 2)} → $${formatNumber(data.previous.close, 2)}`));
	console.log(row("  Change", colorize(`${prevChange}$${formatNumber(data.previous.change, 2)} (${prevChange}${formatPercent(data.previous.changePct, 2)})`, prevChangeColor)));
	console.log();
	
	console.log(colorize("Current Candle:", COLORS.bright));
	console.log(row("  Open → Close", `$${formatNumber(data.current.open, 2)} → $${formatNumber(data.current.close, 2)}`));
	console.log(row("  Change", colorize(`${currChange}$${formatNumber(data.current.change, 2)} (${currChange}${formatPercent(data.current.changePct, 2)})`, currChangeColor)));
	console.log();
	
	// Prediction Section
	console.log(colorize("NEXT CANDLE PREDICTION", COLORS.bright + COLORS.white));
	console.log(colorize(separator("─", WIDTH), COLORS.dim));
	
	const pred = data.prediction;
	const predIcon = pred.nextCandle === "BULL" ? "🟢" : "🔴";
	const predColor = pred.nextCandle === "BULL" ? COLORS.green : COLORS.red;
	const predText = colorize(pred.nextCandle, predColor + COLORS.bright);
	
	console.log(row("Prediction", `${predIcon} ${predText}`));
	
	// Confidence bar
	const confidencePct = pred.confidence * 100;
	const confidenceBar = "█".repeat(Math.floor(pred.confidence * 20));
	const confidenceColor = 
		pred.confidence > 0.7 ? COLORS.green :
		pred.confidence > 0.6 ? COLORS.yellow :
		COLORS.red;
	console.log(row("Confidence", colorize(`${confidenceBar.padEnd(20, "░")} ${formatPercent(confidencePct, 0)}`, confidenceColor)));
	console.log();
	
	// Signal breakdown
	console.log(colorize("Signal Breakdown:", COLORS.bright));
	
	const formatSignal = (signal: string) => {
		if (signal === "BULL") return colorize("BULL 🟢", COLORS.green);
		if (signal === "BEAR") return colorize("BEAR 🔴", COLORS.red);
		return colorize("NEUTRAL ⚪", COLORS.dim);
	};
	
	console.log(row("  Momentum", formatSignal(pred.signals.momentum)));
	console.log(row("  Mean Reversion", formatSignal(pred.signals.meanReversion)));
	console.log(row("  Pattern-Based", formatSignal(pred.signals.patternBased)));
	console.log();
	
	// Reasoning
	console.log(colorize("Reasoning:", COLORS.bright));
	for (const reason of pred.reasoning) {
		console.log(colorize(`  • ${reason}`, COLORS.dim));
	}
	console.log();
	
	console.log(colorize(separator("═", WIDTH), COLORS.magenta));
	console.log();
}

function formatBoolean(value: boolean): string {
	if (value) {
		return colorize("TRUE (1)", COLORS.green + COLORS.bright);
	}
	return colorize("FALSE (0)", COLORS.red + COLORS.bright);
}
