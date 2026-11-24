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
            ? 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2.5 transition-colors whitespace-nowrap shrink-0'
            : 'min-h-[40px] flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3.5 py-2 transition-colors whitespace-nowrap shrink-0'
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
              ? 'w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-100 text-sm font-medium px-4 py-2.5 transition-colors whitespace-nowrap shrink-0'
              : 'min-h-[40px] flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-medium px-3 py-2 transition-colors whitespace-nowrap shrink-0'
          }
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl bg-[#131624] border border-white/10 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-semibold text-white">Install Beyond Profiles</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                Add this app to your Home Screen for full-screen launch and mobile notifications:
              </p>
              <ol className="space-y-3 text-sm text-slate-200 mb-5">
                <li className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <Share className="w-4 h-4 text-indigo-400" />
                  </span>
                  <span>
                    Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <PlusSquare className="w-4 h-4 text-indigo-400" />
                  </span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
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
    <div className="fixed bottom-20 md:bottom-4 left-4 z-[85] flex items-center gap-2 rounded-xl bg-amber-600/95 px-3.5 py-2 text-xs font-medium text-white shadow-lg border border-amber-400/30">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode — Cached data active</span>
    </div>
  );
};
