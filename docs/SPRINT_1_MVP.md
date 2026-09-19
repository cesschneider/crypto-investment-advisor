# SPRINT 1 — Crypto Investment Advisor MVP

## Goal
Implement core analyzers with Binance + Etherscan + Solscan public APIs. 
Deploy Hermes cron jobs for hourly technical signals, 4-hourly altcoin discovery, real-time whale monitoring.

## User Journey
1. System ingests crypto data (Binance, Etherscan, Solscan)
2. Generates hourly technical signals (RSI/MACD/SMA)
3. Identifies altcoin opportunities (< 30 days old)
4. Monitors whale activity (large transactions)
5. Sends daily 7 AM briefing to WhatsApp

## 4-Phase Priority Order

### Phase 1: Infrastructure (1.1–1.4)
- Setup Binance API service wrapper
- Setup Etherscan API service wrapper  
- Setup Solscan public API wrapper
- Configure .env and validation

### Phase 2: Analyzers (2.1–2.3)
- Technical analyzer (RSI/MACD/SMA from Binance)
- On-chain analyzer (whale tracking via Etherscan)
- Altcoin analyzer (new token detection)

### Phase 3: Signals (3.1–3.3)
- Hourly technical signals (top 100 coins)
- 4-hourly altcoin opportunities (< 30d tokens)
- Real-time whale alerts (large transactions)

### Phase 4: Deployment (4.1–4.3)
- Hermes cron: hourly technical signals
- Hermes cron: 4-hourly altcoin discovery
- Hermes cron: daily 7 AM briefing (WhatsApp)

## Stories to Implement

### Phase 1: Infrastructure
- **STORY 1.1:** Binance API Service Wrapper
  - GET /account balances
  - GET /klines OHLCV
  - Test with real credentials
  
- **STORY 1.2:** Etherscan API Service Wrapper (V2)
  - GET /account/balance
  - GET /account/tokentx (whale tracking)
  - Handle V1→V2 migration
  
- **STORY 1.3:** Solscan Public API Wrapper
  - GET /token/list (Solana tokens)
  - GET /transfer/history (transactions)
  - No auth required (public endpoints)
  
- **STORY 1.4:** Environment + Validation
  - Update .env with 3 API keys
  - Create validation scripts
  - Document rate limits

### Phase 2: Analyzers  
- **STORY 2.1:** Technical Analyzer Impl
  - RSI 14-period
  - MACD 12/26/9
  - SMA 20/50/200
  - Confidence scoring
  
- **STORY 2.2:** On-Chain Analyzer Impl
  - Whale transaction detection (> $1M)
  - Holder concentration (top 10)
  - Supply tracking
  
- **STORY 2.3:** Altcoin Analyzer Impl
  - Token age detection (< 30 days)
  - Contract safety check
  - Market cap screening
  - Risk scoring (0-100)

### Phase 3: Signals
- **STORY 3.1:** Hourly Technical Signals
  - Query top 100 coins via Binance
  - Calculate RSI/MACD/SMA
  - Generate buy/sell signals
  - Output JSON format
  
- **STORY 3.2:** 4-Hourly Altcoin Opportunities
  - Scan Solana tokens (< 30d)
  - Score each (0-100)
  - Filter by market cap & volume
  - Output JSON + risk indicators
  
- **STORY 3.3:** Real-Time Whale Monitor
  - Poll Etherscan for large txns
  - Classify: accumulation vs distribution
  - Alert on > $1M moves
  - Output JSON with confidence

### Phase 4: Deployment
- **STORY 4.1:** Hermes Cron: Hourly Technical
  - Schedule: every 1 hour
  - Run: generateTechnicalSignals()
  - Deliver: telegram WhatsApp
  
- **STORY 4.2:** Hermes Cron: 4-Hourly Altcoins
  - Schedule: every 4 hours
  - Run: discoverAltcoins()
  - Deliver: telegram, WhatsApp
  
- **STORY 4.3:** Hermes Cron: Daily 7 AM Brief
  - Schedule: daily at 7 AM (-03 timezone)
  - Aggregate: tech + altcoins + whales
  - Deliver: WhatsApp consolidated

## Deferred (Not in MVP)
- CoinGecko integration (add in Phase 2)
- 1inch DEX routes (add in Phase 2)
- Advanced ML models (v2)
- Multi-chain support (v2)
- Mobile app (v2)

## Cost Estimates
| Story | Credits | Time | Complexity |
|-------|---------|------|-----------|
| 1.1   | 0.5     | 15m  | Low       |
| 1.2   | 0.8     | 25m  | Medium    |
| 1.3   | 0.6     | 20m  | Low       |
| 1.4   | 0.3     | 10m  | Low       |
| 2.1   | 1.2     | 40m  | Medium    |
| 2.2   | 1.0     | 35m  | Medium    |
| 2.3   | 1.2     | 40m  | Medium    |
| 3.1   | 0.8     | 30m  | Medium    |
| 3.2   | 1.0     | 35m  | Medium    |
| 3.3   | 0.9     | 30m  | Medium    |
| 4.1   | 0.6     | 20m  | Low       |
| 4.2   | 0.6     | 20m  | Low       |
| 4.3   | 0.7     | 25m  | Medium    |

**Total:** ~10.8 credits, ~5-6 hours wall-clock time

## Infrastructure
- Binance API: 1200 req/min (FREE)
- Etherscan: 5 req/sec (FREE)
- Solscan: public (no auth)
- Hermes: local (free)
- All FREE tier — no additional costs

## Naming
- "Signals" not "indicators"
- "Opportunities" not "trades"
- "Whale activity" not "whale movements"

---

**Status:** Ready for Phase 1 execution  
**Start Date:** 2026-09-18  
**Target Complete:** 2026-09-18 (same day, ~6 hours)