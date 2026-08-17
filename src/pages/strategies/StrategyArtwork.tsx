import React from 'react';

export type StrategyArtworkVariant = 'fusion' | 'trend' | 'funding' | 'breakout' | 'volatility';

export function StrategyArtwork({ variant = 'fusion', className = '', hero = false }: { variant?: StrategyArtworkVariant; className?: string; hero?: boolean }) {
  if (hero || variant === 'fusion') {
    return (
      <svg className={className} viewBox="0 0 188 138" fill="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="strategy-art-green" x1="35" y1="16" x2="144" y2="126" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0A9EAA" /><stop offset=".52" stopColor="#11B981" /><stop offset="1" stopColor="#48D39B" />
          </linearGradient>
        </defs>
        <g stroke="#7BCBC2" strokeWidth="1" strokeLinejoin="round">
          <path d="M78 15 112 35 78 55 44 35 78 15Z" fill="#E8FAF4" fillOpacity=".82" />
          <path d="M44 35v41l34 20V55L44 35Z" fill="#DDF6EC" fillOpacity=".7" />
          <path d="M112 35v41L78 96V55l34-20Z" fill="#A7E6D2" fillOpacity=".65" />
          <path d="m78 35 17 10-17 10-17-10 17-10Z" fill="#77D6B1" fillOpacity=".7" />
          <path d="M61 45v20l17 10V55L61 45Z" fill="#25B982" fillOpacity=".8" />
          <path d="M95 45v20L78 75V55l17-10Z" fill="#0DAA91" fillOpacity=".88" />
          <path d="m44 56 34 20 34-20M61 25v41M95 25v41M44 35l34 20 34-20" />
        </g>
        <g transform="translate(101 54) scale(.72)" stroke="#78C9C1" strokeWidth="1" strokeLinejoin="round">
          <path d="m38 9 30 17-30 17L8 26 38 9Z" fill="#EFFBF7" />
          <path d="M8 26v36l30 17V43L8 26Z" fill="#DDF6EC" />
          <path d="M68 26v36L38 79V43l30-17Z" fill="#A6E7D0" />
          <path d="m38 27 16 9-16 9-16-9 16-9Z" fill="url(#strategy-art-green)" />
          <path d="M22 36v18l16 9V45l-16-9Z" fill="#16B77B" />
          <path d="M54 36v18l-16 9V45l16-9Z" fill="#079D8C" />
        </g>
      </svg>
    );
  }

  if (variant === 'trend') {
    return (
      <svg className={className} viewBox="0 0 74 62" fill="none" aria-hidden="true" focusable="false">
        <path d="M5 52h64" stroke="#C9E9DB" />
        <path d="M8 48 20 39l10 4 12-18 9 6 15-22" stroke="#11A977" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 48 20 39l10 4 12-18 9 6 15-22v39H8Z" fill="#DDF7EA" fillOpacity=".75" />
        <circle cx="42" cy="25" r="3" fill="#11A977" />
      </svg>
    );
  }

  if (variant === 'funding') {
    return (
      <svg className={className} viewBox="0 0 74 62" fill="none" aria-hidden="true" focusable="false">
        <circle cx="37" cy="31" r="22" fill="#EAF9F4" stroke="#8CD5C1" />
        <path d="M37 9c10 8 14 16 14 22 0 8-5 16-14 22V9Z" fill="#35C88E" fillOpacity=".68" />
        <path d="M37 9c-7 8-11 15-11 22 0 7 4 14 11 22" stroke="#0B9D84" strokeWidth="1.4" />
        <path d="M18 31h38" stroke="#8CD5C1" />
      </svg>
    );
  }

  if (variant === 'breakout') {
    return (
      <svg className={className} viewBox="0 0 74 62" fill="none" aria-hidden="true" focusable="false">
        <path d="M7 52h60M13 50V35h10v15M29 50V27h10v23M45 50V17h10v33" fill="#E5F8EF" stroke="#8DD8BE" />
        <path d="m12 44 14-10 10 3 20-24" stroke="#12AF79" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m52 13 7-3-2 7" stroke="#12AF79" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 74 62" fill="none" aria-hidden="true" focusable="false">
      <path d="M7 31c7-17 14-17 21 0s14 17 21 0 13-17 18 0" stroke="#12AA7C" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M7 31c7-17 14-17 21 0s14 17 21 0 13-17 18 0v22H7V31Z" fill="#DFF7EB" fillOpacity=".8" />
      <path d="M9 45h56" stroke="#B8E6D5" />
    </svg>
  );
}
