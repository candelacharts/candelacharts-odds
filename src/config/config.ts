const ASSET_MAPPING: Record<string, string> = {
	// 15-minute markets
	KXBTC15M: "BTCUSDT",
	KXETH15M: "ETHUSDT",
	KXSOL15M: "SOLUSDT",
	// Hourly (daily) markets
	KXBTCD: "BTCUSDT",
	KXETHD: "ETHUSDT",
	KXSOLD: "SOLUSDT",
	KXXRPD: "XRPUSDT",
};

// Parse comma-separated list of series tickers
const seriesTickersEnv = process.env.KALSHI_SERIES_TICKERS || "KXBTC15M";
const seriesTickers = seriesTickersEnv
	.split(",")
	.map((s: string) => s.trim())
	.filter((s: string) => s.length > 0);

function getBinanceSymbol(kalshiSeries: string): string {
	const mapped = ASSET_MAPPING[kalshiSeries.toUpperCase()];
	if (mapped) return mapped;

	if (process.env.BINANCE_SYMBOL) return process.env.BINANCE_SYMBOL;

	return "BTCUSDT";
}

export const CONFIG = {
	symbol: getBinanceSymbol(seriesTickers[0] ?? "KXBTC15M"), // Default to first ticker for backward compatibility
	binanceBaseUrl: "https://api.binance.com",

	pollIntervalMs: 1_000,
	candleWindowMinutes: 15,

	vwapSlopeLookbackMinutes: 5,
	rsiPeriod: 14,
	rsiMaPeriod: 14,

	macdFast: 12,
	macdSlow: 26,
	macdSignal: 9,

	// Strategy Configuration
	strategy: {
		// Trading strategy: 'arbitrage' or 'technical'
		// arbitrage: Only trades on risk-free arbitrage opportunities (YES + NO < $1.00)
		// technical: Trades based on technical analysis indicators
		mode: (process.env.STRATEGY || "arbitrage").toLowerCase() as "arbitrage" | "technical",
	},

	// Trading Configuration
	trading: {
		// Auto-close profit target (in dollars)
		// When either side reaches this profit, BOTH sides are closed
		// Default: $20 (configurable via PROFIT_TARGET_USD env var)
		profitTargetUsd: Number.parseFloat(process.env.PROFIT_TARGET_USD || "20"),

		// Maximum number of positions per candle period (strategy-specific)
		// For 15-min markets: limits positions per 15-minute period
		// For hourly markets: limits positions per 1-hour period
		
		// Arbitrage: Default 3 (configurable via MAX_ARBITRAGE_POSITIONS env var)
		maxArbitragePositions: Number.parseInt(process.env.MAX_ARBITRAGE_POSITIONS || "3", 10),
		
		// Technical: Default 1 (configurable via MAX_TECHNICAL_POSITIONS env var)
		maxTechnicalPositions: Number.parseInt(process.env.MAX_TECHNICAL_POSITIONS || "1", 10),

		// Auto-clear stale positions after X minutes
		// Positions older than this will be automatically removed from tracking
		// Default: 15 minutes (configurable via AUTO_CLEAR_MINUTES env var)
		autoClearMinutes: Number.parseInt(process.env.AUTO_CLEAR_MINUTES || "15", 10),

		// Strike cross gap threshold (percentage)
		// Price must cross strike by this percentage to trigger a trade signal
		// Default: 0.015% (configurable via STRIKE_GAP_PERCENT env var)
		// Examples: 0.010 (0.010%), 0.015 (0.015%), 0.020 (0.020%)
		strikeGapPercent: Number.parseFloat(process.env.STRIKE_GAP_PERCENT || "0.015"),

		// Standard deviation levels for volatility-based exits
		// These define different sensitivity levels for taking profit
		// Values are in percentage (e.g., 0.050 = 0.050% = 0.5 standard deviations)
		stdevLevels: {
			// 1 standard deviation (~68% of moves) - Most common, quick exits
			stdev1: Number.parseFloat(process.env.STDEV_1_PERCENT || "0.050"),
			
			// 2 standard deviations (~95% of moves) - Moderate moves
			stdev2: Number.parseFloat(process.env.STDEV_2_PERCENT || "0.100"),
			
			// 3 standard deviations (~99.7% of moves) - Large moves
			stdev3: Number.parseFloat(process.env.STDEV_3_PERCENT || "0.150"),
			
			// 4 standard deviations (~99.99% of moves) - Very rare, extreme moves
			stdev4: Number.parseFloat(process.env.STDEV_4_PERCENT || "0.200"),
		},

		// Maximum retry attempts for failed orders per candle
		// If order fails, bot will retry up to this many times before giving up
		// Default: 5 (configurable via MAX_ORDER_RETRIES env var)
		maxOrderRetries: Number.parseInt(process.env.MAX_ORDER_RETRIES || "5", 10),

		// Minimum time remaining before market close (in minutes)
		// Orders will not be placed if less than this time remains
		// Default: 5 minutes (configurable via MIN_TIME_TO_EXPIRY_MIN env var)
		minTimeToExpiryMin: Number.parseFloat(process.env.MIN_TIME_TO_EXPIRY_MIN || "5"),
	},

	kalshi: {
		baseUrl: process.env.KALSHI_BASE_URL || "https://api.elections.kalshi.com",
		wsUrl:
			process.env.KALSHI_WS_URL ||
			"wss://api.elections.kalshi.com/trade-api/ws/v2",
		apiKey: process.env.KALSHI_API_KEY || "",
		privateKeyPath: process.env.KALSHI_PRIVATE_KEY_PATH || "",
		seriesTickers: seriesTickers, // Array of series tickers to monitor
		seriesTicker: seriesTickers[0], // Backward compatibility: first ticker
		marketTicker: process.env.KALSHI_MARKET_TICKER || "",
		autoSelectLatest:
			(process.env.KALSHI_AUTO_SELECT_LATEST || "true").toLowerCase() ===
			"true",
		autoSwitchMarkets:
			(process.env.KALSHI_AUTO_SWITCH_MARKETS || "true").toLowerCase() ===
			"true",
		marketSwitchThresholdMin: Number.parseFloat(
			process.env.KALSHI_MARKET_SWITCH_THRESHOLD_MIN || "2",
		),
		marketCheckIntervalSec: Number.parseInt(
			process.env.KALSHI_MARKET_CHECK_INTERVAL_SEC || "30",
			10,
		),
		usePolling:
			(process.env.KALSHI_USE_POLLING || "true").toLowerCase() === "true",
		pollingIntervalMs: Number.parseInt(
			process.env.KALSHI_POLLING_INTERVAL_MS || "1000",
			10,
		),
	},

	// Helper function to get Binance symbol for a specific Kalshi series
	getBinanceSymbolForSeries: getBinanceSymbol,
};

export const SUPPORTED_ASSETS = ASSET_MAPPING;
