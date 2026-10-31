import React from 'react';
import { AlertTriangle, WifiOff } from 'lucide-react';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

interface ConnectionBannerProps {
  status: ConnectionStatus;
  offlineSeconds?: number;
}

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({ status, offlineSeconds = 0 }) => {
  if (status === 'open') {
    return null;
  }

  const isCritical = status === 'closed' || offlineSeconds >= 10;

  return (
    <div
      role="alert"
      className={`w-full py-2 px-6 flex items-center gap-2 text-sm font-semibold ${isCritical ? 'bg-triage-red text-on-red' : 'bg-triage-yellow text-on-yellow'}`}
    >
      {isCritical ? (
        <>
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Hors ligne — les données peuvent être périmées. Reconnexion en cours…</span>
        </>
      ) : (
        <>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Reconnexion au flux de dispatch…</span>
        </>
      )}
    </div>
  );
};
