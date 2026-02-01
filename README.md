# Candelacharts Odds - Kalshi Arbitrage Bot

A high-performance arbitrage trading bot for Kalshi prediction markets, built with Bun and TypeScript.

## Features

- **Risk-Free Arbitrage**: Automatically detects and executes arbitrage opportunities when YES + NO prices don't equal $1.00
- **Multi-Asset Support**: Monitor multiple crypto assets simultaneously (BTC, ETH, SOL, XRP)
- **Smart Position Management**: Auto-close positions when profit targets are reached
- **Rate Limiting**: Configurable maximum positions per candle period
- **Comprehensive Logging**: All orders logged to CSV files for analysis

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure your Kalshi API credentials:

```bash
cp .env.example .env
```

Edit `.env` with your Kalshi API credentials:

```env
KALSHI_API_KEY_ID=your-api-key-id
KALSHI_PRIVATE_KEY_PATH=./keys/kalshi-private-key.pem
KALSHI_BASE_PATH=https://api.elections.kalshi.com/trade-api/v2
KALSHI_SERIES_TICKERS=KXBTC15M
PROFIT_TARGET_USD=20
MAX_POSITIONS_PER_15MIN=3
```

**Important**: Place your Kalshi private key file in the `keys/` directory. The bot will validate:
- ✅ API Key ID is provided
- ✅ Private key file exists and is readable
- ✅ Private key is in valid PEM format
- ✅ Private key is not corrupted or a placeholder

If any validation fails, you'll see a clear error message explaining what needs to be fixed.

### 3. Run the Bot

```bash
bun run strategy
```

## Configuration

### Asset Selection

Monitor one or more crypto assets by setting `KALSHI_SERIES_TICKERS`:

```env
# Single asset
KALSHI_SERIES_TICKERS=KXBTC15M

# Multiple assets
KALSHI_SERIES_TICKERS=KXBTC15M,KXBTCD,KXETHD
```

## Supported Kalshi Assets

The bot works with Kalshi's cryptocurrency prediction markets. These markets predict whether an asset's price will be above or below a specific threshold at a given time.

### 15-Minute Markets (High Frequency)

Perfect for active trading with frequent opportunities:

| Ticker | Asset | Market Type | New Market Every | Markets Per Day |
|--------|-------|-------------|------------------|-----------------|
| `KXBTC15M` | Bitcoin (BTC) | 15-minute | 15 minutes | ~96 |
| `KXETH15M` | Ethereum (ETH) | 15-minute | 15 minutes | ~96 |
| `KXSOL15M` | Solana (SOL) | 15-minute | 15 minutes | ~96 |

**Best For**: 
- Active traders
- Quick capital turnover
- More frequent arbitrage opportunities
- Smaller profit per trade but higher volume

**Example Market**: "Will Bitcoin be above $78,500 at 12:15 PM?"

### Hourly Markets (Lower Frequency)

Better for larger positions with less frequent monitoring:

| Ticker | Asset | Market Type | New Market Every | Markets Per Day |
|--------|-------|-------------|------------------|-----------------|
| `KXBTCD` | Bitcoin (BTC) | Hourly | 1 hour | ~24 |
| `KXETHD` | Ethereum (ETH) | Hourly | 1 hour | ~24 |
| `KXSOLD` | Solana (SOL) | Hourly | 1 hour | ~24 |
| `KXXRPD` | Ripple (XRP) | Hourly | 1 hour | ~24 |

**Best For**:
- Passive traders
- Larger arbitrage opportunities
- Less frequent monitoring required
- Potentially larger profit per trade

**Example Market**: "Will Ethereum be above $2,400 at 3:00 PM?"

### Market Characteristics

**Trading Hours**: 
- Markets operate during US trading hours (approximately 9 AM - 6 PM ET)
- New markets open continuously throughout the day
- Markets close at their designated expiry time

**Liquidity**:
- Bitcoin (BTC): Highest liquidity, tightest spreads
- Ethereum (ETH): High liquidity, good for larger positions
- Solana (SOL): Moderate liquidity, good opportunities
- Ripple (XRP): Lower liquidity, fewer but potentially larger opportunities

**Recommended Configuration**:

```env
# Conservative (1 asset, lower frequency)
KALSHI_SERIES_TICKERS=KXBTC15M

# Balanced (3 assets, good opportunity flow)
KALSHI_SERIES_TICKERS=KXBTC15M,KXETH15M,KXSOL15M

# Aggressive (Mix of 15-min and hourly)
KALSHI_SERIES_TICKERS=KXBTC15M,KXETH15M,KXSOL15M,KXBTCD,KXETHD

# Maximum Coverage (All available assets)
KALSHI_SERIES_TICKERS=KXBTC15M,KXETH15M,KXSOL15M,KXBTCD,KXETHD,KXSOLD,KXXRPD
```

### Why These Assets?

**Cryptocurrency Markets** are ideal for arbitrage because:
- ✅ High volatility creates pricing inefficiencies
- ✅ 24/7 underlying markets (crypto never sleeps)
- ✅ Clear, objective settlement (price at specific time)
- ✅ High trading volume and liquidity
- ✅ Frequent new markets throughout the day

