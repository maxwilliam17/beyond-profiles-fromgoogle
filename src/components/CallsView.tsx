import React from 'react';
import {Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video} from 'lucide-react';
import {formatChatTime} from '../lib/helpers';
import type {CallLogEntry, Profile} from '../lib/types';
import {ProfileAvatar} from './Avatar';

interface CallsViewProps {
  currentUser: Profile;
  profiles: Profile[];
  callHistory: CallLogEntry[];
  onStartCall: (partnerId: string, video: boolean) => void;
}

export const CallsView: React.FC<CallsViewProps> = ({
  currentUser,
  profiles,
  callHistory,
  onStartCall,
}) => {
  const contacts = profiles.filter((p) => p.id !== currentUser.id);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-4xl mx-auto space-y-6">
      {/* Quick Dial Contacts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-semibold text-white">Start a Call</h2>
          <span className="text-xs text-slate-400">Voice &amp; HD Video</span>
        </div>

        {contacts.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#131624] p-6 text-center">
            <p className="text-sm text-slate-400">
              No other profiles yet. Create another profile to place voice or video calls.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.07] bg-[#131624] divide-y divide-white/[0.06]">
            {contacts.map((person) => (
              <div key={person.id} className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <ProfileAvatar profile={person} sizeClass="w-11 h-11" roundedClass="rounded-2xl" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{person.name}</p>
                    <p className="text-xs text-slate-400">{person.isKid ? 'Kids profile' : 'Available'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStartCall(person.id, false)}
                    aria-label={`Voice call ${person.name}`}
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/30 flex items-center justify-center transition-colors"
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartCall(person.id, true)}
                    aria-label={`Video call ${person.name}`}
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-indigo-500/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 flex items-center justify-center transition-colors"
                  >
                    <Video className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Call History */}
      <section>
        <h2 className="font-display text-lg font-semibold text-white mb-3">Recent Calls</h2>
        {callHistory.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#131624]/60 p-8 text-center">
            <p className="text-sm text-slate-400">No calls recorded in this session yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/[0.07] bg-[#131624] divide-y divide-white/[0.06]">
            {callHistory.map((entry) => {
              const peer = profiles.find((p) => p.id === entry.peerId);
              const isMissed = entry.status === 'missed';
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProfileAvatar
                      profile={peer || {name: entry.peerName, color: 'bg-indigo-500'}}
                      sizeClass="w-10 h-10"
                      roundedClass="rounded-xl"
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${isMissed ? 'text-rose-300' : 'text-white'}`}>
                        {entry.peerName}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        {isMissed ? (
                          <PhoneMissed className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : entry.direction === 'incoming' ? (
                          <PhoneIncoming className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <PhoneOutgoing className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        )}
                        <span>
                          {isMissed ? 'Missed' : entry.direction === 'incoming' ? 'Incoming' : 'Outgoing'}{' '}
                          {entry.video ? 'video' : 'voice'} · {formatChatTime(entry.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartCall(entry.peerId, entry.video)}
                    aria-label={`Call ${entry.peerName} again`}
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-white/[0.05] hover:bg-indigo-600 text-slate-200 hover:text-white flex items-center justify-center transition-colors shrink-0"
                  >
                    {entry.video ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
