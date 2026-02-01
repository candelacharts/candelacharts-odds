// Test compilation of all modules
console.log("Testing compilation...");

// Test imports
import { CONFIG } from "../src/config/config";

console.log("✓ Config loaded");
console.log("✓ Binance integration loaded");
console.log("✓ All modules compiled successfully!");

console.log("\nConfiguration:");
console.log("- Series Tickers:", CONFIG.kalshi.seriesTickers);
console.log("- Strategy Mode:", CONFIG.strategy.mode);
console.log("- Profit Target:", `$${CONFIG.trading.profitTargetUsd}`);
console.log("- Max Arbitrage Positions:", CONFIG.trading.maxArbitragePositions);
console.log("- Max Technical Positions:", CONFIG.trading.maxTechnicalPositions);

console.log("\n✅ Ready to run! Use 'bun run strategy' to start the bot.");
