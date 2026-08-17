import React from 'react';
import type { TradeDirection } from '../../types';
import './DirectionSelector.css';

export interface DirectionSelectorProps {
  value: TradeDirection;
  allowed: TradeDirection[];
  disabled?: boolean;
  onChange: (value: TradeDirection) => void;
  ariaLabel: string;
  compact?: boolean;
}

const DIRECTIONS: TradeDirection[] = ['LONG', 'SHORT'];

export function DirectionSelector({
  value,
  allowed,
  disabled = false,
  onChange,
  ariaLabel,
  compact = false,
}: DirectionSelectorProps) {
  return (
    <div
      className={`apex-direction-selector${compact ? ' compact' : ''}`}
      role="group"
      aria-label={ariaLabel}
      data-direction={value.toLowerCase()}
    >
      {DIRECTIONS.map((direction) => {
        const supported = allowed.includes(direction);
        const selected = value === direction;
        return (
          <button
            key={direction}
            type="button"
            className={selected ? 'active' : ''}
            aria-pressed={selected}
            disabled={disabled || !supported}
            title={supported ? `${direction} direction` : `${direction} is not supported by this strategy`}
            onClick={() => supported && onChange(direction)}
          >
            <span aria-hidden="true">{direction === 'LONG' ? '↗' : '↘'}</span>
            {direction}
          </button>
        );
      })}
    </div>
  );
}
