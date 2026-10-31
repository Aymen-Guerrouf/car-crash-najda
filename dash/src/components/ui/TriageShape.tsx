import React from 'react';
import type { Triage } from '../../types/contracts';
import { getTriageConfig } from '../../lib/triage';

interface Props {
  triage: Triage | string | undefined;
  size?: number;
  /** White outline, for markers that sit on the map. */
  ring?: boolean;
  className?: string;
}

/**
 * One shape per severity so colour is never the only signal (design): rouge = disc, jaune = triangle,
 * vert = square, inconnu = diamond. The letter sits inside.
 */
export const TriageShape: React.FC<Props> = ({ triage, size = 28, ring = false, className }) => {
  const t = getTriageConfig(triage);
  const stroke = ring ? '#fff' : 'none';
  const sw = ring ? 2.5 : 0;
  let body: React.ReactNode;
  let labelY = 20.5;
  switch (t.shape) {
    case 'circle':
      body = <circle cx="16" cy="16" r="13.5" fill={t.bgVar} stroke={stroke} strokeWidth={sw} />;
      break;
    case 'diamond': // the yellow triangle
      body = <path d="M16 3.5 29 27.5H3Z" fill={t.bgVar} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />;
      labelY = 23.5;
      break;
    case 'square':
      body = <rect x="3" y="3" width="26" height="26" rx="6" fill={t.bgVar} stroke={stroke} strokeWidth={sw} />;
      break;
    default: // unknown: diamond
      body = <rect x="7" y="7" width="18" height="18" rx="3.5" transform="rotate(45 16 16)" fill={t.bgVar} stroke={stroke} strokeWidth={sw} />;
  }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={t.fullLabel}>
      {body}
      <text x="16" y={labelY} textAnchor="middle" fontSize="13" fontWeight="800" fontFamily="Montserrat, sans-serif" fill={t.textVar}>
        {t.letter}
      </text>
    </svg>
  );
};
