import { CONFIG } from "../config/config";
import { StrategyRunner } from "../services/strategyRunner";

async function main() {
	console.log("🚀 Starting Kalshi Multi-Asset Arbitrage Bot...\n");

	const seriesTickers = CONFIG.kalshi.seriesTickers;
	
	console.log(`📊 Monitoring ${seriesTickers.length} asset(s):`);
	for (const ticker of seriesTickers) {
		const binanceSymbol = CONFIG.getBinanceSymbolForSeries(ticker);
		console.log(`   • ${ticker} → ${binanceSymbol}`);
	}
	console.log();

	// Create a runner for each asset
	const runners = seriesTickers.map((seriesTicker) => {
		const binanceSymbol = CONFIG.getBinanceSymbolForSeries(seriesTicker);
		return new StrategyRunner(seriesTicker, binanceSymbol);
	});

	// Start all runners in parallel
	console.log("⚡ Starting all runners...\n");
	await Promise.all(
		runners.map((runner) => runner.startPolling(5000))
	);
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
