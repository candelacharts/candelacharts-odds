# Arbitrage Strategy Guide

## What is Kalshi Arbitrage?

Arbitrage on Kalshi is a **risk-free trading strategy** that exploits pricing inefficiencies in prediction markets. When the sum of YES and NO contract prices doesn't equal $1.00, there's an opportunity to lock in guaranteed profit.

## How It Works

### The Basic Principle

In Kalshi prediction markets:
- Each market has two sides: **YES** and **NO**
- At expiry, one side pays **$1.00** per contract, the other pays **$0.00**
- Theoretically, YES price + NO price should always equal **$1.00**

However, due to market inefficiencies, liquidity imbalances, or rapid price movements, sometimes:

```
YES ask price + NO ask price < $1.00
```

When this happens, you can buy BOTH sides for less than $1.00 and guarantee a profit at expiry.

### Example: Perfect Arbitrage

**Market**: Bitcoin will be above $78,500 at 12:00 PM

**Current Prices**:
- YES ask: **$0.36** (36¢)
- NO ask: **$0.04** (4¢)
- Total cost: **$0.40** (40¢)

**Your Action**:
1. Buy 1 YES contract for $0.36
2. Buy 1 NO contract for $0.04
3. Total investment: $0.40

**At Expiry** (regardless of outcome):
- If Bitcoin > $78,500: YES pays $1.00, NO pays $0.00 → You get $1.00
- If Bitcoin ≤ $78,500: NO pays $1.00, YES pays $0.00 → You get $1.00

**Profit**: $1.00 - $0.40 = **$0.60** (150% ROI)

### Why This is Risk-Free

Unlike traditional trading:
- ✅ **No market risk** - You profit regardless of the outcome
- ✅ **No timing risk** - You hold until expiry
- ✅ **No directional bias** - You don't need to predict the market
- ✅ **Guaranteed payout** - One side always pays $1.00

## Calculating Profitability

### Formula

```
Gross Profit = $1.00 - (YES ask + NO ask)
Fees = (YES ask × 0.007) + (NO ask × 0.007)
Net Profit = Gross Profit - Fees
ROI = (Net Profit / Total Cost) × 100%
```

### Fee Structure

Kalshi charges approximately **0.7%** per side (taker fee):
- Buying YES: 0.7% of YES price
- Buying NO: 0.7% of NO price
- Total fees: ~1.4% of total cost

### Minimum Profit Threshold

The bot only executes when:
```
Net Profit > $0.005 (0.5¢)
```

This ensures the arbitrage is worth the transaction costs.

## Real-World Example with Fees

**Market**: Ethereum will be above $2,400 at 3:00 PM

**Prices**:
- YES ask: $0.42 (42¢)
- NO ask: $0.56 (56¢)
- Total: $0.98 (98¢)

**Calculation**:
```
Gross Profit = $1.00 - $0.98 = $0.02 (2¢)

Fees:
- YES fee: $0.42 × 0.007 = $0.00294
- NO fee: $0.56 × 0.007 = $0.00392
- Total fees: $0.00686 (~0.7¢)

Net Profit = $0.02 - $0.00686 = $0.01314 (~1.3¢)

ROI = ($0.01314 / $0.98) × 100% = 1.34%
```

**Result**: Guaranteed 1.34% profit in minutes/hours

## How to Capitalize on This Strategy

### 1. Understand the Opportunity

Arbitrage opportunities occur when:
- **Market volatility** causes rapid price movements
- **Liquidity imbalances** create pricing gaps
- **New markets open** with uncertain pricing
- **Near expiry** when prices converge quickly

### 2. Timing is Critical

⏰ **Best Times to Find Arbitrage**:
- Market open (first 5 minutes)
- Major news events
- 15-30 minutes before expiry
- High volatility periods

⚠️ **Avoid**:
- Last 2 minutes before expiry (too risky)
- Low liquidity markets (hard to fill orders)

### 3. Position Sizing Strategy

**Conservative Approach**:
```
Position Size = Account Balance × 2-5%
```

**Example**: $1,000 account
- Per trade: $20-50
- Allows 20-50 simultaneous positions
- Reduces concentration risk

**Aggressive Approach**:
```
Position Size = Account Balance × 10-20%
```

**Example**: $1,000 account
- Per trade: $100-200
- Higher returns but more capital at risk
- Requires careful monitoring

### 4. Scaling Your Profits

