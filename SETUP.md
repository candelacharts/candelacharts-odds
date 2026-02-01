# Setup Guide

## Prerequisites

- Bun 1.0+ installed
- Kalshi account with API access
- API key and private key from Kalshi

## Installation Steps

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Kalshi API Credentials

#### Option A: Using Private Key File (Recommended)

1. Create a `keys` directory:
   ```bash
   mkdir -p keys
   ```

2. Save your Kalshi private key to `keys/kalshi-private-key.pem`

3. Update `.env`:
   ```env
   KALSHI_API_KEY_ID=your-actual-api-key-id
   KALSHI_PRIVATE_KEY_PATH=./keys/kalshi-private-key.pem
   ```

#### Option B: Using Inline PEM String

Update `.env`:
```env
KALSHI_API_KEY_ID=your-actual-api-key-id
KALSHI_PRIVATE_KEY_PEM=-----BEGIN RSA PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END RSA PRIVATE KEY-----
```

### 3. Configure Trading Parameters

Edit `.env` to set your preferences:

```env
# Use demo API for testing (recommended)
KALSHI_BASE_PATH=https://demo-api.elections.kalshi.com/trade-api/v2

# Or use production API
# KALSHI_BASE_PATH=https://api.elections.kalshi.com/trade-api/v2

# Asset to monitor
KALSHI_SERIES_TICKERS=KXBTC15M

# Profit target (in USD)
PROFIT_TARGET_USD=20

# Max positions per candle period
MAX_POSITIONS_PER_15MIN=3
```

## Running the Bot

### Test Compilation

```bash
bun run test-compile.ts
```

### Run Arbitrage Strategy

```bash
bun run strategy
```

### Development Mode (with auto-reload)

```bash
bun run dev
```

## Monitoring

The bot will:
1. Monitor Kalshi markets for arbitrage opportunities
2. Display real-time analysis in the console
3. Execute trades automatically when opportunities are found
4. Log all orders to CSV files in the `tickers/` directory

## Order Logs

All orders are logged to CSV files in `tickers/`:
- Format: `kalshi-{TICKER}-{TIMESTAMP}.csv`
- Contains: timestamp, side, action, price, status, fees, profit/loss

## Safety Tips

1. **Start with Demo API**: Test with `demo-api.elections.kalshi.com` first
2. **Small Amounts**: Start with small position sizes
3. **Monitor Closely**: Watch the first few trades carefully
4. **Check Balance**: Ensure sufficient funds in your account
5. **Understand Fees**: Kalshi charges ~0.7% per side

## Troubleshooting

### "KALSHI_API_KEY_ID is required"
- Make sure `.env` file exists and contains your API key

### "Private key not found"
- Check that `keys/kalshi-private-key.pem` exists
- Or use `KALSHI_PRIVATE_KEY_PEM` in `.env`

### "Insufficient balance"
- Deposit more funds to your Kalshi account
- Or reduce position sizes

### No arbitrage opportunities
- This is normal - arbitrage opportunities are rare
- The bot will wait and monitor continuously
- Try different assets or time periods

## Support

For issues or questions:
1. Check the README.md for detailed documentation
2. Review the console output for error messages
3. Check order logs in `tickers/` directory
