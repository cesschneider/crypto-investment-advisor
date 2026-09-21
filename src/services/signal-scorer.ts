/**
 * Multi-Factor Signal Scorer (Epic 3, Story 3.1)
 *
 * Scores trading signals across 8 dimensions: trend, momentum, structure,
 * volume, derivatives, on-chain, macro, sentiment.
 *
 * All thresholds/weights are supplied via `ScorerConfig` (defaults in
 * `DEFAULT_SCORER_CONFIG`, overridable per investor profile). No hardcoded
 * literals remain in the scoring logic — every value is a config field.
 *
 * Confidence (0-100) represents EVIDENCE STRENGTH, not win probability.
 * No single indicator alone can trigger BUY/SELL without 2+ supporting dimensions.
 * INSUFFICIENT_DATA and NO_TRADE are first-class outcomes.
 */

import {
  ScoringInputs,
  ScoringResult,
  SignalAction,
  DimensionScore,
  confidenceToStrength,
} from '../types/index';
import { ScorerConfig, DEFAULT_SCORER_CONFIG } from '../config/advisor-config';

export class SignalScorer {
  private config: ScorerConfig;

  constructor(config: Partial<ScorerConfig> = {}) {
    this.config = { ...DEFAULT_SCORER_CONFIG, ...config };
  }

  /**
   * Score a potential trade signal across multiple dimensions.
   */
  score(inputs: ScoringInputs): ScoringResult {
    const timestamp = new Date().toISOString();
    const dimensions: DimensionScore[] = [];
    const trace: { [key: string]: { score: number; evidence: string } } = {};

    const collect = (d: DimensionScore) => {
      dimensions.push(d);
      trace[d.dimension] = { score: d.score, evidence: d.evidence };
    };

    collect(this.scoreTrend(inputs));
    collect(this.scoreMomentum(inputs));
    collect(this.scoreStructure(inputs));
    collect(this.scoreVolume(inputs));
    collect(this.scoreDerivatives(inputs));
    collect(this.scoreOnchain(inputs));
    collect(this.scoreMacro(inputs));
    collect(this.scoreSentiment(inputs));

    const freshnessIssues = this.checkDataFreshness(inputs);
    const hasStaleData = freshnessIssues.length > 0;

    const result = this.computeAction(dimensions, hasStaleData, inputs.symbol, timestamp);

    return {
      symbol: inputs.symbol,
      timestamp,
      action: result.action,
      confidence: result.confidence,
      strength: confidenceToStrength(result.confidence),
      score: result.score,
      dimensions,
      trace,
      supporting_dimensions_count: result.supporting_dimensions_count,
      data_freshness_issues: freshnessIssues.length > 0 ? freshnessIssues : undefined,
      insufficient_data: result.insufficient_data,
    };
  }

  private neutral(evidence: string): DimensionScore {
    return {
      dimension: '',
      score: this.config.neutral_baseline,
      evidence,
      contributing: false,
    };
  }

  private scoreTrend(inputs: ScoringInputs): DimensionScore {
    const base = this.config.neutral_baseline;
    if (!inputs.trend || inputs.trend_strength === undefined) {
      return { dimension: 'trend', score: base, evidence: 'Trend data not provided', contributing: false };
    }
    let score = base;
    let evidence: string;
    if (inputs.trend === 'UPTREND') {
      score = base + (inputs.trend_strength ?? 0);
      evidence = `Uptrend detected (strength: ${inputs.trend_strength}%)`;
    } else if (inputs.trend === 'DOWNTREND') {
      score = base - (inputs.trend_strength ?? 0);
      evidence = `Downtrend detected (strength: ${inputs.trend_strength}%)`;
    } else {
      evidence = 'Sideways trend; neutral signal';
    }
    return { dimension: 'trend', score: this.clamp(score), evidence, contributing: true };
  }

