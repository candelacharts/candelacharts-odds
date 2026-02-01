import { Configuration } from "kalshi-typescript";

/**
 * Kalshi API Configuration
 * Creates a configuration instance for the Kalshi TypeScript SDK
 */
export function createKalshiConfig(): Configuration {
	const apiKeyId = process.env.KALSHI_API_KEY_ID;
	const privateKeyPath = process.env.KALSHI_PRIVATE_KEY_PATH;
	const privateKeyPem = process.env.KALSHI_PRIVATE_KEY_PEM;
	const basePath =
		process.env.KALSHI_BASE_PATH ||
		"https://api.elections.kalshi.com/trade-api/v2";

	if (!apiKeyId) {
		throw new Error(
			"KALSHI_API_KEY_ID is required. Please set it in your .env file.",
		);
	}

	if (!privateKeyPath && !privateKeyPem) {
		throw new Error(
			"Either KALSHI_PRIVATE_KEY_PATH or KALSHI_PRIVATE_KEY_PEM must be set in your .env file.",
		);
	}

	const config: {
		apiKey: string;
		basePath: string;
		privateKeyPath?: string;
		privateKeyPem?: string;
	} = {
		apiKey: apiKeyId,
		basePath,
	};

	if (privateKeyPath) {
		config.privateKeyPath = privateKeyPath;
	} else if (privateKeyPem) {
		config.privateKeyPem = privateKeyPem;
	}

	return new Configuration(config);
}

/**
 * Get Kalshi configuration instance
 * Singleton pattern to reuse configuration
 */
let kalshiConfig: Configuration | null = null;

export function getKalshiConfig(): Configuration {
	if (!kalshiConfig) {
		kalshiConfig = createKalshiConfig();
	}
	return kalshiConfig;
}
