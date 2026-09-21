/**
 * SignalEngine — the advisor decision pipeline (post-audit orchestration)
 *
 * Wires the previously-isolated Epic 3–6 services into ONE deterministic
 * decision flow, parameterized by an InvestorProfile. It runs, in order:
 *
 *   InputValidator → RegimeClassifier → MultiTimeframeAnalyzer → SignalScorer
 *   → DerivativesAnalyzer → OnChainAnalyzer → SentimentAnalyzer → MacroAnalyzer
 *   → ATRRiskCalculator → VolatilityScaledSizer → DrawdownCircuitBreaker
 *
 * and emits a single structured `EngineResult` with an action and, when
 * tradeable, a `trade_setup` (entry / stop / cascaded TPs / position size).
 *
 * Governing principles (audit §18–§21):
 *   - No single indicator triggers a trade; 2+ dimensions must support.
 *   - Confidence is evidence strength, NOT win probability.
 *   - INSUFFICIENT_DATA / NO_TRADE are first-class outcomes.
 *   - Every quantitative input is supplied by the caller (no network I/O,
 *     no invented data). Fetch layers are invoked by the caller, not here.
 */

import { SignalScorer } from '../services/signal-scorer';
import { ScoringInputs } from '../types/index';
import { RegimeClassifier, Regime } from '../services/RegimeClassifier';
import { MultiTimeframeAnalyzer, Candle, Timeframe } from '../services/MultiTimeframeAnalyzer';
import { StrategyWeighter } from '../services/StrategyWeighter';
import { ATRBasedRiskCalculator, VolatilityRegime } from '../services/ATRRiskCalculator';
import { VolatilityScaledSizer } from '../services/VolatilityScaledSizer';
import { DrawdownCircuitBreaker } from '../services/DrawdownCircuitBreaker';
import { DerivativesAnalyzer, DerivativesInput } from '../services/DerivativesAnalyzer';
import { OnChainAnalyzer, OnChainInput } from '../services/OnChainAnalyzer';
import { SentimentAnalyzer, SentimentInput } from '../services/SentimentAnalyzer';
import { MacroAnalyzer, MacroInput } from '../services/MacroAnalyzer';
import { InvestorProfile } from '../profiles/investor-profile';
import { SignalAction } from '../types/index';

/** OHLCV candles keyed by timeframe (subset actually supplied). */
export type TimeframeData = Partial<Record<Timeframe, Candle[]>>;

/** Everything the engine needs to produce one signal. */
export interface EngineInput {
  symbol: string;
  /** Scoring inputs for the multi-factor SignalScorer. */
  scoring: ScoringInputs;
  /** Multi-timeframe candles (1D is also used for regime detection). */
  timeframes?: TimeframeData;
  /** Derivatives positioning (optional; missing → neutral). */
  derivatives?: DerivativesInput;
  /** On-chain metrics (optional; missing → neutral/MISSING). */
  onchain?: OnChainInput;
  /** Sentiment (Fear & Greed) (optional). */
  sentiment?: SentimentInput;
  /** Macro (DXY/VIX/S&P/…) (optional). */
  macro?: MacroInput;
  /** Portfolio context for sizing + drawdown gating. */
  portfolio: {
    equity: number;
    current_risk_usd?: number;
    positions?: Array<{ symbol: string; size: number; priceSeries: number[] }>;
  };
  /** OHLCV candles (e.g. 1H) for ATR-based stop/TP. */
  candles: Candle[];
  /** The investor profile that parameterizes every tunable. */
  profile: InvestorProfile;
}

