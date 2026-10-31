import React, { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { TriageShape } from '../ui/TriageShape';
import type { ConnectionStatus } from './ConnectionBanner';
import { config } from '../../config';
import type { Triage } from '../../types/contracts';

interface TopBarProps {
  connectionStatus?: ConnectionStatus;
  redCount?: number;
  yellowCount?: number;
  greenCount?: number;
  unknownCount?: number;
  mciCount?: number;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
}

const LABELS: Record<Triage, string> = { RED: 'Rouge', YELLOW: 'Jaune', GREEN: 'Vert', UNKNOWN: 'Inconnu' };

export const TopBar: React.FC<TopBarProps> = ({
  connectionStatus = 'connecting',
  redCount = 0,
  yellowCount = 0,
  greenCount = 0,
  unknownCount = 0,
  mciCount = 0,
  soundEnabled = false,
  onToggleSound,
}) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeStr = now.toLocaleTimeString('fr-FR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const online = connectionStatus === 'open';
  const connectionText = online ? 'Connecté' : connectionStatus === 'closed' ? 'Déconnecté' : 'Reconnexion';
  const dot = online ? 'bg-triage-green' : connectionStatus === 'closed' ? 'bg-triage-red' : 'bg-triage-yellow animate-pulse';

  const counts: [Triage, number][] = [
    ['RED', redCount],
    ['YELLOW', yellowCount],
    ['GREEN', greenCount],
    ['UNKNOWN', unknownCount],
  ];

  return (
    <header className="h-[72px] shrink-0 bg-surface border-b border-border px-6 flex items-center gap-6 select-none">
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-medium tracking-tight text-text">Nadjda</span>
        {config.useMock && <span className="text-[10px] font-bold text-info uppercase tracking-wider">démo</span>}
      </div>

      <div className="flex items-center gap-6" aria-label="Compteurs de triage">
        {counts.map(([triage, n]) => (
          <div key={triage} className="flex items-center gap-2.5" aria-label={`${LABELS[triage]} ${n}`}>
            <TriageShape triage={triage} size={26} />
            <span className="text-[26px] leading-none font-extrabold tabular-nums">{n}</span>
            <span className="text-[11px] font-bold tracking-wider text-text-muted uppercase">{LABELS[triage]}</span>
          </div>
        ))}
        {mciCount > 0 && (
          <span role="alert" className="h-7 px-3 inline-flex items-center rounded-full bg-triage-red text-on-red text-[11px] font-bold tracking-wide">
            AFFLUX DE VICTIMES · {mciCount}
          </span>
        )}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onToggleSound}
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? 'Alerte sonore activée' : 'Alerte sonore coupée'}
        title={soundEnabled ? 'Alerte sonore activée' : 'Alerte sonore coupée'}
        className={`w-10 h-10 rounded-lg inline-flex items-center justify-center cursor-pointer transition-colors ${
          soundEnabled ? 'bg-ink text-white' : 'text-text-muted hover:bg-panel'
        }`}
      >
        {soundEnabled ? <Bell className="w-[18px] h-[18px]" /> : <BellOff className="w-[18px] h-[18px]" />}
      </button>

      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} title={`Flux en direct : ${connectionText}`} aria-label={connectionText} role="status" />      <time className="font-mono text-[22px] font-medium tabular-nums">{timeStr}</time>
    </header>
  );
};
