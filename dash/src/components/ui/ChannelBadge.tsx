import React from 'react';
import { MessageSquare, Wifi } from 'lucide-react';
import type { Channel } from '../../types/contracts';

/** HTTP (internet) or SMS (offline coded message): the SMS badge uses the info colour (spec §11.4). */
export const ChannelBadge: React.FC<{ channel: Channel | string; className?: string }> = ({ channel, className = '' }) => {
  const sms = channel === 'SMS';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 h-6 rounded-full text-[11px] font-bold ${
        sms ? 'bg-info/10 text-info' : 'bg-surface-2 text-text-muted'
      } ${className}`}
      title={sms ? 'Reçu par SMS (pas d’internet sur le téléphone)' : 'Reçu par internet'}
    >
      {sms ? <MessageSquare className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
      {sms ? 'SMS' : 'Internet'}
    </span>
  );
};