**Small Account ($100-500)**:
- Target: 5-10 trades per day
- Average profit: $0.50-2.00 per trade
- Daily profit: $2.50-20.00
- Monthly: $50-400 (10-80% return)

**Medium Account ($1,000-5,000)**:
- Target: 10-20 trades per day
- Average profit: $2-10 per trade
- Daily profit: $20-200
- Monthly: $400-4,000 (8-80% return)

**Large Account ($10,000+)**:
- Target: 20-50 trades per day
- Average profit: $10-50 per trade
- Daily profit: $200-2,500
- Monthly: $4,000-50,000 (8-100% return)

### 5. Risk Management

Even though arbitrage is "risk-free," manage these risks:

**Execution Risk**:
- One order fills, the other doesn't
- **Mitigation**: Use limit orders, monitor fills

**Liquidity Risk**:
- Not enough contracts available
- **Mitigation**: Check orderbook depth before trading

**Platform Risk**:
- API downtime, order delays
- **Mitigation**: Don't trade too close to expiry

**Capital Risk**:
- Tying up capital in many positions
- **Mitigation**: Limit positions per candle period

## Bot Configuration for Maximum Profit

### Optimal Settings

```env
# Conservative (Lower Risk)
PROFIT_TARGET_USD=10
MAX_POSITIONS_PER_15MIN=2
KALSHI_SERIES_TICKERS=KXBTC15M

# Balanced (Recommended)
PROFIT_TARGET_USD=20
MAX_POSITIONS_PER_15MIN=3
KALSHI_SERIES_TICKERS=KXBTC15M,KXETH15M,KXSOL15M

# Aggressive (Higher Returns)
PROFIT_TARGET_USD=50
MAX_POSITIONS_PER_15MIN=5
KALSHI_SERIES_TICKERS=KXBTC15M,KXETH15M,KXSOL15M,KXBTCD,KXETHD
```

### Multi-Asset Strategy

Monitor multiple assets to increase opportunities:

**15-Minute Markets** (More frequent, smaller opportunities):
- `KXBTC15M` - Bitcoin 15-minute
- `KXETH15M` - Ethereum 15-minute
- `KXSOL15M` - Solana 15-minute

**Hourly Markets** (Less frequent, larger opportunities):
- `KXBTCD` - Bitcoin hourly
- `KXETHD` - Ethereum hourly
- `KXSOLD` - Solana hourly
- `KXXRPD` - XRP hourly

**Recommended**: Monitor 3-5 assets simultaneously for optimal opportunity flow.

## Advanced Strategies

### 1. Early Exit Strategy

Instead of holding until expiry, exit when:
```
Current Profit ≥ Target Profit (e.g., $20)
```

**Benefits**:
- Free up capital faster
- Compound profits more frequently
- Reduce exposure time

**How the Bot Does This**:
The bot automatically monitors positions and closes BOTH sides when either side reaches the profit target.

### 2. Candle Period Limiting

Limit positions per time period to avoid:
- Over-concentration in single candle
- Correlation risk (all positions expire together)

**Bot Configuration**:
```env
MAX_POSITIONS_PER_15MIN=3
```

This ensures you don't open more than 3 positions in any 15-minute period.

### 3. Market Selection

**High Probability Markets**:
- Major cryptocurrencies (BTC, ETH)
- High liquidity (>5,000 contracts)
- Tight spreads (<2¢)

**Avoid**:
- Illiquid markets (<500 contracts)
- Wide spreads (>10¢)
- Exotic assets

## Expected Returns

### Realistic Expectations

**Per Trade**:
- Average profit: $0.50 - $5.00
- Average ROI: 0.5% - 5%
- Average duration: 5-60 minutes

**Daily**:
- Opportunities: 5-30 per asset
- Executed trades: 3-15 (depending on settings)
- Daily profit: $5-100 (varies by account size)

**Monthly**:
- Total trades: 60-300
- Monthly return: 5-50% (varies by strategy)
- Compounding effect increases returns

### Frequency of Opportunities

**15-Minute Markets**:
- New market every 15 minutes
- ~96 markets per day per asset
- Arbitrage in ~5-10% of markets
- **Expected**: 5-10 opportunities per day per asset

**Hourly Markets**:
- New market every hour
- ~24 markets per day per asset
- Arbitrage in ~10-20% of markets
- **Expected**: 2-5 opportunities per day per asset

## Common Pitfalls to Avoid

### ❌ Don't Do This