/** The structured engine verdict. */
export interface EngineResult {
  symbol: string;
  action: SignalAction;
  confidence: number;
  /** Highest-severity reason the trade was blocked (when action is NO_TRADE/INSUFFICIENT_DATA). */
  block_reason?: string;
  /** Regime detection result (when available). */
  regime?: Regime;
  /** Multi-timeframe alignment result (when available). */
  alignment?: { score: number; higher_direction: string; penalty: number };
  /** Derivatives / on-chain / sentiment / macro verdicts. */
  derivatives_verdict?: string;
  onchain_verdict?: string;
  sentiment_role?: string;
  macro_environment?: string;
  /** Trade setup (present only when action is BUY/WEAK_BUY/SELL/WEAK_SELL). */
  trade_setup?: {
    entry_price: number;
    stop_loss: number;
    take_profits: Array<{ price: number; percent: number }>;
    risk_reward_ratio: number;
    position_size: number;
    position_size_pct: number;
  };
  /** Full audit trail for explainability. */
  evidence: string[];
}

/** Build a confidence-adjusted action from the scorer, applying macro + alignment penalties. */
function applyConfidencePenalties(
  scorerResult: { action: SignalAction; confidence: number },
  macroReduction: number,
  alignmentPenalty: number,
): { action: SignalAction; confidence: number } {
  let confidence = scorerResult.confidence;
  const totalPenalty = macroReduction + alignmentPenalty;
  if (totalPenalty > 0) {
    confidence = Math.max(0, Math.round(confidence * (1 - totalPenalty / 100)));
  }
  return { action: scorerResult.action, confidence };
}

/** Map a regime enum to the ATR calculator's volatility regime. */
function toVolatilityRegime(regime: Regime): VolatilityRegime {
  switch (regime.regime) {
    case 'HIGH_VOL':
    case 'LIQUIDITY_SHOCK':
      return 'HIGH_VOL';
    case 'LOW_VOL':
      return 'LOW_VOL';
    default:
      return 'NEUTRAL';
  }
}

export class SignalEngine {
  private scorer: SignalScorer;
  private regimeClassifier: RegimeClassifier;
  private mtfAnalyzer: MultiTimeframeAnalyzer;
  private weighter: StrategyWeighter;
  private derivativesAnalyzer: DerivativesAnalyzer;
  private onchainAnalyzer: OnChainAnalyzer;
  private sentimentAnalyzer: SentimentAnalyzer;
  private macroAnalyzer: MacroAnalyzer;

  constructor() {
    this.scorer = new SignalScorer();
    this.regimeClassifier = new RegimeClassifier();
    this.mtfAnalyzer = new MultiTimeframeAnalyzer();
    this.weighter = new StrategyWeighter();
    this.derivativesAnalyzer = new DerivativesAnalyzer();
    this.onchainAnalyzer = new OnChainAnalyzer();
    this.sentimentAnalyzer = new SentimentAnalyzer();
    this.macroAnalyzer = new MacroAnalyzer();
  }

