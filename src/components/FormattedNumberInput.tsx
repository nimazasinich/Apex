import React, { useEffect, useState } from 'react';
import { formatInputNumber, parseFormattedNumber } from '../lib/marketPresentation';

interface FormattedNumberInputProps {
  value: number | null;
  onValueChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  maximumFractionDigits?: number;
  ariaLabel?: string;
  suffix?: string;
  steppers?: boolean;
}

function clamp(value: number, min?: number, max?: number) {
  if (min != null && value < min) return min;
  if (max != null && value > max) return max;
  return value;
}

export function FormattedNumberInput({
  value,
  onValueChange,
  placeholder,
  disabled,
  min,
  max,
  step = 1,
  maximumFractionDigits = 8,
  ariaLabel,
  suffix,
  steppers = false,
}: FormattedNumberInputProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(formatInputNumber(value, maximumFractionDigits));

  useEffect(() => {
    if (!focused) setText(formatInputNumber(value, maximumFractionDigits));
  }, [focused, maximumFractionDigits, value]);

  const commit = (nextText: string) => {
    const parsed = parseFormattedNumber(nextText);
    if (parsed == null) {
      onValueChange(null);
      setText('');
      return;
    }
    const next = clamp(parsed, min, max);
    onValueChange(next);
    setText(formatInputNumber(next, maximumFractionDigits));
  };

  const adjust = (direction: -1 | 1) => {
    if (disabled) return;
    const current = parseFormattedNumber(text) ?? value ?? min ?? 0;
    const precision = 10 ** maximumFractionDigits;
    const next = clamp(Math.round((current + direction * step) * precision) / precision, min, max);
    onValueChange(next);
    setText(focused ? String(next) : formatInputNumber(next, maximumFractionDigits));
  };

  return (
    <div className={`apex-number-input${disabled ? ' disabled' : ''}${steppers ? ' with-steppers' : ''}`}>
      <input
        type="text"
        inputMode={maximumFractionDigits === 0 ? 'numeric' : 'decimal'}
        autoComplete="off"
        aria-label={ariaLabel}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={(event) => {
          setFocused(true);
          setText(value == null ? '' : String(value));
          window.requestAnimationFrame(() => event.currentTarget.select());
        }}
        onChange={(event) => {
          const nextText = event.target.value;
          setText(nextText);
          const parsed = parseFormattedNumber(nextText);
          if (parsed != null) onValueChange(clamp(parsed, min, max));
          else if (!nextText.trim()) onValueChange(null);
        }}
        onBlur={() => {
          setFocused(false);
          commit(text);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'ArrowUp') { event.preventDefault(); adjust(1); }
          if (event.key === 'ArrowDown') { event.preventDefault(); adjust(-1); }
        }}
      />
      {suffix && <span className="apex-number-suffix">{suffix}</span>}
      {steppers && !disabled && (
        <span className="apex-number-steppers">
          <button type="button" tabIndex={-1} aria-label={`Decrease ${ariaLabel || 'value'}`} onMouseDown={(event) => event.preventDefault()} onClick={() => adjust(-1)}>−</button>
          <button type="button" tabIndex={-1} aria-label={`Increase ${ariaLabel || 'value'}`} onMouseDown={(event) => event.preventDefault()} onClick={() => adjust(1)}>+</button>
        </span>
      )}
    </div>
  );
}
