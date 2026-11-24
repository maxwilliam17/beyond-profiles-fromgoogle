/// <reference lib="webworker" />
import {precacheAndRoute, cleanupOutdatedCaches} from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{url: string; revision: string | null}>;
};

cleanupOutdatedCaches();
const manifestEntries = self.__WB_MANIFEST;
if (Array.isArray(manifestEntries)) {
  precacheAndRoute(manifestEntries);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload: {
    title?: string;
    body?: string;
    target?: string;
    callId?: string;
    kind?: 'message' | 'call';
  } = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {body: event.data.text()};
    }
  }

  const isCall = payload.kind === 'call' || !!payload.callId;
  const title = payload.title || (isCall ? 'Incoming Call' : 'Beyond Profiles');
  const body = payload.body || (isCall ? 'Tap to answer' : 'You have a new message');

  const options: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
    actions?: Array<{action: string; title: string}>;
  } = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.callId ? `bp-call-${payload.callId}` : `bp-push-${Date.now()}`,
    renotify: true,
    requireInteraction: isCall,
    vibrate: isCall ? [350, 150, 350, 150, 350] : [80, 50, 80],
    data: {
      target: payload.target || '',
      callId: payload.callId || '',
      kind: isCall ? 'call' : 'message',
    },
    actions: isCall
      ? [
          {action: 'answer', title: 'Answer'},
          {action: 'decline', title: 'Decline'},
        ]
      : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const data = (event.notification.data || {}) as {
    target?: string;
    callId?: string;
    kind?: string;
  };
  event.notification.close();

  const targetHash = data.callId
    ? `#call=${encodeURIComponent(data.callId)}&action=${encodeURIComponent(action || 'open')}`
    : data.target
      ? `#open=${encodeURIComponent(data.target)}`
      : '/';

  event.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true}).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: data.callId ? 'call-action' : 'open-conversation',
            target: data.target || '',
            callId: data.callId || '',
            action: action || 'open',
          });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(`/${targetHash === '/' ? '' : targetHash}`);
      }
    }),
  );
});
