/**
 * Order Logger
 * Logs all orders to CSV files organized by ticker and timestamp
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";

export interface OrderLogEntry {
	timestamp: number;
	ticker: string;
	side: "yes" | "no";
	action: "buy" | "sell";
	quantity: number;
	price: number; // in cents
	orderId?: string;
	status: "success" | "failed" | "pending";
	errorMessage?: string;
	totalCost?: number; // in dollars
	fees?: number; // in dollars
	strategy?: string;
}

export class OrderLogger {
	private tickersDir: string;

	constructor(tickersDir: string = "./tickers") {
		this.tickersDir = tickersDir;
	}

	/**
	 * Round timestamp to 15-minute candle period
	 * This ensures all orders within the same 15-min period use the same file
	 */
	private roundTo15MinCandle(timestamp: number): number {
		const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
		return Math.floor(timestamp / FIFTEEN_MINUTES_MS) * FIFTEEN_MINUTES_MS;
	}

	/**
	 * Get CSV filename for a ticker
	 * Format: kalshi-TICKER-TIMESTAMP.csv
	 * Timestamp is rounded to 15-minute candle period
	 */
	private getFilename(ticker: string, timestamp: number): string {
		const candleTimestamp = this.roundTo15MinCandle(timestamp);
		return `kalshi-${ticker}-${candleTimestamp}.csv`;
	}

	/**
	 * Get file path for a ticker
	 */
	private getFilePath(ticker: string, timestamp: number): string {
		return join(this.tickersDir, this.getFilename(ticker, timestamp));
	}

	/**
	 * Convert order entry to CSV row
	 */
	private toCsvRow(entry: OrderLogEntry): string {
		const date = new Date(entry.timestamp).toISOString();
		const price = (entry.price / 100).toFixed(2); // Convert cents to dollars
		const totalCost = entry.totalCost?.toFixed(4) || "";
		const fees = entry.fees?.toFixed(4) || "";
		const orderId = entry.orderId || "";
		const errorMessage = entry.errorMessage?.replace(/,/g, ";") || ""; // Escape commas
		const strategy = entry.strategy || "";

		return `${date},${entry.timestamp},${entry.ticker},${entry.side},${entry.action},${entry.quantity},${price},${orderId},${entry.status},${totalCost},${fees},${strategy},"${errorMessage}"`;
	}

	/**
	 * Get CSV header
	 */
	private getCsvHeader(): string {
		return "date,timestamp,ticker,side,action,quantity,price,orderId,status,totalCost,fees,strategy,errorMessage";
	}

	/**
	 * Log a single order
	 */
	logOrder(entry: OrderLogEntry): void {
		const filePath = this.getFilePath(entry.ticker, entry.timestamp);

		try {
			// Check if file exists
			if (!existsSync(filePath)) {
				// Create new file with header
				const header = this.getCsvHeader();
				const row = this.toCsvRow(entry);
				writeFileSync(filePath, `${header}\n${row}\n`, "utf-8");
				console.log(
					`     📝 Created order log: ${this.getFilename(entry.ticker, entry.timestamp)}`,
				);
			} else {
				// Append to existing file
				const row = this.toCsvRow(entry);
				appendFileSync(filePath, `${row}\n`, "utf-8");
				console.log(
					`     📝 Updated order log: ${this.getFilename(entry.ticker, entry.timestamp)}`,
				);
			}
		} catch (error) {
			console.error(`     ✗ Failed to log order:`, error);
		}
	}

	/**
	 * Log multiple orders (batch)
	 */
	logBatchOrders(entries: OrderLogEntry[]): void {
		for (const entry of entries) {
			this.logOrder(entry);
		}
	}

	/**
	 * Read orders from a file
	 */
	readOrders(ticker: string, timestamp: number): OrderLogEntry[] {
		const filePath = this.getFilePath(ticker, timestamp);

		try {
			if (!existsSync(filePath)) {
				return [];
			}

			const content = readFileSync(filePath, "utf-8");
			const lines = content.split("\n").filter((line) => line.trim());

			// Skip header
			const dataLines = lines.slice(1);

			return dataLines.map((line) => {
				const parts = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
				const [
					_date,
					timestamp,
					ticker,
					side,
					action,
					quantity,
					price,
					orderId,
					status,
					totalCost,
					fees,
					strategy,
					errorMessage,
				] = parts.map((p) => p.replace(/^"|"$/g, "").trim());

				return {
					timestamp: Number.parseInt(timestamp, 10),
					ticker,
					side: side as "yes" | "no",
					action: action as "buy" | "sell",
					quantity: Number.parseInt(quantity, 10),
					price: Number.parseFloat(price) * 100, // Convert back to cents
					orderId: orderId || undefined,
					status: status as "success" | "failed" | "pending",
					totalCost: totalCost ? Number.parseFloat(totalCost) : undefined,
					fees: fees ? Number.parseFloat(fees) : undefined,
					strategy: strategy || undefined,
					errorMessage: errorMessage || undefined,
				};
			});
		} catch (error) {
			console.error(`Failed to read orders from ${filePath}:`, error);
			return [];
		}
	}

	/**
	 * Get summary statistics for a ticker
	 */
	getSummary(
		ticker: string,
		timestamp: number,
	): {
		totalOrders: number;
		successfulOrders: number;
		failedOrders: number;
		totalCost: number;
		totalFees: number;
	} {
		const orders = this.readOrders(ticker, timestamp);

		return {
			totalOrders: orders.length,
			successfulOrders: orders.filter((o) => o.status === "success").length,
			failedOrders: orders.filter((o) => o.status === "failed").length,
			totalCost: orders.reduce((sum, o) => sum + (o.totalCost || 0), 0),
			totalFees: orders.reduce((sum, o) => sum + (o.fees || 0), 0),
		};
	}
}

// Export singleton instance
export const orderLogger = new OrderLogger();