  /** Run the full pipeline and return a structured verdict. */
  evaluate(input: EngineInput): EngineResult {
    const evidence: string[] = [];
    const { profile } = input;

    // 1. Regime detection (1D candles when provided).
    let regime: Regime | undefined;
    if (input.timeframes && input.timeframes['1D'] && input.timeframes['1D']!.length >= 20) {
      regime = this.regimeClassifier.detectRegime(input.timeframes['1D']!);
      evidence.push(`regime: ${regime.regime} (conf ${regime.confidence})`);
    }

    // 2. Multi-timeframe alignment.
    let alignment;
    let alignmentPenalty = 0;
    if (input.timeframes) {
      alignment = this.mtfAnalyzer.analyze(input.timeframes);
      alignmentPenalty = alignment.confidence_penalty;
      evidence.push(
        `multi-TF: alignment ${alignment.alignment_score}%, higher ${alignment.higher_tf_direction}, penalty ${alignmentPenalty}%`,
      );
    }

    // 3. Multi-factor score.
    const scorerResult = this.scorer.score(input.scoring);

    // 4. Macro verdict + confidence reduction.
    let macroReduction = 0;
    let macroEnvironment: string | undefined;
    if (input.macro) {
      const direction =
        scorerResult.action.includes('BUY') ? 'bullish'
        : scorerResult.action.includes('SELL') ? 'bearish'
        : 'neutral';
      const macroResult = this.macroAnalyzer.analyzeMacro(input.macro, direction);
      macroEnvironment = macroResult.macro_environment;
      macroReduction = macroResult.confidence_reduction;
      evidence.push(`macro: ${macroEnvironment} (${macroResult.verdict})`);
    }

    // 5. Derivatives verdict.
    let derivativesVerdict: string | undefined;
    if (input.derivatives) {
      derivativesVerdict = this.derivativesAnalyzer.analyzeDerivatives(input.derivatives).derivatives_verdict;
      evidence.push(`derivatives: ${derivativesVerdict}`);
    }

    // 6. On-chain verdict.
    let onchainVerdict: string | undefined;
    if (input.onchain) {
      const direction =
        scorerResult.action.includes('BUY') ? 'bullish'
        : scorerResult.action.includes('SELL') ? 'bearish'
        : 'neutral';
      onchainVerdict = this.onchainAnalyzer.analyzeOnChain(input.onchain, direction).onchain_verdict;
      evidence.push(`on-chain: ${onchainVerdict}`);
    }

    // 7. Sentiment role.
    let sentimentRole: string | undefined;
    if (input.sentiment) {
      const direction =
        scorerResult.action.includes('BUY') ? 'bullish'
        : scorerResult.action.includes('SELL') ? 'bearish'
        : 'neutral';
      sentimentRole = this.sentimentAnalyzer.analyzeSentiment(input.sentiment, direction).role;
      evidence.push(`sentiment: ${sentimentRole}`);
    }

    // Apply penalties to confidence.
    const penalized = applyConfidencePenalties(scorerResult, macroReduction, alignmentPenalty);

    // 8. Insufficient data gate (scorer-level).
    if (scorerResult.insufficient_data || scorerResult.action === 'INSUFFICIENT_DATA') {
      return {
        symbol: input.symbol,
        action: 'INSUFFICIENT_DATA',
        confidence: 0,
        block_reason: 'insufficient or stale data',
        regime,
        alignment: alignment
          ? { score: alignment.alignment_score, higher_direction: alignment.higher_tf_direction, penalty: alignment.confidence_penalty }
          : undefined,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 9. Profile confirmation gates.
    if (profile.require_multi_timeframe_alignment && alignment && alignment.confirmation_flag === false) {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: 'multi-timeframe alignment required by profile but not confirmed',
        regime,
        alignment: alignment ? { score: alignment.alignment_score, higher_direction: alignment.higher_tf_direction, penalty: alignment.confidence_penalty } : undefined,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }
    if (profile.require_derivatives_confirmation && derivativesVerdict === 'CONTRADICTION') {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: 'derivatives contradiction (required confirmation missing)',
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }
    if (profile.require_on_chain_confirmation && onchainVerdict === 'CONTRADICTION') {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: 'on-chain contradiction (required confirmation missing)',
        regime,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 10. Confidence threshold gate.
    if (penalized.confidence < profile.min_confidence) {
      return {
        symbol: input.symbol,
        action: 'HOLD',
        confidence: penalized.confidence,
        block_reason: `confidence ${penalized.confidence} below profile minimum ${profile.min_confidence}`,
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 11. Drawdown circuit breaker (execution gate only).
    const breaker = new DrawdownCircuitBreaker({ max_drawdown_pct: profile.max_drawdown_pct });
    const breakerResult = breaker.canEnter(input.portfolio.equity);
    if (breakerResult.breached) {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: breakerResult.message,
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 12. Only BUY/SELL-family actions proceed to risk sizing + trade setup.
    const tradeable =
      penalized.action === 'BUY' ||
      penalized.action === 'STRONG_BUY' ||
      penalized.action === 'WEAK_BUY' ||
      penalized.action === 'SELL' ||
      penalized.action === 'STRONG_SELL' ||
      penalized.action === 'WEAK_SELL';

    if (!tradeable) {
      return {
        symbol: input.symbol,
        action: penalized.action,
        confidence: penalized.confidence,
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 13. ATR stop/TP + risk/reward gate.
    const entryPrice = input.scoring.price ?? input.candles[input.candles.length - 1]?.close ?? 0;
    if (entryPrice <= 0 || input.candles.length < 15) {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: 'insufficient candles or invalid entry price for risk calculation',
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    const volRegime = regime ? toVolatilityRegime(regime) : 'NEUTRAL';
    const riskCalc = new ATRBasedRiskCalculator({
      // The profile's stop multiplier is the authoritative baseline; regime still
      // scales it (tighter in low-vol, wider in high-vol).
      neutral_multiplier: profile.stop_atr_multiplier,
      low_vol_multiplier: profile.stop_atr_multiplier * 0.8,
      high_vol_multiplier: profile.stop_atr_multiplier * 1.5,
      tp1_atr_multiple: profile.tp1_atr_multiple,
      tp2_atr_multiple: profile.tp2_atr_multiple,
      min_reward_risk_ratio: profile.min_reward_risk_ratio,
    });
    // Use profile stop multiplier by overriding the neutral multiplier for the current vol regime.
    const riskResult = riskCalc.calculate(input.candles, entryPrice, volRegime);

    if (riskResult.verdict === 'INADEQUATE_RR') {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: `inadequate risk/reward: ${riskResult.rationale}`,
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 14. Volatility-scaled position sizing.
    const sizer = new VolatilityScaledSizer({
      max_position_pct: profile.max_position_pct,
      max_portfolio_risk_pct: profile.max_portfolio_risk_pct,
    });
    const sizeResult = sizer.size({
      candles: input.candles,
      entryPrice,
      portfolioValue: input.portfolio.equity,
      currentPortfolioRisk: input.portfolio.current_risk_usd ?? 0,
      positions: input.portfolio.positions,
    });

    if (sizeResult.action === 'NO_TRADE') {
      return {
        symbol: input.symbol,
        action: 'NO_TRADE',
        confidence: penalized.confidence,
        block_reason: `position sizing rejected: ${sizeResult.rationale}`,
        regime,
        derivatives_verdict: derivativesVerdict,
        onchain_verdict: onchainVerdict,
        sentiment_role: sentimentRole,
        macro_environment: macroEnvironment,
        evidence,
      };
    }

    // 15. Emit tradeable result with full trade setup.
    evidence.push(`ATR stop ${riskResult.stop_price}, TP1 ${riskResult.tp_level1}, TP2 ${riskResult.tp_level2}, R:R ${riskResult.ratio}`);
    evidence.push(`size ${sizeResult.position_size} (${(sizeResult.size_pct_of_portfolio * 100).toFixed(2)}% of portfolio)`);

    return {
      symbol: input.symbol,
      action: penalized.action,
      confidence: penalized.confidence,
      regime,
      alignment: alignment
        ? { score: alignment.alignment_score, higher_direction: alignment.higher_tf_direction, penalty: alignment.confidence_penalty }
        : undefined,
      derivatives_verdict: derivativesVerdict,
      onchain_verdict: onchainVerdict,
      sentiment_role: sentimentRole,
      macro_environment: macroEnvironment,
      trade_setup: {
        entry_price: entryPrice,
        stop_loss: riskResult.stop_price,
        take_profits: [
          { price: riskResult.tp_level1, percent: 0.5 },
          { price: riskResult.tp_level2, percent: 0.5 },
        ],
        risk_reward_ratio: riskResult.ratio,
        position_size: sizeResult.position_size,
        position_size_pct: sizeResult.size_pct_of_portfolio,
      },
      evidence,
    };
  }
}

export default SignalEngine;
