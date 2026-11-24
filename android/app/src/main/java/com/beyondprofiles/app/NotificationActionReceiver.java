package com.beyondprofiles.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.core.app.RemoteInput;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class NotificationActionReceiver extends BroadcastReceiver {

    private static final ExecutorService executor = Executors.newCachedThreadPool();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        final Context appContext = context.getApplicationContext();

        if (BeyondNotificationHelper.ACTION_DISMISS_CONVO.equals(action)) {
            String convoKey = intent.getStringExtra(BeyondNotificationHelper.EXTRA_CONVO_KEY);
            BeyondNotificationHelper.clearConversationStackOnly(convoKey);
            return;
        }

        if (BeyondNotificationHelper.ACTION_MARK_READ.equals(action)) {
            final String convoKey = intent.getStringExtra(BeyondNotificationHelper.EXTRA_CONVO_KEY);
            final String kind = intent.getStringExtra(BeyondNotificationHelper.EXTRA_CONVO_KIND);
            final String convoId = intent.getStringExtra(BeyondNotificationHelper.EXTRA_CONVO_ID);
            BeyondNotificationHelper.clearConversationNotification(appContext, convoKey);

            final PendingResult pr = goAsync();
            executor.execute(() -> {
                try {
                    BeyondFirebaseRest.markConversationRead(appContext, kind, convoId);
                } finally {
                    pr.finish();
                }
            });
            return;
        }

        if (BeyondNotificationHelper.ACTION_REPLY.equals(action)) {
            Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
            if (remoteInput == null) return;
            CharSequence replySeq = remoteInput.getCharSequence(BeyondNotificationHelper.KEY_TEXT_REPLY);
            final String replyText = replySeq != null ? replySeq.toString().trim() : "";
            final String convoKey = intent.getStringExtra(BeyondNotificationHelper.EXTRA_CONVO_KEY);
            final String kind = intent.getStringExtra(BeyondNotificationHelper.EXTRA_CONVO_KIND);
            final String convoId = intent.getStringExtra(BeyondNotificationHelper.EXTRA_CONVO_ID);

            if (replyText.isEmpty()) {
                BeyondNotificationHelper.clearConversationNotification(appContext, convoKey);
                return;
            }

            final PendingResult pr = goAsync();
            executor.execute(() -> {
                try {
                    BeyondFirebaseRest.sendReplyMessage(appContext, kind, convoId, replyText);
                } finally {
                    BeyondNotificationHelper.clearConversationNotification(appContext, convoKey);
                    pr.finish();
                }
            });
            return;
        }

        if (BeyondNotificationHelper.ACTION_DECLINE_CALL.equals(action)) {
            final String callId = intent.getStringExtra(BeyondNotificationHelper.EXTRA_CALL_ID);
            BeyondNotificationHelper.cancelCallNotification(appContext, callId);

            final PendingResult pr = goAsync();
            executor.execute(() -> {
                try {
                    BeyondFirebaseRest.declineCall(appContext, callId);
                } finally {
                    pr.finish();
                }
            });
        }
    }
}
