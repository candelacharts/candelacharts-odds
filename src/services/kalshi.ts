import {
	EventsApi,
	ExchangeApi,
	GetEventsStatusEnum,
	GetMarketCandlesticksPeriodIntervalEnum,
	GetMarketsMveFilterEnum,
	GetMarketsStatusEnum,
	MarketApi,
	OrdersApi,
	PortfolioApi,
} from "kalshi-typescript";

import { getKalshiConfig } from "../integrations/kalshi";

/**
 * Kalshi Service
 * Provides a centralized service layer for interacting with Kalshi APIs
 */
class KalshiService {
	private config = getKalshiConfig();

	// API instances
	public readonly portfolio: PortfolioApi;
	public readonly market: MarketApi;
	public readonly events: EventsApi;
	public readonly orders: OrdersApi;
	public readonly exchange: ExchangeApi;

	constructor() {
		this.portfolio = new PortfolioApi(this.config);
		this.market = new MarketApi(this.config);
		this.events = new EventsApi(this.config);
		this.orders = new OrdersApi(this.config);
		this.exchange = new ExchangeApi(this.config);
	}

	/**
	 * Get account balance
	 */
	async getBalance() {
		const response = await this.portfolio.getBalance();
		return {
			balance: (response.data.balance || 0) / 100, // Convert cents to dollars
			rawBalance: response.data.balance || 0,
		};
	}

	/**
	 * Get market by ticker
	 */
	async getMarket(ticker: string) {
		const response = await this.market.getMarket(ticker);
		return response.data.market;
	}

	/**
	 * Get markets with filters
	 */
	async getMarkets(params?: {
		limit?: number;
		cursor?: string;
		eventTicker?: string;
		seriesTicker?: string;
		minCreatedTs?: number;
		maxCreatedTs?: number;
		maxCloseTs?: number;
		minCloseTs?: number;
		minSettledTs?: number;
		maxSettledTs?: number;
		status?: GetMarketsStatusEnum;
		tickers?: string;
		mveFilter?: GetMarketsMveFilterEnum;
	}) {
		const response = await this.market.getMarkets(
			params?.limit,
			params?.cursor,
			params?.eventTicker,
			params?.seriesTicker,
			params?.minCreatedTs,
			params?.maxCreatedTs,
			params?.maxCloseTs,
			params?.minCloseTs,
			params?.minSettledTs,
			params?.maxSettledTs,
			params?.status,
			params?.tickers,
			params?.mveFilter,
		);
		return {
			markets: response.data.markets || [],
			cursor: response.data.cursor,
		};
	}

	/**
	 * Get orderbook for a market
	 */
	async getMarketOrderbook(ticker: string, depth?: number) {
		const response = await this.market.getMarketOrderbook(ticker, depth);
		return response.data;
	}

	/**
	 * Get market candlesticks
	 */
	async getMarketCandlesticks(
		seriesTicker: string,
		ticker: string,
		startTs: number,
		endTs: number,
		periodInterval: GetMarketCandlesticksPeriodIntervalEnum,
		includeLatestBeforeStart?: boolean,
	) {
		const response = await this.market.getMarketCandlesticks(
			seriesTicker,
			ticker,
			startTs,
			endTs,
			periodInterval,
			includeLatestBeforeStart,
		);
		return response.data;
	}

	/**
	 * Create order
	 */
	async createOrder(params: {
		ticker: string;
		action: "buy" | "sell";
		side: "yes" | "no";
		count: number;
		type: "market" | "limit";
		yesPrice?: number;
		noPrice?: number;
		expirationTs?: number;
		sellPositionFloor?: number;
		buyMaxCost?: number;
	}) {
		const response = await this.orders.createOrder({
			ticker: params.ticker,
			action: params.action,
			side: params.side,
			count: params.count,
			type: params.type,
			yes_price: params.yesPrice,
			no_price: params.noPrice,
			expiration_ts: params.expirationTs,
			sell_position_floor: params.sellPositionFloor,
			buy_max_cost: params.buyMaxCost,
		});
		return response.data.order;
	}
}

// Export singleton instance
export const kalshiService = new KalshiService();

// Export enums for convenience
export {
	GetMarketsStatusEnum,
	GetMarketsMveFilterEnum,
	GetEventsStatusEnum,
	GetMarketCandlesticksPeriodIntervalEnum,
};
