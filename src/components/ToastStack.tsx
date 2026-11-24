import React from 'react';
import {Bell, PhoneIncoming, X} from 'lucide-react';
import {formatClockTime} from '../lib/helpers';
import type {ToastAlert} from '../lib/types';

interface ToastStackProps {
  toasts: ToastAlert[];
  onDismiss: (id: string) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({toasts, onDismiss}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[95] flex flex-col items-center gap-2 px-3 pt-safe mt-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => {
            toast.onClick?.();
            onDismiss(toast.id);
          }}
          className="pointer-events-auto w-full max-w-md flex items-center gap-3 p-3 rounded-2xl bg-[#16192b]/95 backdrop-blur-md border border-white/12 shadow-2xl cursor-pointer active:scale-[0.98] transition-transform"
        >
          <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0 bg-indigo-600/25 border border-indigo-400/25">
            {toast.avatarUrl ? (
              <img
                src={toast.avatarUrl}
                alt={toast.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : toast.kind === 'call' ? (
              <PhoneIncoming className="w-5 h-5 text-emerald-400" />
            ) : toast.avatarInitials ? (
              <span className="text-sm font-semibold text-white">{toast.avatarInitials}</span>
            ) : (
              <Bell className="w-5 h-5 text-indigo-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white truncate">{toast.title}</p>
              <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                {formatClockTime(toast.timestamp)}
              </span>
            </div>
            <p className="text-xs text-slate-300 truncate">{toast.body}</p>
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(toast.id);
            }}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