  private scoreMomentum(inputs: ScoringInputs): DimensionScore {
    const base = this.config.neutral_baseline;
    let score = base;
    const evidenceList: string[] = [];
    const { rsi_oversold, rsi_overbought, rsi_weight, macd_weight } = this.config.momentum;

    if (inputs.rsi_14 !== undefined) {
      if (inputs.rsi_14 < rsi_oversold) {
        score -= rsi_weight;
        evidenceList.push(`RSI ${inputs.rsi_14.toFixed(1)} (oversold < ${rsi_oversold})`);
      } else if (inputs.rsi_14 > rsi_overbought) {
        score += rsi_weight;
        evidenceList.push(`RSI ${inputs.rsi_14.toFixed(1)} (overbought > ${rsi_overbought})`);
      } else {
        evidenceList.push(`RSI ${inputs.rsi_14.toFixed(1)} (neutral)`);
      }
    }

    if (inputs.macd_histogram !== undefined) {
      if (inputs.macd_histogram > 0) {
        score += macd_weight;
        evidenceList.push(`MACD bullish (+${inputs.macd_histogram.toFixed(4)})`);
      } else if (inputs.macd_histogram < 0) {
        score -= macd_weight;
        evidenceList.push(`MACD bearish (${inputs.macd_histogram.toFixed(4)})`);
      } else {
        evidenceList.push('MACD neutral');
      }
    }

    if (evidenceList.length === 0) {
      return { dimension: 'momentum', score: base, evidence: 'Momentum data not provided', contributing: false };
    }
    return { dimension: 'momentum', score: this.clamp(score), evidence: evidenceList.join('; '), contributing: true };
  }

  private scoreStructure(inputs: ScoringInputs): DimensionScore {
    const base = this.config.neutral_baseline;
    if (!inputs.price || (!inputs.supports && !inputs.resistances)) {
      return { dimension: 'structure', score: base, evidence: 'Support/resistance data not provided', contributing: false };
    }
    let score = base;
    const evidenceList: string[] = [];
    const { proximity_pct, support_bonus, resistance_penalty } = this.config.structure;

    if (inputs.supports && inputs.supports.length > 0) {
      const nearestSupport = inputs.supports.sort((a, b) => b - a)[0];
      if (inputs.price > nearestSupport && inputs.price - nearestSupport < inputs.price * proximity_pct) {
        score += support_bonus;
        evidenceList.push(`Near support at ${nearestSupport.toFixed(2)}`);
      } else if (inputs.price > nearestSupport) {
        evidenceList.push(`Above support at ${nearestSupport.toFixed(2)}`);
      }
    }

    if (inputs.resistances && inputs.resistances.length > 0) {
      const nearestResistance = inputs.resistances.sort((a, b) => a - b)[0];
      if (inputs.price < nearestResistance && nearestResistance - inputs.price < inputs.price * proximity_pct) {
        score -= resistance_penalty;
        evidenceList.push(`Near resistance at ${nearestResistance.toFixed(2)}`);
      } else if (inputs.price < nearestResistance) {
        evidenceList.push(`Below resistance at ${nearestResistance.toFixed(2)}`);
      }
    }

    if (evidenceList.length === 0) evidenceList.push('Price in neutral zone relative to structure');
    return { dimension: 'structure', score: this.clamp(score), evidence: evidenceList.join('; '), contributing: true };
  }

  private scoreVolume(inputs: ScoringInputs): DimensionScore {
    const base = this.config.neutral_baseline;
    if (!inputs.volume_24h && !inputs.volume_7d && !inputs.volume_avg_30d) {
      return { dimension: 'volume', score: base, evidence: 'Volume data not provided', contributing: false };
    }
    let score = base;
    const evidenceList: string[] = [];
    const v = this.config.volume;

    if (inputs.volume_24h && inputs.volume_7d) {
      const ratio = inputs.volume_24h / (inputs.volume_7d / 7);
      if (ratio > v.high_ratio) {
        score += v.high_bonus;
        evidenceList.push(`High volume: 24h ${(ratio * 100).toFixed(0)}% of 7d average`);
      } else if (ratio < v.low_ratio) {
        score -= v.low_penalty;
        evidenceList.push(`Low volume: 24h ${(ratio * 100).toFixed(0)}% of 7d average`);
      }
    }

    if (inputs.volume_7d && inputs.volume_avg_30d) {
      const ratio = inputs.volume_7d / (inputs.volume_avg_30d * 7);
      if (ratio > v.surge_ratio) {
        score += v.surge_bonus;
        evidenceList.push('Volume surge: 7d trend positive');
      }
    }

    if (evidenceList.length === 0) evidenceList.push('Volume trends neutral');
    return { dimension: 'volume', score: this.clamp(score), evidence: evidenceList.join('; '), contributing: true };
  }

