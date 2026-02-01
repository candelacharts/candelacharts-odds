import { Configuration } from "kalshi-typescript";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

	// Validate API Key ID
	if (!apiKeyId) {
		throw new Error(
			"❌ KALSHI_API_KEY_ID is required. Please set it in your .env file.\n" +
			"   Example: KALSHI_API_KEY_ID=your-api-key-id-here",
		);
	}

	// Validate Private Key
	if (!privateKeyPath && !privateKeyPem) {
		throw new Error(
			"❌ Kalshi private key is required. Please provide one of the following in your .env file:\n" +
			"   1. KALSHI_PRIVATE_KEY_PATH=./keys/kalshi-private-key.pem\n" +
			"   2. KALSHI_PRIVATE_KEY_PEM=-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----",
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

	// Handle private key path
	if (privateKeyPath) {
		const resolvedPath = resolve(privateKeyPath);
		
		// Check if file exists
		if (!existsSync(resolvedPath)) {
			throw new Error(
				`❌ Private key file not found at: ${resolvedPath}\n` +
				"   Please ensure the file exists or update KALSHI_PRIVATE_KEY_PATH in your .env file.\n" +
				"   Alternatively, use KALSHI_PRIVATE_KEY_PEM to provide the key directly.",
			);
		}

		// Read and validate file content
		try {
			const keyContent = readFileSync(resolvedPath, "utf-8");
			
			// Check for placeholder or invalid content
			if (keyContent.includes("...key...") || keyContent.trim().length < 100) {
				throw new Error(
					`❌ Private key file appears to be corrupted or contains placeholder text: ${resolvedPath}\n` +
					"   The file should contain a valid RSA private key in PEM format.\n" +
					"   Expected format:\n" +
					"   -----BEGIN RSA PRIVATE KEY-----\n" +
					"   [base64 encoded key data]\n" +
					"   -----END RSA PRIVATE KEY-----",
				);
			}

			// Validate PEM format
			if (!keyContent.includes("-----BEGIN") || !keyContent.includes("-----END")) {
				throw new Error(
					`❌ Private key file is not in valid PEM format: ${resolvedPath}\n` +
					"   The file must start with -----BEGIN RSA PRIVATE KEY----- and end with -----END RSA PRIVATE KEY-----",
				);
			}
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("❌")) {
				throw error; // Re-throw our custom errors
			}
			throw new Error(
				`❌ Failed to read private key file: ${resolvedPath}\n` +
				`   Error: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		config.privateKeyPath = privateKeyPath;
	} else if (privateKeyPem) {
		// Validate inline PEM content
		if (privateKeyPem.includes("...key...") || privateKeyPem.trim().length < 100) {
			throw new Error(
				"❌ KALSHI_PRIVATE_KEY_PEM appears to contain placeholder text or is too short.\n" +
				"   Please provide a valid RSA private key in PEM format.",
			);
		}

		if (!privateKeyPem.includes("-----BEGIN") || !privateKeyPem.includes("-----END")) {
			throw new Error(
				"❌ KALSHI_PRIVATE_KEY_PEM is not in valid PEM format.\n" +
				"   The key must start with -----BEGIN RSA PRIVATE KEY----- and end with -----END RSA PRIVATE KEY-----",
			);
		}

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
