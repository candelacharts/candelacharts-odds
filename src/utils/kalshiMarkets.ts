import { kalshiService } from "../services/kalshi";

export function pickLatestActiveMarket(
	markets: any[],
	nowMs: number = Date.now(),
): any | null {
	if (!Array.isArray(markets) || markets.length === 0) return null;

	const enriched = markets
		.map((m) => {
			const closeMs = m.close_time ? new Date(m.close_time).getTime() : null;
			const openMs = m.open_time ? new Date(m.open_time).getTime() : null;
			return { m, closeMs, openMs };
		})
		.filter((x) => x.closeMs !== null);

	const active = enriched
		.filter((x) => {
			const isOpen = x.openMs === null ? true : x.openMs <= nowMs;
			const notClosed = nowMs < (x.closeMs ?? Number.MAX_SAFE_INTEGER);
			const isActiveOrOpen = x.m.status === "active" || x.m.status === "open";
			return isOpen && notClosed && isActiveOrOpen;
		})
		.sort((a, b) => (a.closeMs ?? 0) - (b.closeMs ?? 0));

	if (active.length) return active[0].m;

	const upcoming = enriched
		.filter((x) => {
			const isActiveOrOpen = x.m.status === "active" || x.m.status === "open";
			return nowMs < (x.closeMs ?? Number.MAX_SAFE_INTEGER) && isActiveOrOpen;
		})
		.sort((a, b) => (a.closeMs ?? 0) - (b.closeMs ?? 0));

	return upcoming.length ? upcoming[0].m : null;
}

export async function fetchLatestBitcoinMarket(
	seriesTicker: string = "KXBTC15M",
): Promise<any | null> {
	// Don't filter by status in the API call - filter locally instead
	// This works around a bug in kalshi-typescript SDK 3.5.0 that incorrectly maps the status parameter
	const response = await kalshiService.getMarkets({
		seriesTicker,
		limit: 200,
	});

	if (!response.markets || response.markets.length === 0) {
		return null;
	}

	// Filter for open markets locally
	const openMarkets = response.markets.filter(
		(m: any) => m.status === "open" || m.status === "active"
	);

	return pickLatestActiveMarket(openMarkets);
}

function toNumber(x: any): number | null {
	const n = Number(x);
	return Number.isFinite(n) ? n : null;
}

export function summarizeOrderbook(orderbook: any) {
	// Handle nested orderbook structure
	const ob = orderbook?.orderbook || orderbook;
	const yesBids = Array.isArray(ob?.yes) ? ob.yes : [];
	const noBids = Array.isArray(ob?.no) ? ob.no : [];

	const bestYes = yesBids.length > 0 ? toNumber(yesBids[0][0]) : null;
	const bestNo = noBids.length > 0 ? toNumber(noBids[0][0]) : null;

	const spread =
		bestYes !== null && bestNo !== null
			? Math.abs(100 - bestYes - bestNo)
			: null;

	const yesLiquidity = yesBids.reduce(
		(acc: number, [_price, qty]: [any, any]) => acc + (toNumber(qty) ?? 0),
		0,
	);
	const noLiquidity = noBids.reduce(
		(acc: number, [_price, qty]: [any, any]) => acc + (toNumber(qty) ?? 0),
		0,
	);

	return {
		bestYes,
		bestNo,
		spread,
		yesLiquidity,
		noLiquidity,
		yesPrice: bestYes !== null ? bestYes / 100 : null,
		noPrice: bestNo !== null ? bestNo / 100 : null,
	};
}