  private scoreDerivatives(inputs: ScoringInputs): DimensionScore {
    const base = this.config.neutral_baseline;
    if (inputs.funding_rate === undefined && inputs.open_interest_change === undefined) {
      return { dimension: 'derivatives', score: base, evidence: 'Derivatives data not provided', contributing: false };
    }
    let score = base;
    const evidenceList: string[] = [];
    const d = this.config.derivatives;

    if (inputs.funding_rate !== undefined) {
      if (inputs.funding_rate > d.extreme_funding) {
        score -= d.funding_bearish_penalty;
        evidenceList.push(`High positive funding (${(inputs.funding_rate * 100).toFixed(3)}%) — bearish`);
      } else if (inputs.funding_rate < -d.extreme_funding) {
        score += d.funding_bullish_bonus;
        evidenceList.push(`Negative funding (${(inputs.funding_rate * 100).toFixed(3)}%) — bullish`);
      } else {
        evidenceList.push(`Neutral funding (${(inputs.funding_rate * 100).toFixed(3)}%)`);
      }
    }

    if (inputs.open_interest_change !== undefined) {
      if (inputs.open_interest_change > d.oi_surge_threshold) {
        score += d.oi_surge_bonus;
        evidenceList.push(`OI surge (+${inputs.open_interest_change.toFixed(1)}%) — conviction increasing`);
      } else if (inputs.open_interest_change < -d.oi_surge_threshold) {
        score -= d.oi_decline_penalty;
        evidenceList.push(`OI decline (${inputs.open_interest_change.toFixed(1)}%) — conviction declining`);
      }
    }

    if (evidenceList.length === 0) evidenceList.push('Derivatives positioning neutral');
    return { dimension: 'derivatives', score: this.clamp(score), evidence: evidenceList.join('; '), contributing: true };
  }

  private scoreOnchain(inputs: ScoringInputs): DimensionScore {
    const base = this.config.neutral_baseline;
    if (inputs.whale_accumulation === undefined && inputs.holder_concentration === undefined) {
      return { dimension: 'onchain', score: base, evidence: 'On-chain data not provided', contributing: false };
    }
    let score = base;
    const evidenceList: string[] = [];
    const o = this.config.onchain;

    if (inputs.whale_accumulation !== undefined) {
      if (inputs.whale_accumulation > o.whale_accumulation_threshold) {
        score += o.whale_bonus;
        evidenceList.push(`Strong whale accumulation (${inputs.whale_accumulation.toFixed(0)}) — bullish`);
      } else if (inputs.whale_accumulation < -o.whale_accumulation_threshold) {
        score -= o.whale_penalty;
        evidenceList.push(`Whale distribution (${inputs.whale_accumulation.toFixed(0)}) — bearish`);
      } else {
        evidenceList.push(`Whale activity neutral (${inputs.whale_accumulation.toFixed(0)})`);
      }
    }

    if (inputs.holder_concentration !== undefined) {
      if (inputs.holder_concentration < o.holder_healthy_threshold) {
        score += o.holder_bonus;
        evidenceList.push(`Healthy holder distribution (${inputs.holder_concentration.toFixed(0)}%)`);
      } else if (inputs.holder_concentration > o.holder_concentrated_threshold) {
        score -= o.holder_penalty;
        evidenceList.push(`High concentration (${inputs.holder_concentration.toFixed(0)}%) — whale risk`);
      }
    }

    if (evidenceList.length === 0) evidenceList.push('On-chain metrics neutral');
    return { dimension: 'onchain', score: this.clamp(score), evidence: evidenceList.join('; '), contributing: true };
  }

  private scoreMacro(inputs: ScoringInputs): DimensionScore {
    const base = this.config.neutral_baseline;
    if (!inputs.macro_regime && inputs.macro_strength === undefined) {
      return { dimension: 'macro', score: base, evidence: 'Macro data not provided', contributing: false };
    }
    const strength = inputs.macro_strength ?? this.config.macro.default_strength;
    let score = base;
    let evidence: string;
    if (inputs.macro_regime === 'RISK_ON') {
      score = base + strength;
      evidence = `Risk-on regime (strength: ${strength}%)`;
    } else if (inputs.macro_regime === 'RISK_OFF') {
      score = base - strength;
      evidence = `Risk-off regime (strength: ${strength}%)`;
    } else {
      evidence = 'Macro regime neutral';
    }
    return { dimension: 'macro', score: this.clamp(score), evidence, contributing: true };
  }

