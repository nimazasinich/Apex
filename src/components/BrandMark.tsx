import React from 'react';

export interface BrandMarkProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * APEX brand mark. The same public SVG is used by the application shell and
 * browser favicon so the identity cannot drift between surfaces.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 28,
  className = '',
  title = 'APEX',
}) => (
  <img
    src="/apex-logo.svg"
    width={size}
    height={size}
    className={className}
    alt={title}
    draggable={false}
  />
);
