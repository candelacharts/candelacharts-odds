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

	// Trading Configuration
	trading: {
		// Auto-close profit target (in dollars)
		// When either side reaches this profit, BOTH sides are closed
		// Default: $20 (configurable via PROFIT_TARGET_USD env var)
		profitTargetUsd: Number.parseFloat(process.env.PROFIT_TARGET_USD || "20"),

		// Maximum number of arbitrage positions per candle period
		// For 15-min markets: limits positions per 15-minute period
		// For hourly markets: limits positions per 1-hour period
		// Default: 3 (configurable via MAX_POSITIONS_PER_15MIN env var)
		maxPositionsPer15Min: Number.parseInt(process.env.MAX_POSITIONS_PER_15MIN || "3", 10),
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