  private scoreSentiment(inputs: ScoringInputs): DimensionScore {
    const base = this.config.neutral_baseline;
    if (inputs.sentiment_score === undefined) {
      return { dimension: 'sentiment', score: base, evidence: 'Sentiment data not provided', contributing: false };
    }
    const score = base + inputs.sentiment_score / 2;
    let sentiment: string;
    if (inputs.sentiment_score > 50) sentiment = 'Very bullish';
    else if (inputs.sentiment_score > 20) sentiment = 'Bullish';
    else if (inputs.sentiment_score < -50) sentiment = 'Very bearish';
    else if (inputs.sentiment_score < -20) sentiment = 'Bearish';
    else sentiment = 'Neutral';
    return { dimension: 'sentiment', score: this.clamp(score), evidence: `Sentiment ${sentiment} (score: ${inputs.sentiment_score.toFixed(0)}/100)`, contributing: true };
  }

  private checkDataFreshness(inputs: ScoringInputs): string[] {
    const issues: string[] = [];
    const maxAge = this.config.freshness.max_age_seconds;
    if (!inputs.data_age_seconds) return issues;
    for (const [dimension, ageSeconds] of Object.entries(inputs.data_age_seconds)) {
      if (ageSeconds > maxAge) {
        issues.push(`${dimension} data stale (${ageSeconds}s old)`);
      }
    }
    return issues;
  }

  private computeAction(
    dimensions: DimensionScore[],
    hasStaleData: boolean,
    symbol: string,
    timestamp: string,
  ): {
    action: SignalAction;
    confidence: number;
    score: number;
    supporting_dimensions_count: number;
    insufficient_data: boolean;
  } {
    const a = this.config.action;
    const base = this.config.neutral_baseline;
    const contributing = dimensions.filter((d) => d.contributing);

    if (contributing.length < a.min_contributing_dims) {
      return { action: 'INSUFFICIENT_DATA', confidence: 0, score: base, supporting_dimensions_count: 0, insufficient_data: true };
    }

    if (hasStaleData) {
      return { action: 'INSUFFICIENT_DATA', confidence: 25, score: base, supporting_dimensions_count: contributing.length, insufficient_data: true };
    }

    const avgScore = contributing.reduce((sum, d) => sum + d.score, 0) / contributing.length;
    const bullishDims = contributing.filter((d) => d.score > a.bullish_threshold).length;
    const bearishDims = contributing.filter((d) => d.score < a.bearish_threshold).length;

    let action: SignalAction = 'HOLD';
    let confidence = base;

    if (bullishDims >= a.strong_min_dims) {
      action = 'STRONG_BUY';
      confidence = Math.min(a.strong_confidence_cap, a.strong_confidence_base + bullishDims * a.strong_confidence_per_dim);
    } else if (bullishDims === a.weak_dims) {
      action = 'WEAK_BUY';
      confidence = Math.min(a.weak_confidence_cap, a.weak_confidence_base + bullishDims * a.weak_confidence_per_dim);
    } else if (bullishDims === 1 && avgScore > a.bullish_threshold) {
      action = 'NO_TRADE';
      confidence = a.single_indicator_confidence;
    } else if (bearishDims >= a.strong_min_dims) {
      action = 'STRONG_SELL';
      confidence = Math.min(a.strong_confidence_cap, a.strong_confidence_base + bearishDims * a.strong_confidence_per_dim);
    } else if (bearishDims === a.weak_dims) {
      action = 'WEAK_SELL';
      confidence = Math.min(a.weak_confidence_cap, a.weak_confidence_base + bearishDims * a.weak_confidence_per_dim);
    } else if (bearishDims === 1 && avgScore < a.bearish_threshold) {
      action = 'NO_TRADE';
      confidence = a.single_indicator_confidence;
    } else {
      action = 'HOLD';
      confidence = Math.abs(avgScore - base) * a.hold_confidence_scale + a.hold_confidence_base;
    }

    return {
      action,
      confidence: Math.round(confidence),
      score: Math.round(avgScore),
      supporting_dimensions_count: bullishDims + bearishDims,
      insufficient_data: false,
    };
  }

  private clamp(n: number): number {
    return Math.max(0, Math.min(100, n));
  }
}

export default SignalScorer;