export function analyzeOrderbookDOM(orderbook: any) {
	// Handle nested orderbook structure
	// IMPORTANT: Kalshi orderbook shows ASKS (sellers), not bids (buyers)
	// To BUY YES, we look at YES asks (people selling YES)
	// To BUY NO, we look at NO asks (people selling NO)
	const ob = orderbook?.orderbook || orderbook;
	const yesAsks = Array.isArray(ob?.yes) ? ob.yes : [];
	const noAsks = Array.isArray(ob?.no) ? ob.no : [];

	if (yesAsks.length === 0 || noAsks.length === 0) {
		return {
			imbalanceRatio: null,
			yesWeightedPrice: null,
			noWeightedPrice: null,
			yesDepth: [0, 0, 0],
			noDepth: [0, 0, 0],
			spread: null,
			spreadPct: null,
			topHeavy: false,
			executionQuality: "unknown",
			bestYesAsk: null,
			bestNoAsk: null,
		};
	}

	const yesLiquidity = yesAsks.reduce(
		(sum: number, [_p, q]: [any, any]) => sum + (toNumber(q) ?? 0),
		0,
	);
	const noLiquidity = noAsks.reduce(
		(sum: number, [_p, q]: [any, any]) => sum + (toNumber(q) ?? 0),
		0,
	);

	const imbalanceRatio = noLiquidity > 0 ? yesLiquidity / noLiquidity : null;

	const yesWeightedPrice =
		yesLiquidity > 0
			? yesAsks.reduce(
					(sum: number, [p, q]: [any, any]) =>
						sum + (toNumber(p) ?? 0) * (toNumber(q) ?? 0),
					0,
				) / yesLiquidity
			: null;
	const noWeightedPrice =
		noLiquidity > 0
			? noAsks.reduce(
					(sum: number, [p, q]: [any, any]) =>
						sum + (toNumber(p) ?? 0) * (toNumber(q) ?? 0),
					0,
				) / noLiquidity
			: null;

	const yesDepth = [
		yesAsks
			.slice(0, 1)
			.reduce(
				(sum: number, [_p, q]: [any, any]) => sum + (toNumber(q) ?? 0),
				0,
			),
		yesAsks
			.slice(0, 2)
			.reduce(
				(sum: number, [_p, q]: [any, any]) => sum + (toNumber(q) ?? 0),
				0,
			),
		yesAsks
			.slice(0, 3)
			.reduce(
				(sum: number, [_p, q]: [any, any]) => sum + (toNumber(q) ?? 0),
				0,
			),
	];
	const noDepth = [
		noAsks
			.slice(0, 1)
			.reduce(
				(sum: number, [_p, q]: [any, any]) => sum + (toNumber(q) ?? 0),
				0,
			),
		noAsks
			.slice(0, 2)
			.reduce(
				(sum: number, [_p, q]: [any, any]) => sum + (toNumber(q) ?? 0),
				0,
			),
		noAsks
			.slice(0, 3)
			.reduce(
				(sum: number, [_p, q]: [any, any]) => sum + (toNumber(q) ?? 0),
				0,
			),
	];

	// Best ask prices (what we need to pay to buy)
	const bestYesAskCents = toNumber(yesAsks[0]?.[0]);
	const bestNoAskCents = toNumber(noAsks[0]?.[0]);

	const spread =
		bestYesAskCents !== null && bestNoAskCents !== null
			? Math.abs(100 - bestYesAskCents - bestNoAskCents)
			: null;
	const avgPrice =
		bestYesAskCents !== null && bestNoAskCents !== null
			? (bestYesAskCents + bestNoAskCents) / 2
			: null;
	const spreadPct =
		spread !== null && avgPrice !== null && avgPrice > 0
			? spread / avgPrice
			: null;

	const topHeavy =
		imbalanceRatio !== null && (imbalanceRatio > 2.5 || imbalanceRatio < 0.4);

	let executionQuality = "good";
	if (spreadPct !== null && spreadPct > 0.08) {
		executionQuality = "poor";
	} else if (spreadPct !== null && spreadPct > 0.05) {
		executionQuality = "fair";
	} else if (yesDepth[0] < 500 || noDepth[0] < 500) {
		executionQuality = "fair";
	} else if (yesDepth[2] > 2000 && noDepth[2] > 2000) {
		executionQuality = "excellent";
	}

	return {
		imbalanceRatio,
		yesWeightedPrice,
		noWeightedPrice,
		yesDepth,
		noDepth,
		spread,
		spreadPct,
		topHeavy,
		executionQuality,
		// Best ask prices (what we pay to BUY)
		bestYesAsk: bestYesAskCents !== null ? bestYesAskCents / 100 : null, // in dollars
		bestNoAsk: bestNoAskCents !== null ? bestNoAskCents / 100 : null, // in dollars
		bestYesAskCents, // in cents
		bestNoAskCents, // in cents
		totalYesVolume: yesLiquidity,
		totalNoVolume: noLiquidity,
		yesDepth5: yesAsks
			.slice(0, 5)
			.reduce(
				(sum: number, [_p, q]: [any, any]) => sum + (toNumber(q) ?? 0),
				0,
			),
		noDepth5: noAsks
			.slice(0, 5)
			.reduce(
				(sum: number, [_p, q]: [any, any]) => sum + (toNumber(q) ?? 0),
				0,
			),
	};
}
