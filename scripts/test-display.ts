import { displayStrategyAnalysis } from "./src/utils/consoleDisplay";

const testData = {
	market: {
		ticker: "KXBTC15M-TEST",
		btcPrice: 78000,
		timeLeftMin: 10,
		marketClose: "12:00:00 PM",
	},
	orderbook: {
		yesPrice: 0.45,
		noPrice: 0.54,
		spread: 1,
		yesLiquidity: 1000,
		noLiquidity: 1000,
		imbalance: 1.0,
		imbalanceSide: "BALANCED" as const,
		execQuality: "good",
		depthL1Yes: 500,
		depthL1No: 500,
	},
	strategies: [],
	decision: {
		action: "NO_TRADE" as const,
		reason: "Testing display spacing",
	},
};

displayStrategyAnalysis(testData);
