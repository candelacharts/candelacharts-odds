/**
 * Clear Position Tracker
 * Use this script to view and clear tracked positions
 */

import { orderExecutor } from "../src/services/orderExecutor";

console.log("\n🧹 Position Management Tool\n");

// Display current positions
console.log("📊 Current Positions:");
orderExecutor.displayPositions();

// Get command line argument
const args = process.argv.slice(2);
const command = args[0];

if (command === "clear") {
	console.log("\n🗑️  Clearing all positions...");
	orderExecutor.clearAllPositions();
	console.log("\n✅ All positions cleared!\n");
} else if (command === "clear-ticker" && args[1]) {
	const ticker = args[1];
	console.log(`\n🗑️  Clearing position for ${ticker}...`);
	const cleared = orderExecutor.clearPosition(ticker);
	if (cleared) {
		console.log(`✅ Position ${ticker} cleared!\n`);
	} else {
		console.log(`⚠️  Position ${ticker} not found.\n`);
	}
} else {
	console.log("\n💡 Usage:");
	console.log("  bun run clear-positions.ts              # View positions");
	console.log("  bun run clear-positions.ts clear        # Clear all positions");
	console.log("  bun run clear-positions.ts clear-ticker TICKER  # Clear specific position");
	console.log();
}
