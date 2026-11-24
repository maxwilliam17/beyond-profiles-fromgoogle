import React, {useState} from 'react';
import {Download, Share, PlusSquare, WifiOff, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {useOnlineStatus} from '../hooks/useOnlineStatus';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({variant = 'compact'}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          variant === 'full'
            ? 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#9E5A3C] hover:bg-[#B46846] text-[#F3EFEA] text-sm font-medium px-4 py-2.5 transition-colors whitespace-nowrap shrink-0'
            : 'min-h-[40px] flex items-center gap-2 rounded-xl bg-[#9E5A3C] hover:bg-[#B46846] text-[#F3EFEA] text-xs font-medium px-3.5 py-2 transition-colors whitespace-nowrap shrink-0'
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'full'
              ? 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-[#FFEBD7]/12 bg-[#24201E] hover:bg-[#2C2724] text-[#F3EFEA] text-sm font-medium px-4 py-2.5 transition-colors whitespace-nowrap shrink-0'
              : 'min-h-[40px] flex items-center gap-2 rounded-xl border border-[#FFEBD7]/12 bg-[#24201E] hover:bg-[#2C2724] text-[#F3EFEA] text-xs font-medium px-3 py-2 transition-colors whitespace-nowrap shrink-0'
          }
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl bg-[#24201E] border border-[#FFEBD7]/12 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-semibold text-[#F3EFEA]">Install Beyond Profiles</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#A39B93] hover:text-[#F3EFEA] hover:bg-[#FFEBD7]/[0.08]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-[#A39B93] leading-relaxed mb-4">
                Add this app to your Home Screen for full-screen launch and mobile notifications:
              </p>
              <ol className="space-y-3 text-sm text-[#F3EFEA] mb-5">
                <li className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-[#8C5327]/30 flex items-center justify-center shrink-0">
                    <Share className="w-4 h-4 text-[#D98A4E]" />
                  </span>
                  <span>
                    Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-[#8C5327]/30 flex items-center justify-center shrink-0">
                    <PlusSquare className="w-4 h-4 text-[#D98A4E]" />
                  </span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-[#9E5A3C] hover:bg-[#B46846] text-[#F3EFEA] text-sm font-medium transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-[85] flex items-center gap-2 rounded-xl bg-[#8C5327] px-3.5 py-2 text-xs font-medium text-[#F3EFEA] shadow-lg border border-[#D98A4E]/40">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode — Cached data active</span>
    </div>
  );
};