**Note**: Kalshi offers other market types (politics, economics, weather), but this bot is optimized for cryptocurrency markets due to their high frequency and clear settlement criteria.

### Trading Parameters

- `PROFIT_TARGET_USD`: Auto-close positions when either side reaches this profit (default: $20)
- `MAX_POSITIONS_PER_15MIN`: Maximum positions per candle period (default: 3)

## How It Works

### Arbitrage Strategy

The bot monitors Kalshi orderbooks for arbitrage opportunities:

1. **Detection**: When YES ask + NO ask < $1.00 (after fees)
2. **Execution**: Buy both YES and NO contracts simultaneously
3. **Settlement**: At market expiry, one side pays $1.00, guaranteeing profit

**Example**:
- YES ask: $0.36
- NO ask: $0.04
- Total cost: $0.40 + fees ≈ $0.41
- Payout: $1.00
- **Profit: $0.59 (risk-free)**

### Position Management

- **Entry**: Only executes when total cost < $1.00 (after fees)
- **Exit**: Auto-closes when profit target reached or at market expiry
- **Rate Limiting**: Respects max positions per candle to manage risk

## Project Structure

```
candelacharts-odds-x/
├── src/
│   ├── config/           # Configuration
│   ├── integrations/     # External API integrations (Kalshi, Binance)
│   ├── services/         # Core services (order execution, strategy)
│   ├── strategies/       # Trading strategies
│   └── utils/            # Utilities (logging, display, calculations)
├── tickers/              # Order logs (CSV files)
├── .env                  # Environment configuration
└── package.json          # Dependencies
```

## Development

### Run in Development Mode

```bash
bun run dev
```

### Scripts

- `bun run start` - Run the main entry point
- `bun run dev` - Run with auto-reload
- `bun run strategy` - Run the arbitrage strategy
- `bun run typecheck` - Run TypeScript type checking
- `bun run check` - Alias for typecheck (shorter)

### Type Safety

This project is built with strict TypeScript for maximum type safety:

```bash
# Check for type errors
bun run typecheck

# The codebase passes strict TypeScript compilation with:
# - strict mode enabled
# - noUncheckedIndexedAccess
# - noImplicitOverride
# - noFallthroughCasesInSwitch
```

## Order Logging

All orders are automatically logged to CSV files in the `tickers/` directory when trades are executed:

### When Logs Are Created

**Important**: Order logs are only created when the bot **actually executes trades**. If you see an empty `tickers/` directory, it means:
- ✅ The bot is running correctly
- ⏸️ No arbitrage opportunities have been found yet
- 🔍 The bot is waiting for YES + NO prices to sum to less than $1.00

The bot runs in **ARBITRAGE-ONLY MODE** and will only trade when it finds risk-free opportunities.

### Log Format

- **Filename**: `kalshi-{TICKER}-{TIMESTAMP}.csv`
- **Location**: `tickers/` directory
- **Content**: Each row includes:
  - `date`: ISO timestamp of the order
  - `timestamp`: Unix timestamp in milliseconds
  - `ticker`: Market ticker (e.g., KXBTC15M-26FEB010445-45)
  - `side`: "yes" or "no"
  - `action`: "buy" or "sell"
  - `quantity`: Number of contracts
  - `price`: Price per contract in dollars
  - `orderId`: Kalshi order ID
  - `status`: "success", "failed", or "pending"
  - `totalCost`: Total cost including fees
  - `fees`: Trading fees paid
  - `strategy`: Strategy name (e.g., "Arbitrage")
  - `errorMessage`: Error details if order failed

### Example Log Entry

```csv
date,timestamp,ticker,side,action,quantity,price,orderId,status,totalCost,fees,strategy,errorMessage
2026-02-01T12:30:45.123Z,1769943045123,KXBTC15M-26FEB011230-30,yes,buy,10,36.00,abc123,success,0.3700,0.0100,Arbitrage,""
2026-02-01T12:30:45.124Z,1769943045124,KXBTC15M-26FEB011230-30,no,buy,10,4.00,def456,success,0.0410,0.0010,Arbitrage,""
```

### Viewing Your Trading History

```bash
# List all log files
ls -lh tickers/

# View a specific log file
cat tickers/kalshi-KXBTC15M-*.csv

# Count total trades
wc -l tickers/*.csv
```

## Safety Features

- **Balance Checking**: Verifies sufficient funds before placing orders
- **Price Validation**: Ensures prices are within reasonable ranges
- **Parallel Execution**: Places both sides simultaneously to minimize slippage
- **Error Handling**: Comprehensive error handling and logging
- **Position Limits**: Prevents over-trading with configurable rate limits

## Requirements

- Bun 1.0+
- Kalshi API credentials
- Sufficient account balance for trading

## License

Private - All rights reserved

## Disclaimer

This bot is for educational purposes. Trading involves risk. Always test with small amounts first and understand the risks before deploying with real funds.
