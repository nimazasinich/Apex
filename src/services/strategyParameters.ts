import type { StrategyDefinition, StrategyParameterDefinition } from '../types';

export type StrategyParameterValues = Record<string, number | string>;

export function readStrategyParameterValue(
  parameter: StrategyParameterDefinition,
  values: Record<string, unknown> | null | undefined,
): unknown {
  if (!values) return undefined;
  if (Object.prototype.hasOwnProperty.call(values, parameter.key)) return values[parameter.key];
  for (const legacyKey of parameter.legacyKeys || []) {
    if (Object.prototype.hasOwnProperty.call(values, legacyKey)) return values[legacyKey];
  }
  return undefined;
}

export function normalizeStrategyParameterAliases(
  definition: StrategyDefinition,
  values: StrategyParameterValues | null | undefined,
): StrategyParameterValues {
  const normalized: StrategyParameterValues = { ...(values || {}) };
  for (const parameter of definition.parameters) {
    if (Object.prototype.hasOwnProperty.call(normalized, parameter.key)) continue;
    const legacyValue = readStrategyParameterValue(parameter, normalized);
    if (typeof legacyValue === 'number' || typeof legacyValue === 'string') {
      normalized[parameter.key] = legacyValue;
    }
  }
  return normalized;
}

export function buildStrategyParameterValues(
  definition: StrategyDefinition,
  values: StrategyParameterValues | null | undefined,
): StrategyParameterValues {
  // Normalize caller/saved-profile aliases BEFORE defaults are materialized.
  // Otherwise a canonical default already present in the merged object masks a
  // legacy value (for example squeezeLookback would never override widthLookback).
  const normalizedOverrides = normalizeStrategyParameterAliases(definition, values);
  return {
    ...Object.fromEntries(definition.parameters.map((parameter) => [parameter.key, parameter.default])),
    ...normalizedOverrides,
  };
}

export type StrategyParameterValidationResult =
  | { ok: true; values: StrategyParameterValues }
  | { ok: false; error: 'unknown_parameter' | 'non_finite_parameter' | 'out_of_range_parameter' | 'invalid_string_parameter'; parameter: string };

/**
 * Canonical definition-aware parameter coercion for public strategy APIs.
 * Unknown keys are rejected, legacy aliases are accepted, numeric values must
 * be finite and fall within the declared min/max, and strings are length
 * bounded. Returned keys are canonical definition keys only.
 */
export function validateStrategyParameterValues(
  definition: StrategyDefinition,
  values: Record<string, unknown> | null | undefined,
  options: { materializeDefaults?: boolean } = {},
): StrategyParameterValidationResult {
  const raw = values || {};
  const allowed = new Set<string>();
  for (const parameter of definition.parameters) {
    allowed.add(parameter.key);
    for (const legacyKey of parameter.legacyKeys || []) allowed.add(legacyKey);
  }
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) return { ok: false, error: 'unknown_parameter', parameter: key };
  }

  const canonical: StrategyParameterValues = {};
  const materializeDefaults = options.materializeDefaults !== false;
  for (const parameter of definition.parameters) {
    const supplied = readStrategyParameterValue(parameter, raw);
    if (supplied === undefined && !materializeDefaults) continue;
    const value = supplied ?? parameter.default;
    if (typeof parameter.default === 'number') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return { ok: false, error: 'non_finite_parameter', parameter: parameter.key };
      const min = parameter.min ?? Number.NEGATIVE_INFINITY;
      const max = parameter.max ?? Number.POSITIVE_INFINITY;
      if (numeric < min || numeric > max) {
        return { ok: false, error: 'out_of_range_parameter', parameter: parameter.key };
      }
      canonical[parameter.key] = numeric;
    } else {
      if (typeof value !== 'string' && typeof value !== 'number') {
        return { ok: false, error: 'invalid_string_parameter', parameter: parameter.key };
      }
      canonical[parameter.key] = String(value).slice(0, 160);
    }
  }
  return { ok: true, values: canonical };
}
