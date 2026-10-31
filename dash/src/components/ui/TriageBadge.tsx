import React from 'react';
import type { Triage } from '../../types/contracts';
import { getTriageConfig } from '../../lib/triage';

interface TriageBadgeProps {
  triage: Triage;
  count?: number;
  showLabel?: boolean;
  className?: string;
}

/** Pill with the triage letter (never colour alone), an optional counter and label. */
export const TriageBadge: React.FC<TriageBadgeProps> = ({ triage, count, showLabel = false, className = '' }) => {
  const config = getTriageConfig(triage);

  return (
    <div
      className={`inline-flex items-center gap-1.5 pl-1 pr-3 h-7 rounded-full font-bold text-xs select-none ${className}`}
      style={{ backgroundColor: config.bgVar, color: config.textVar }}
      title={config.fullLabel}
      aria-label={`${config.label} ${count !== undefined ? count : ''}`}
    >
      <span className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center font-mono text-[11px] font-black">{config.letter}</span>
      {count !== undefined && <span className="text-sm tabular-nums font-extrabold">{count}</span>}
      {showLabel && <span className="font-bold tracking-wide">{config.label}</span>}
    </div>
  );
};