1. **Trading too close to expiry** (<2 minutes)
   - Risk: Orders may not fill in time
   - Solution: Bot automatically skips these

2. **Ignoring fees**
   - Risk: "Profitable" trade becomes a loss
   - Solution: Bot calculates net profit after fees

3. **Over-leveraging**
   - Risk: All capital tied up in positions
   - Solution: Use position limits

4. **Chasing small profits** (<0.5¢)
   - Risk: Fees eat up all profit
   - Solution: Bot has minimum profit threshold

5. **Manual intervention**
   - Risk: Slower than automated execution
   - Solution: Let the bot run automatically

### ✅ Best Practices

1. **Start small** - Test with $100-500 first
2. **Monitor daily** - Check bot logs and performance
3. **Reinvest profits** - Compound returns over time
4. **Diversify assets** - Monitor multiple markets
5. **Be patient** - Opportunities come in waves

## Tax Considerations

### United States

Kalshi profits are typically treated as:
- **Short-term capital gains** (held <1 year)
- Taxed at ordinary income rates
- Report on Schedule D

**Record Keeping**:
- The bot logs all trades to CSV files
- Track: Date, ticker, buy price, sell price, profit/loss
- Keep records for 3+ years

### Consult a Tax Professional

Tax treatment varies by:
- Your country/jurisdiction
- Your income level
- Your trading frequency

**Recommendation**: Consult a tax professional familiar with prediction markets.

## Frequently Asked Questions

### Q: Is this really risk-free?

**A**: Yes, in theory. You're guaranteed $1.00 at expiry regardless of outcome. However, there are execution risks (orders not filling) and platform risks (API issues).

### Q: How often do arbitrage opportunities occur?

**A**: Varies by market volatility. Typically 5-30 opportunities per day across multiple assets. More during high volatility periods.

### Q: What's the minimum account size needed?

**A**: You can start with as little as $100, but $500-1,000 is recommended for meaningful returns and diversification.

### Q: How much can I realistically make?

**A**: Depends on account size and strategy. Conservative estimate: 5-20% monthly return. Aggressive: 20-50%+ monthly return.

### Q: Do I need to monitor the bot constantly?

**A**: No. The bot runs automatically. Check once or twice daily to ensure it's running and review performance.

### Q: What if one order fills but the other doesn't?

**A**: This is "execution risk." The bot places both orders simultaneously to minimize this. If it happens, you have a directional position (not risk-free anymore). The bot logs this as a "partial" position.

### Q: Can I run this 24/7?

**A**: Kalshi markets operate during US trading hours (roughly 9 AM - 6 PM ET). The bot will find no markets outside these hours.

### Q: What happens at market expiry?

**A**: Kalshi automatically settles positions. The winning side pays $1.00 per contract. Funds are credited to your account immediately.

## Getting Started Checklist

- [ ] Fund Kalshi account ($500+ recommended)
- [ ] Configure `.env` file with API credentials
- [ ] Set profit target (`PROFIT_TARGET_USD`)
- [ ] Set position limits (`MAX_POSITIONS_PER_15MIN`)
- [ ] Choose assets to monitor (`KALSHI_SERIES_TICKERS`)
- [ ] Run bot: `bun run strategy`
- [ ] Monitor first few trades manually
- [ ] Review daily logs in `tickers/` folder
- [ ] Adjust settings based on performance
- [ ] Scale up gradually as you gain confidence

## Support and Resources

### Bot Documentation
- `README.md` - Setup and installation
- `SETUP.md` - Step-by-step configuration
- `PROJECT_SUMMARY.md` - Technical overview

### Kalshi Resources
- [Kalshi API Documentation](https://trading-api.readme.io/reference/getting-started)
- [Kalshi Fee Schedule](https://kalshi.com/fees)
- [Kalshi Market Rules](https://kalshi.com/rules)

### Community
- Monitor your `tickers/` folder for trade logs
- Review CSV files for performance analysis
- Track your ROI and adjust strategy accordingly

---

## Disclaimer

**Important**: This strategy involves real money and financial risk. While arbitrage is theoretically risk-free, execution risks exist. Past performance does not guarantee future results. Only invest what you can afford to lose. This is not financial advice. Consult a financial advisor before trading.

**Trading involves risk**: Kalshi is a CFTC-regulated exchange. Ensure you understand the risks and comply with all applicable laws and regulations in your jurisdiction.

---

**Last Updated**: February 2026  
**Version**: 1.0.0  
**Bot**: Candelacharts Odds X
