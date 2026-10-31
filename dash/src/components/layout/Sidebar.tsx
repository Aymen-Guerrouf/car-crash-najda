import React from 'react';
import { NavLink } from 'react-router-dom';
import { Hospital, Map, MessageSquare } from 'lucide-react';
import { LogoMark } from '../ui/Logo';

const NAV = [
  { to: '/', label: 'Opérations', icon: Map, end: true },
  { to: '/hospitals', label: 'Hôpitaux', icon: Hospital, end: false },
  { to: '/sms', label: 'Journal SMS', icon: MessageSquare, end: false },
];

/** Narrow icon rail: where you are, and a dot that says whether the live feed is up. */
export const Sidebar: React.FC<{ live: boolean }> = ({ live }) => {
  return (
    <aside className="w-[72px] shrink-0 bg-surface border-r border-border flex flex-col items-center py-5 select-none">
      <LogoMark className="w-8 h-auto" />

      <nav className="mt-10 flex flex-col gap-3" aria-label="Navigation principale">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            title={label}
            className={({ isActive }) =>
              `w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                isActive ? 'bg-ink text-white' : 'text-text-muted hover:bg-panel hover:text-text'
              }`
            }
          >
            <Icon className="w-[22px] h-[22px]" strokeWidth={1.75} />
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      <span className={`w-2.5 h-2.5 rounded-full mb-1 ${live ? 'bg-triage-green' : 'bg-triage-red'}`} title={live ? 'En direct' : 'Hors ligne'} aria-label={live ? 'En direct' : 'Hors ligne'} />
    </aside>
  );
};
