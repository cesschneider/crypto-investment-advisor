# Crypto Investment Advisor — API Setup Guide

## 📋 Required API Keys

Copy these keys to `.env` after you obtain them from each service.

### 1. CoinGecko (Market Data)
**URL**: https://www.coingecko.com/en/api/documentation  
**Cost**: Free tier (1-20 calls/min) or Pro ($10-50/mo for 50+ calls/min)  
**Purpose**: Top 100 coins data, OHLC history, price trends

```
COINGECKO_API_KEY=your_key_here
```

**Test**: 
```bash
curl 'https://api.coingecko.com/api/v3/coins/bitcoin?x-cg-pro-api-key=YOUR_KEY'
```

---

### 2. Binance API (Real-Time Trading Data)
**URL**: https://www.binance.com/en/api  
**Cost**: Free  
**Purpose**: Real-time OHLCV, orderbooks, volumes, recent trades

```
BINANCE_API_KEY=your_key_here
BINANCE_SECRET_KEY=your_secret_here
```

**Setup Steps**:
1. Log into Binance → Account → API Management
2. Create new API key (no withdrawal rights needed)
3. Enable "Data Stream" and "Read" permissions only
4. Paste both keys to `.env`

**Test**:
```bash
curl 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'
```

---

### 3. Etherscan API (Ethereum On-Chain Data)
**URL**: https://etherscan.io/apis  
**Cost**: Free tier (5 calls/sec, 10K calls/day)  
**Purpose**: Token holders, contract verification, transfers, supply

```
ETHERSCAN_API_KEY=your_key_here
```

**Setup Steps**:
1. Go to https://etherscan.io/ → Sign up/Login
2. Click profile icon → API Keys
3. Create new API key
4. Copy to `.env`

**Test**:
```bash
curl 'https://api.etherscan.io/api?module=account&action=balance&address=0x..&apikey=YOUR_KEY'
```

---

### 4. Solscan API (Solana Blockchain Data)
**URL**: https://solscan.io/api-docs  
**Cost**: Free tier available  
**Purpose**: Solana token holders, transfers, program interactions

```
SOLSCAN_API_KEY=your_key_here
```

**Setup Steps**:
1. Visit https://solscan.io/
2. Dashboard → API Keys (no account required for some endpoints)
3. Copy key to `.env`

**Test**:
```bash
curl 'https://api.solscan.io/api/v2/account?address=..&apiKey=YOUR_KEY'
```

---

### 5. DefiLlama API (Optional — DeFi Data)
**URL**: https://defillama.com/api  
**Cost**: Free (public API, no key required)  
**Purpose**: Protocol TVL, yield farms, emerging protocols

```
DEFILLAMA_API_URL=https://api.llama.fi
```

**Test**:
```bash
curl 'https://api.llama.fi/protocols'
```

---

### 6. 1inch API (DEX Aggregator — New Launches)
**URL**: https://1inch.io/api/  
**Cost**: Free tier (API key recommended)  
**Purpose**: DEX liquidity pools, token swaps, price quotes

```
ONEINCH_API_KEY=your_key_here
```

**Setup**:
1. Visit https://portal.1inch.dev/
2. Create account → Generate API key
3. Copy to `.env`

**Test**:
```bash
curl 'https://api.1inch.dev/v5.0/1/quote?fromTokenAddress=0x...&toTokenAddress=0x..&amount=1000000000000000000'
```

---

### 7. 0x API (DEX Swaps — Alternative)
**URL**: https://0x.org/docs/api  
**Cost**: Free  
**Purpose**: Alternative DEX aggregation, swap data

```
ZEX_API_KEY=your_key_here
```

**Test**:
```bash
curl 'https://api.0x.org/swap/v1/quote?sellToken=ETH&buyToken=DAI&sellAmount=1000000000000000000'
```

---

### 8. Dune Analytics (Optional — Custom Queries)
**URL**: https://dune.com/api  
**Cost**: Free tier (100 queries/day)  
**Purpose**: Custom on-chain data queries (optional for advanced analysis)

```
DUNE_API_KEY=your_key_here
```

---

## 🔧 Configuration

Edit `config/analysis.json` after adding API keys:

```json
{
  "analysis": {
    "interval_minutes": 60,           // Run every hour
    "altcoin_scan_interval_hours": 4  // Scan launches every 4 hours
  },
  "thresholds": {
    "rsi_oversold": 30,
    "rsi_overbought": 70,
    "min_volume_usd_24h": 500000,
    "min_market_cap_usd": 1000000
  },
  "risk": {
    "max_position_size_percentage": 5,
    "stop_loss_percentage": 8,
    "take_profit_percentage": 25
  }
}
```

---

## ✅ Setup Checklist

- [ ] CoinGecko API key → `.env`
- [ ] Binance API keys → `.env`
- [ ] Etherscan API key → `.env`
- [ ] Solscan API key → `.env`
- [ ] 1inch API key → `.env`
- [ ] `npm install` (install dependencies)
- [ ] `npm run analyze` (test single analysis)
- [ ] `npm run monitor` (start continuous monitoring)

---

## 🚀 Next: First Analysis

Once all keys are in `.env`:

```bash
cd /root/projects/crypto-investment-advisor
npm install
npm run analyze
```

**Output**: Top 100 coins with technical signals, altcoin opportunities, and whale activity alerts.

---

## 💰 Cost Summary

| Service | Free Tier | Price | Notes |
|---------|-----------|-------|-------|
| CoinGecko | Limited | $10-50/mo | Recommended: Pro for higher limits |
| Binance | ✅ Yes | Free | Perfect for this use case |
| Etherscan | Limited | Free-$15/mo | 10K calls/day is usually sufficient |
| Solscan | ✅ Yes | Free | Good for Solana tokens |
| DefiLlama | ✅ Yes | Free | No account needed |
| 1inch | ✅ Yes | Free | API key optional |
| 0x | ✅ Yes | Free | Backup DEX data |

**Total Monthly**: ~$20-40 (CoinGecko Pro + optional Etherscan paid tier)

---

## 🔒 Security Notes

- **Never commit `.env`** (it's in `.gitignore`)
- **API keys are secrets** — treat like passwords
- **Binance**: Enable only "Data Stream" + "Read" permissions (no trading)
- **Etherscan**: Free tier is fine (no sensitive data)
- Store keys in a secure location, never share or paste in public

---

Ready to provide your API keys? Follow the setup steps above for each service.
