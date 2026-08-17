import { useCallback, useState } from 'react';
import type { BacktestResult, TradeDirection } from '../../types';
import type { BacktestInterval, BacktestRiskProfile } from './backtestingTypes';
import { deletePreset, loadNotes, loadPresets, saveNote, savePreset } from './backtestPersistence';
import type { BacktestNote, BacktestPresetConfig, BacktestSavedPreset } from './backtestPersistence';
import { INTERVAL_OPTIONS, STRATEGY_PRESETS, clampNumber, defaultParameters } from './backtestingPresets';

interface UseBacktestingPresetsAndNotesOptions {
  strategyId: string;
  symbol: string;
  direction: TradeDirection;
  interval: BacktestInterval;
  bars: number;
  maxHoldBars: number;
  capital: number;
  riskProfile: BacktestRiskProfile;
  commissionPct: number;
  slippagePct: number;
  fundingPct: number;
  parameters: Record<string, number | string>;
  loading: boolean;
  onSelectSymbol: (symbol: string) => void;
  setStrategyId: (id: string) => void;
  setSymbol: (symbol: string) => void;
  setDirection: (direction: TradeDirection) => void;
  setInterval: (interval: BacktestInterval) => void;
  setBars: (bars: number) => void;
  setMaxHoldBars: (bars: number) => void;
  setCapital: (capital: number) => void;
  setRiskProfile: (profile: BacktestRiskProfile) => void;
  setCommissionPct: (pct: number) => void;
  setSlippagePct: (pct: number) => void;
  setFundingPct: (pct: number) => void;
  setParameters: React.Dispatch<React.SetStateAction<Record<string, number | string>>>;
  parameterOverrideRef: React.MutableRefObject<boolean>;
  previousStrategyIdRef: React.MutableRefObject<string>;
  result: BacktestResult | null;
  completedConfig: { strategyId: string } | null;
}

export function useBacktestingPresetsAndNotes({
  strategyId, symbol, direction, interval, bars, maxHoldBars, capital, riskProfile,
  commissionPct, slippagePct, fundingPct, parameters, loading, onSelectSymbol,
  setStrategyId, setSymbol, setDirection, setInterval, setBars, setMaxHoldBars,
  setCapital, setRiskProfile, setCommissionPct, setSlippagePct, setFundingPct,
  setParameters, parameterOverrideRef, previousStrategyIdRef, result, completedConfig,
}: UseBacktestingPresetsAndNotesOptions) {
  const [presets, setPresets] = useState<BacktestSavedPreset[]>(loadPresets);
  const [notes, setNotes] = useState<Record<string, BacktestNote>>(loadNotes);

  const handleSavePreset = useCallback((name: string) => {
    const config: BacktestPresetConfig = {
      strategyId, symbol, direction, interval, bars, maxHoldBars, capital, riskProfile,
      commissionPct, slippagePct, fundingPct, parameters,
    };
    setPresets((current) => savePreset(current, name, config));
  }, [bars, capital, commissionPct, direction, fundingPct, interval, maxHoldBars, parameters, riskProfile, slippagePct, strategyId, symbol]);

  const handleDeletePreset = useCallback((id: string) => {
    setPresets((current) => deletePreset(current, id));
  }, []);

  const handleApplyPreset = useCallback((preset: BacktestSavedPreset) => {
    if (loading) return;
    const c = preset.config;
    const targetStrategy = STRATEGY_PRESETS.find((candidate) => candidate.id === c.strategyId && !candidate.disabled);
    if (!targetStrategy) return;
    const targetIntervals = targetStrategy.supportedIntervals.length ? targetStrategy.supportedIntervals : INTERVAL_OPTIONS;
    const targetInterval = targetIntervals.includes(c.interval) ? c.interval : targetIntervals[0];
    const targetDirection = targetStrategy.allowedDirections.includes(c.direction) ? c.direction : targetStrategy.allowedDirections[0];
    previousStrategyIdRef.current = targetStrategy.id;
    setStrategyId(targetStrategy.id);
    setSymbol(c.symbol);
    onSelectSymbol(c.symbol);
    setDirection(targetDirection);
    setInterval(targetInterval);
    setBars(clampNumber(c.bars, 2_000, 100, 25_000));
    setMaxHoldBars(clampNumber(c.maxHoldBars, 72, 1, 2_000));
    setCapital(clampNumber(c.capital, 100_000, 100, 1_000_000_000));
    setRiskProfile(c.riskProfile);
    setCommissionPct(clampNumber(c.commissionPct, 0.04, 0, 5));
    setSlippagePct(clampNumber(c.slippagePct, 0.05, 0, 5));
    setFundingPct(clampNumber(c.fundingPct, 0.01, 0, 5));
    parameterOverrideRef.current = true;
    setParameters({ ...defaultParameters(targetStrategy), ...c.parameters });
  }, [loading, onSelectSymbol, previousStrategyIdRef, setBars, setCapital, setCommissionPct, setDirection, setFundingPct, setInterval, setMaxHoldBars, setParameters, setRiskProfile, setSlippagePct, setStrategyId, setSymbol, parameterOverrideRef]);

  const handleSaveNote = useCallback((text: string) => {
    const runId = result?.audit?.runId;
    if (!runId) return;
    setNotes((current) => saveNote(current, runId, text, {
      strategyId: completedConfig?.strategyId,
      symbol: result?.symbol,
      direction: result?.direction,
      interval: result?.interval,
    }));
  }, [completedConfig, result]);

  const handleClearNote = useCallback(() => {
    const runId = result?.audit?.runId;
    if (!runId) return;
    setNotes((current) => saveNote(current, runId, ''));
  }, [result]);

  return {
    presets,
    notes,
    handleSavePreset,
    handleDeletePreset,
    handleApplyPreset,
    handleSaveNote,
    handleClearNote,
  };
}
