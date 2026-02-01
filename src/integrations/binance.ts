const BINANCE_BASE_URL = "https://api.binance.com";

function toNumber(x: any): number | null {
	const n = Number(x);
	return Number.isFinite(n) ? n : null;
}

export interface BinanceKline {
	openTime: number;
	open: number | null;
	high: number | null;
	low: number | null;
	close: number | null;
	volume: number | null;
	closeTime: number;
}

export interface BinanceTrade {
	e: string;
	E: number;
	s: string;
	t: number;
	p: string;
	q: string;
	b: number;
	a: number;
	T: number;
	m: boolean;
	M: boolean;
}

export async function fetchKlines({
	symbol = "BTCUSDT",
	interval = "15m",
	limit = 100,
}: {
	symbol?: string;
	interval?: string;
	limit?: number;
}): Promise<BinanceKline[]> {
	const url = new URL("/api/v3/klines", BINANCE_BASE_URL);
	url.searchParams.set("symbol", symbol);
	url.searchParams.set("interval", interval);
	url.searchParams.set("limit", String(limit));

	const res = await fetch(url.toString());
	if (!res.ok) {
		throw new Error(`Binance klines error: ${res.status} ${await res.text()}`);
	}
	const data = await res.json();

	return data.map((k: any[]) => ({
		openTime: Number(k[0]),
		open: toNumber(k[1]),
		high: toNumber(k[2]),
		low: toNumber(k[3]),
		close: toNumber(k[4]),
		volume: toNumber(k[5]),
		closeTime: Number(k[6]),
	}));
}

export async function fetchLastPrice(
	symbol: string = "BTCUSDT",
): Promise<number | null> {
	const url = new URL("/api/v3/ticker/price", BINANCE_BASE_URL);
	url.searchParams.set("symbol", symbol);
	const res = await fetch(url.toString());
	if (!res.ok) {
		throw new Error(
			`Binance last price error: ${res.status} ${await res.text()}`,
		);
	}
	const data = await res.json();
	return toNumber(data.price);
}
