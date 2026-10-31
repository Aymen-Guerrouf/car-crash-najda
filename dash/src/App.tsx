import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { ConnectionBanner } from './components/layout/ConnectionBanner';
import { OpsPage } from './pages/OpsPage';
import { HospitalsPage } from './pages/HospitalsPage';
import { SmsLogPage } from './pages/SmsLogPage';
import { useOpsStore } from './store/useOpsStore';
import { useOpsConnection } from './lib/useOpsConnection';
import { countByTriage, isOpen } from './lib/incidents';

export const App: React.FC = () => {
  const connectionStatus = useOpsStore((s) => s.connection);
  const incidents = useOpsStore((s) => s.incidents);
  const [offlineSeconds, setOfflineSeconds] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gh_sound_enabled') === 'true';
    } catch {
      return false;
    }
  });

  useOpsConnection(soundEnabled);

  const open = useMemo(() => Object.values(incidents).filter(isOpen), [incidents]);
  const counts = useMemo(() => countByTriage(open), [open]);
  const mciCount = useMemo(() => open.filter((i) => i.is_mci).length, [open]);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('gh_sound_enabled', String(next));
      } catch {
        // Safe fallback if localStorage is disabled
      }
      return next;
    });
  };

  useEffect(() => {
    if (connectionStatus === 'open') {
      setOfflineSeconds(0);
      return;
    }

    const timer = setInterval(() => {
      setOfflineSeconds((s) => s + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [connectionStatus]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-panel text-text">
      <Sidebar live={connectionStatus === 'open'} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          connectionStatus={connectionStatus}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          redCount={counts.RED}
          yellowCount={counts.YELLOW}
          greenCount={counts.GREEN}
          unknownCount={counts.UNKNOWN}
          mciCount={mciCount}
        />

        <ConnectionBanner status={connectionStatus} offlineSeconds={offlineSeconds} />

        <main className="flex-1 flex overflow-hidden">
          <Routes>
            <Route path="/" element={<OpsPage />} />
            <Route path="/hospitals" element={<HospitalsPage />} />
            <Route path="/sms" element={<SmsLogPage />} />
            <Route path="*" element={<OpsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};
