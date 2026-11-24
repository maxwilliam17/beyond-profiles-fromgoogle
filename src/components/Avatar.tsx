import React, {useState} from 'react';
import {avatarColorHex, getInitials, groupGradient} from '../lib/helpers';
import type {GroupChat, Profile} from '../lib/types';

interface ProfileAvatarProps {
  profile?: Partial<Profile> | null;
  sizeClass?: string;
  roundedClass?: string;
  textClass?: string;
  showOnlineDot?: boolean;
  dotBorderClass?: string;
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  profile,
  sizeClass = 'w-11 h-11',
  roundedClass = 'rounded-full',
  textClass = 'text-sm font-semibold',
  showOnlineDot = false,
  dotBorderClass = 'border-[#1E1B1A]',
}) => {
  const [imgError, setImgError] = useState(false);
  const photo = profile?.photo;
  const [c1, c2] = avatarColorHex(profile?.color);
  const initials = getInitials(profile?.name);

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={`${sizeClass} ${roundedClass} overflow-hidden flex items-center justify-center shrink-0 select-none relative ring-1 ring-[#FFEBD7]/12`}
        style={{background: `linear-gradient(135deg, ${c1}, ${c2})`}}
      >
        {photo && !imgError ? (
          <img
            src={photo}
            alt={profile?.name || 'Profile'}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className={`text-[#F3EFEA] tracking-wide ${textClass}`}>{initials}</span>
        )}
      </div>
      {showOnlineDot && (
        <span
          aria-hidden="true"
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#86A389] border-2 ${dotBorderClass}`}
        />
      )}
    </div>
  );
};

interface GroupAvatarProps {
  group?: Partial<GroupChat> | null;
  sizeClass?: string;
  roundedClass?: string;
  textClass?: string;
}

export const GroupAvatar: React.FC<GroupAvatarProps> = ({
  group,
  sizeClass = 'w-11 h-11',
  roundedClass = 'rounded-full',
  textClass = 'text-sm font-semibold',
}) => {
  const [imgError, setImgError] = useState(false);
  const photo = group?.photo;
  const [c1, c2] = groupGradient(group?.id || group?.name || 'group');
  const initials = getInitials(group?.name || 'Group');

  return (
    <div
      className={`${sizeClass} ${roundedClass} overflow-hidden flex items-center justify-center shrink-0 select-none ring-1 ring-[#FFEBD7]/12`}
      style={{background: `linear-gradient(135deg, ${c1}, ${c2})`}}
    >
      {photo && !imgError ? (
        <img
          src={photo}
          alt={group?.name || 'Group'}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className={`text-[#F3EFEA] tracking-wide ${textClass}`}>{initials}</span>
      )}
    </div>
  );
};
