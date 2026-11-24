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
          <h2 className="font-display text-lg font-semibold text-[#F3EFEA]">Start a Call</h2>
          <span className="text-xs text-[#A39B93]">Voice &amp; HD Video</span>
        </div>

        {contacts.length === 0 ? (
          <div className="rounded-2xl border border-[#FFEBD7]/[0.08] bg-[#24201E] p-6 text-center">
            <p className="text-sm text-[#A39B93]">
              No other profiles yet. Create another profile to place voice or video calls.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#FFEBD7]/[0.08] bg-[#24201E] divide-y divide-[#FFEBD7]/[0.06]">
            {contacts.map((person) => (
              <div key={person.id} className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <ProfileAvatar
                    profile={person}
                    sizeClass="w-11 h-11"
                    roundedClass="rounded-full"
                    showOnlineDot
                    dotBorderClass="border-[#24201E]"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#F3EFEA] truncate">{person.name}</p>
                    <p className="text-xs text-[#A39B93]">{person.isKid ? 'Kids profile' : 'Available'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStartCall(person.id, false)}
                    aria-label={`Voice call ${person.name}`}
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-[#5A6E5C]/25 hover:bg-[#5A6E5C] text-[#86A389] hover:text-[#F3EFEA] border border-[#86A389]/35 flex items-center justify-center transition-colors"
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartCall(person.id, true)}
                    aria-label={`Video call ${person.name}`}
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-[#9E5A3C]/25 hover:bg-[#9E5A3C] text-[#C97A57] hover:text-[#F3EFEA] border border-[#C97A57]/35 flex items-center justify-center transition-colors"
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
        <h2 className="font-display text-lg font-semibold text-[#F3EFEA] mb-3">Recent Calls</h2>
        {callHistory.length === 0 ? (
          <div className="rounded-2xl border border-[#FFEBD7]/[0.08] bg-[#24201E]/70 p-8 text-center">
            <p className="text-sm text-[#A39B93]">No calls recorded in this session yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#FFEBD7]/[0.08] bg-[#24201E] divide-y divide-[#FFEBD7]/[0.06]">
            {callHistory.map((entry) => {
              const peer = profiles.find((p) => p.id === entry.peerId);
              const isMissed = entry.status === 'missed';
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProfileAvatar
                      profile={peer || {name: entry.peerName, color: 'bg-indigo-500'}}
                      sizeClass="w-10 h-10"
                      roundedClass="rounded-full"
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${isMissed ? 'text-[#DF9878]' : 'text-[#F3EFEA]'}`}>
                        {entry.peerName}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-[#A39B93]">
                        {isMissed ? (
                          <PhoneMissed className="w-3.5 h-3.5 text-[#DF9878] shrink-0" />
                        ) : entry.direction === 'incoming' ? (
                          <PhoneIncoming className="w-3.5 h-3.5 text-[#86A389] shrink-0" />
                        ) : (
                          <PhoneOutgoing className="w-3.5 h-3.5 text-[#D98A4E] shrink-0" />
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
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-[#2C2724] hover:bg-[#9E5A3C] text-[#F3EFEA] flex items-center justify-center transition-colors shrink-0"
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
