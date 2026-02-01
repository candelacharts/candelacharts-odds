# Standard Deviation Exit Levels

## Overview

The bot uses configurable standard deviation (σ) levels to determine when to exit positions based on price movement magnitude. This creates a tiered exit strategy that balances profit-taking with risk management.

## The Levels

### Entry: 0.015% Gap (Strike Cross)
- **Purpose**: Trigger trades when price crosses the strike
- **Sensitivity**: Very high - catches small movements
- **Example**: $100,000 strike → triggers at $100,015

### Exit Levels (Standard Deviations)

#### 1σ (1 Standard Deviation) - 0.050%
- **Frequency**: ~68% of price moves fall within ±1σ
- **Strategy**: Quick exits on common moves
- **Example**: $100,000 → exit at $100,050 ($50 move)
- **Use Case**: Conservative, take profits early
- **Multiplier**: 3.3x the entry gap

#### 2σ (2 Standard Deviations) - 0.100%
- **Frequency**: ~95% of price moves fall within ±2σ
- **Strategy**: Moderate moves, balanced approach
- **Example**: $100,000 → exit at $100,100 ($100 move)
- **Use Case**: Standard profit-taking level
- **Multiplier**: 6.7x the entry gap

#### 3σ (3 Standard Deviations) - 0.150%
- **Frequency**: ~99.7% of price moves fall within ±3σ
- **Strategy**: Large moves, higher profit potential
- **Example**: $100,000 → exit at $100,150 ($150 move)
- **Use Case**: Aggressive, wait for bigger moves
- **Multiplier**: 10x the entry gap

#### 4σ (4 Standard Deviations) - 0.200%
- **Frequency**: ~99.99% of price moves fall within ±4σ
- **Strategy**: Extreme rare moves, maximum profit
- **Example**: $100,000 → exit at $100,200 ($200 move)
- **Use Case**: Very aggressive, rare opportunities
- **Multiplier**: 13.3x the entry gap

## How It Works

### Entry
```
Strike: $100,000
Gap: 0.015% = $15
Entry triggers: $100,015 (YES) or $99,985 (NO)
```

### Exit (Cascading Check)
The bot checks exit levels from highest to lowest:

1. **Check 4σ**: Is move ≥ 0.200%? → Exit with "4σ move"
2. **Check 3σ**: Is move ≥ 0.150%? → Exit with "3σ move"
3. **Check 2σ**: Is move ≥ 0.100%? → Exit with "2σ move"
4. **Check 1σ**: Is move ≥ 0.050%? → Exit with "1σ move"
5. **No exit**: Continue holding position

### Additional Requirements
- **Profit must be positive** (covers fees)
- **Both sides close together** (for arbitrage positions)

## Configuration

### Default Values (Balanced)
```env
STDEV_1_PERCENT=0.050  # Quick exits
STDEV_2_PERCENT=0.100  # Standard
STDEV_3_PERCENT=0.150  # Large moves
STDEV_4_PERCENT=0.200  # Extreme moves
```

### Conservative (Take Profits Early)
```env
STDEV_1_PERCENT=0.030  # Very quick exits
STDEV_2_PERCENT=0.060  # Early exits
STDEV_3_PERCENT=0.100  # Medium moves
STDEV_4_PERCENT=0.150  # Large moves
```

### Aggressive (Wait for Bigger Moves)
```env
STDEV_1_PERCENT=0.100  # Only on moderate moves
STDEV_2_PERCENT=0.150  # Large moves
STDEV_3_PERCENT=0.200  # Very large moves
STDEV_4_PERCENT=0.300  # Extreme moves
```

### Very Aggressive (Maximum Profit)
```env
STDEV_1_PERCENT=0.150  # Large moves only
STDEV_2_PERCENT=0.200  # Very large moves
STDEV_3_PERCENT=0.300  # Extreme moves
STDEV_4_PERCENT=0.500  # Rare extreme moves
```

## Practical Examples

### Bitcoin at $100,000

| Level | Threshold | Price Target | Dollar Move | Frequency |
|-------|-----------|--------------|-------------|-----------|
| Entry | 0.015% | $100,015 | $15 | Every cross |
| 1σ | 0.050% | $100,050 | $50 | Common |
| 2σ | 0.100% | $100,100 | $100 | Moderate |
| 3σ | 0.150% | $100,150 | $150 | Rare |
| 4σ | 0.200% | $100,200 | $200 | Very Rare |

### Ethereum at $3,000

| Level | Threshold | Price Target | Dollar Move | Frequency |
|-------|-----------|--------------|-------------|-----------|
| Entry | 0.015% | $3,000.45 | $0.45 | Every cross |
| 1σ | 0.050% | $3,001.50 | $1.50 | Common |
| 2σ | 0.100% | $3,003.00 | $3.00 | Moderate |
| 3σ | 0.150% | $3,004.50 | $4.50 | Rare |
| 4σ | 0.200% | $3,006.00 | $6.00 | Very Rare |

## Strategy Implications

### Entry vs Exit Ratio

The ratio between entry and exit levels determines your risk/reward:

- **Entry**: 0.015% (very sensitive)
- **1σ Exit**: 0.050% = **3.3x entry**
- **2σ Exit**: 0.100% = **6.7x entry**
- **3σ Exit**: 0.150% = **10x entry**
- **4σ Exit**: 0.200% = **13.3x entry**

### Risk Management

**Lower exit thresholds (conservative)**:
- ✅ More frequent exits
- ✅ Lower risk of reversal
- ✅ Steady small profits
- ⚠️ May miss larger moves

**Higher exit thresholds (aggressive)**:
- ✅ Larger profit per trade
- ✅ Fewer exits (less trading fees)
- ⚠️ Higher risk of reversal
- ⚠️ Fewer successful exits

## Best Practices

1. **Start Conservative**: Use default values (0.050%, 0.100%, 0.150%, 0.200%)
2. **Monitor Performance**: Track which levels trigger most often
3. **Adjust Based on Volatility**:
   - High volatility markets → Use higher thresholds
   - Low volatility markets → Use lower thresholds
4. **Consider Market Type**:
   - 15-minute markets → Lower thresholds (faster moves)
   - Hourly markets → Higher thresholds (larger moves expected)
5. **Balance with PROFIT_TARGET_USD**: 
   - Standard deviation exits are for volatility-based exits
   - Profit target is for absolute dollar amount exits
   - Both work together

## Console Output

When a position exits based on standard deviation:

```
💰 AUTO-CLOSE TRIGGERED: KXBTC15M-01FEB121500-00
   Reason: YES side: 2σ move (0.105%) + profit $0.15 - Taking profit
   Profit: $0.15
```

This shows:
- **Which level triggered**: 2σ
- **Actual move percentage**: 0.105%
- **Profit amount**: $0.15

## Related Configuration

These settings work together:

- `STRIKE_GAP_PERCENT`: Entry sensitivity (default: 0.015%)
- `STDEV_1_PERCENT` through `STDEV_4_PERCENT`: Exit levels
- `PROFIT_TARGET_USD`: Absolute profit target (default: $20)
- `MAX_TECHNICAL_POSITIONS`: Position limits per candle

## Technical Details

### Calculation Method

1. **Price Move** = |Current Price - Entry Price|
2. **Move Percentage** = (Price Move / Entry Price) × 100
3. **Compare** against configured thresholds (4σ → 3σ → 2σ → 1σ)
4. **Exit** at first threshold exceeded (with positive profit)

### Why This Approach?

Instead of calculating actual standard deviation from price history (which varies), we use **fixed percentage thresholds** that represent typical standard deviation levels. This provides:

- ✅ Consistent behavior across different market conditions
- ✅ Easy to understand and configure
- ✅ Predictable exit points
- ✅ No need for complex statistical calculations

The percentages (0.050%, 0.100%, etc.) are based on typical Bitcoin 15-minute volatility patterns.
