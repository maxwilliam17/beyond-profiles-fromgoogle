package com.beyondprofiles.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.drawable.IconCompat;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class BeyondNotificationHelper {

    public static final String CHANNEL_MESSAGES = "bp_messages_v1";
    public static final String CHANNEL_MESSAGES_SILENT = "bp_messages_silent_v1";
    public static final String CHANNEL_GROUPS = "bp_groups_v1";
    public static final String CHANNEL_GROUPS_SILENT = "bp_groups_silent_v1";
    public static final String CHANNEL_CALLS = "bp_calls_v1";
    public static final String CHANNEL_CALLS_SILENT = "bp_calls_silent_v1";
    public static final String CHANNEL_SERVICE = "bp_service_v1";

    public static final int ONGOING_SERVICE_NOTIF_ID = 1001;
    public static final int MESSAGES_SUMMARY_NOTIF_ID = 1002;
    public static final int TEST_NOTIF_ID = 1003;
    public static final String MESSAGES_GROUP_KEY = "com.beyondprofiles.app.MESSAGES_GROUP";

    public static final String EXTRA_TARGET = "bp_extra_target";
    public static final String EXTRA_CALL_ID = "bp_extra_call_id";
    public static final String EXTRA_CALL_ACTION = "bp_extra_call_action";
    public static final String EXTRA_CONVO_KEY = "bp_extra_convo_key";
    public static final String EXTRA_CONVO_KIND = "bp_extra_convo_kind";
    public static final String EXTRA_CONVO_ID = "bp_extra_convo_id";
    public static final String EXTRA_NOTIF_ID = "bp_extra_notif_id";
    public static final String KEY_TEXT_REPLY = "bp_key_text_reply";

    public static final String ACTION_REPLY = "com.beyondprofiles.app.ACTION_REPLY";
    public static final String ACTION_MARK_READ = "com.beyondprofiles.app.ACTION_MARK_READ";
    public static final String ACTION_DISMISS_CONVO = "com.beyondprofiles.app.ACTION_DISMISS_CONVO";
    public static final String ACTION_DECLINE_CALL = "com.beyondprofiles.app.ACTION_DECLINE_CALL";

    private static final int ACCENT_COLOR = 0xFF4F46E5;
    private static final int MAX_STACKED_MESSAGES = 8;

    private static final ConcurrentHashMap<String, ConvoStack> convoStacks = new ConcurrentHashMap<>();

    private static final class MessageLine {
        final String senderName;
        final String text;
        final long timestamp;

        MessageLine(String senderName, String text, long timestamp) {
            this.senderName = senderName;
            this.text = text;
            this.timestamp = timestamp;
        }
    }

    private static final class ConvoStack {
        final String title;
        final List<MessageLine> lines = new ArrayList<>();

        ConvoStack(String title) {
            this.title = title;
        }
    }

    private BeyondNotificationHelper() {}

    public static boolean canPostNotifications(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                return false;
            }
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    public static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Uri defaultNotifSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes msgAudio = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        NotificationChannel dmChannel = new NotificationChannel(
            CHANNEL_MESSAGES,
            "Direct Messages",
            NotificationManager.IMPORTANCE_HIGH
        );
        dmChannel.setDescription("Instant notifications for incoming direct messages");
        dmChannel.setSound(defaultNotifSound, msgAudio);
        dmChannel.enableVibration(true);
        dmChannel.setVibrationPattern(new long[] { 0, 100, 70, 100 });
        dmChannel.enableLights(true);
        dmChannel.setLightColor(ACCENT_COLOR);
        dmChannel.setShowBadge(true);
        dmChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(dmChannel);

        NotificationChannel dmSilent = new NotificationChannel(
            CHANNEL_MESSAGES_SILENT,
            "Direct Messages (Silent)",
            NotificationManager.IMPORTANCE_HIGH
        );
        dmSilent.setDescription("Silent heads-up alerts for direct messages");
        dmSilent.setSound(null, null);
        dmSilent.enableVibration(false);
        dmSilent.setShowBadge(true);
        dmSilent.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(dmSilent);

        NotificationChannel groupChannel = new NotificationChannel(
            CHANNEL_GROUPS,
            "Group Messages",
            NotificationManager.IMPORTANCE_HIGH
        );
        groupChannel.setDescription("Instant notifications for incoming group messages");
        groupChannel.setSound(defaultNotifSound, msgAudio);
        groupChannel.enableVibration(true);
        groupChannel.setVibrationPattern(new long[] { 0, 100, 70, 100 });
        groupChannel.enableLights(true);
        groupChannel.setLightColor(ACCENT_COLOR);
        groupChannel.setShowBadge(true);
        groupChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(groupChannel);

        NotificationChannel groupSilent = new NotificationChannel(
            CHANNEL_GROUPS_SILENT,
            "Group Messages (Silent)",
            NotificationManager.IMPORTANCE_HIGH
        );
        groupSilent.setDescription("Silent heads-up alerts for group messages");
        groupSilent.setSound(null, null);
        groupSilent.enableVibration(false);
        groupSilent.setShowBadge(true);
        groupSilent.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(groupSilent);

        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        AudioAttributes callAudio = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        NotificationChannel callsChannel = new NotificationChannel(
            CHANNEL_CALLS,
            "Voice & Video Calls",
            NotificationManager.IMPORTANCE_HIGH
        );
        callsChannel.setDescription("Incoming voice and video call ringtones and banners");
        callsChannel.setSound(ringtoneUri, callAudio);
        callsChannel.enableVibration(true);
        callsChannel.setVibrationPattern(new long[] { 0, 500, 300, 500, 300, 500 });
        callsChannel.enableLights(true);
        callsChannel.setLightColor(Color.GREEN);
        callsChannel.setShowBadge(true);
        callsChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(callsChannel);

        NotificationChannel callsSilent = new NotificationChannel(
            CHANNEL_CALLS_SILENT,
            "Voice & Video Calls (Silent)",
            NotificationManager.IMPORTANCE_HIGH
        );
        callsSilent.setDescription("Silent incoming call alerts");
        callsSilent.setSound(null, null);
        callsSilent.enableVibration(false);
        callsSilent.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(callsSilent);

        NotificationChannel serviceChannel = new NotificationChannel(
            CHANNEL_SERVICE,
            "Background Connection",
            NotificationManager.IMPORTANCE_MIN
        );
        serviceChannel.setDescription("Keeps Beyond Profiles connected for instant message and call alerts");
        serviceChannel.setSound(null, null);
        serviceChannel.enableVibration(false);
        serviceChannel.setShowBadge(false);
        serviceChannel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
        nm.createNotificationChannel(serviceChannel);
    }

    public static Notification buildServiceNotification(Context context, String profileName) {
        ensureChannels(context);
        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, 1001, openAppIntent, immutableFlags());

        String text = (profileName != null && !profileName.isEmpty())
            ? "Signed in as " + profileName + " \u00b7 Ready for messages & calls"
            : "Ready for messages & calls";

        return new NotificationCompat.Builder(context, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.ic_stat_beyond)
            .setContentTitle("Beyond Profiles")
            .setContentText(text)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setContentIntent(pi)
            .setShowWhen(false)
            .build();
    }

    public static int getNotificationIdForConvo(String convoKey) {
        return 20000 + ((convoKey.hashCode() & 0x7fffffff) % 10000);
    }

    public static int getNotificationIdForCall(String callId) {
        return 30000 + ((callId.hashCode() & 0x7fffffff) % 10000);
    }

    public static int getNotificationIdForMissedCall(String callId) {
        return 40000 + ((callId.hashCode() & 0x7fffffff) % 10000);
    }

    public static void showMessageNotification(
        Context context,
        String kind,
        String convoId,
        String senderName,
        String groupName,
        String text,
        long timestamp,
        String avatarBase64
    ) {
        if (!canPostNotifications(context)) return;
        ensureChannels(context);

        boolean isGroup = "group".equals(kind);
        String convoKey = kind + ":" + convoId;
        int notifId = getNotificationIdForConvo(convoKey);

        String displaySender = (senderName != null && !senderName.isEmpty()) ? senderName : "Message";
        String displayTitle = isGroup
            ? ((groupName != null && !groupName.isEmpty()) ? groupName : "Group")
            : displaySender;
        String bodyText = (text != null && !text.isEmpty()) ? text : "New message";
        long ts = timestamp > 0L ? timestamp : System.currentTimeMillis();

        ConvoStack stack = convoStacks.compute(convoKey, (k, existing) -> {
            ConvoStack s = existing != null ? existing : new ConvoStack(displayTitle);
            synchronized (s.lines) {
                s.lines.add(new MessageLine(displaySender, bodyText, ts));
                while (s.lines.size() > MAX_STACKED_MESSAGES) {
                    s.lines.remove(0);
                }
            }
            return s;
        });

        Bitmap avatarBitmap = decodeCircularAvatar(avatarBase64);

        String myName = BeyondStateStore.getProfileName(context);
        Person mePerson = new Person.Builder()
            .setName(myName.isEmpty() ? "You" : myName)
            .setKey("me")
            .build();

        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(mePerson);
        style.setGroupConversation(isGroup);
        if (isGroup) {
            style.setConversationTitle(displayTitle);
        }

        if (stack != null) {
            synchronized (stack.lines) {
                for (MessageLine line : stack.lines) {
                    Person.Builder pb = new Person.Builder()
                        .setName(line.senderName)
                        .setKey("sender_" + line.senderName);
                    if (!isGroup && avatarBitmap != null) {
                        pb.setIcon(IconCompat.createWithBitmap(avatarBitmap));
                    }
                    style.addMessage(line.text, line.timestamp, pb.build());
                }
            }
        }

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        openIntent.putExtra(EXTRA_TARGET, convoKey);
        PendingIntent contentPi = PendingIntent.getActivity(context, notifId, openIntent, immutableFlags());

        Intent dismissIntent = new Intent(context, NotificationActionReceiver.class);
        dismissIntent.setAction(ACTION_DISMISS_CONVO);
        dismissIntent.putExtra(EXTRA_CONVO_KEY, convoKey);
        PendingIntent deletePi = PendingIntent.getBroadcast(context, notifId + 100000, dismissIntent, immutableFlags());

        // Quick Reply action (WhatsApp-style inline reply)
        RemoteInput remoteInput = new RemoteInput.Builder(KEY_TEXT_REPLY)
            .setLabel("Reply")
            .build();
        Intent replyIntent = new Intent(context, NotificationActionReceiver.class);
        replyIntent.setAction(ACTION_REPLY);
        replyIntent.putExtra(EXTRA_CONVO_KEY, convoKey);
        replyIntent.putExtra(EXTRA_CONVO_KIND, kind);
        replyIntent.putExtra(EXTRA_CONVO_ID, convoId);
        replyIntent.putExtra(EXTRA_NOTIF_ID, notifId);
        PendingIntent replyPi = PendingIntent.getBroadcast(context, notifId + 200000, replyIntent, mutableFlags());
        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
            R.drawable.ic_stat_beyond,
            "Reply",
            replyPi
        )
            .addRemoteInput(remoteInput)
            .setAllowGeneratedReplies(true)
            .build();

        // Mark as read action
        Intent readIntent = new Intent(context, NotificationActionReceiver.class);
        readIntent.setAction(ACTION_MARK_READ);
        readIntent.putExtra(EXTRA_CONVO_KEY, convoKey);
        readIntent.putExtra(EXTRA_CONVO_KIND, kind);
        readIntent.putExtra(EXTRA_CONVO_ID, convoId);
        readIntent.putExtra(EXTRA_NOTIF_ID, notifId);
        PendingIntent readPi = PendingIntent.getBroadcast(context, notifId + 300000, readIntent, immutableFlags());

        boolean soundOn = BeyondStateStore.isSoundEnabled(context);
        boolean vibrateOn = BeyondStateStore.isVibrateEnabled(context);
        boolean silent = !soundOn && !vibrateOn;

        String channelId = isGroup
            ? (silent ? CHANNEL_GROUPS_SILENT : CHANNEL_GROUPS)
            : (silent ? CHANNEL_MESSAGES_SILENT : CHANNEL_MESSAGES);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_beyond)
            .setColor(ACCENT_COLOR)
            .setContentTitle(displayTitle)
            .setContentText(isGroup ? displaySender + ": " + bodyText : bodyText)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setWhen(ts)
            .setShowWhen(true)
            .setContentIntent(contentPi)
            .setDeleteIntent(deletePi)
            .setGroup(MESSAGES_GROUP_KEY)
            .addAction(replyAction)
            .addAction(0, "Mark as read", readPi);

        if (avatarBitmap != null) {
            builder.setLargeIcon(avatarBitmap);
        }
        if (silent) {
            builder.setSilent(true);
        } else {
            if (soundOn) {
                builder.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
            }
            if (vibrateOn) {
                builder.setVibrate(new long[] { 0, 100, 70, 100 });
            }
        }

        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(context);
            nm.notify(notifId, builder.build());
            updateSummaryNotification(context, nm);
        } catch (SecurityException ignored) {
            // Permission revoked
        }
    }

    private static void updateSummaryNotification(Context context, NotificationManagerCompat nm) {
        if (convoStacks.size() < 2) {
            nm.cancel(MESSAGES_SUMMARY_NOTIF_ID);
            return;
        }

        int totalMessages = 0;
        NotificationCompat.InboxStyle inbox = new NotificationCompat.InboxStyle();
        for (Map.Entry<String, ConvoStack> entry : convoStacks.entrySet()) {
            ConvoStack s = entry.getValue();
            synchronized (s.lines) {
                totalMessages += s.lines.size();
                if (!s.lines.isEmpty()) {
                    MessageLine last = s.lines.get(s.lines.size() - 1);
                    inbox.addLine(s.title + ": " + last.text);
                }
            }
        }

        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
            context,
            MESSAGES_SUMMARY_NOTIF_ID,
            openAppIntent,
            immutableFlags()
        );

        String summaryText = totalMessages + " new messages from " + convoStacks.size() + " chats";
        inbox.setBigContentTitle("Beyond Profiles");
        inbox.setSummaryText(summaryText);

        Notification summary = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_beyond)
            .setColor(ACCENT_COLOR)
            .setContentTitle("Beyond Profiles")
            .setContentText(summaryText)
            .setStyle(inbox)
            .setGroup(MESSAGES_GROUP_KEY)
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setAutoCancel(true)
            .setContentIntent(contentPi)
            .build();

        try {
            nm.notify(MESSAGES_SUMMARY_NOTIF_ID, summary);
        } catch (SecurityException ignored) {
            // Permission revoked
        }
    }

    public static void showIncomingCallNotification(
        Context context,
        String callId,
        String callerName,
        boolean isVideo,
        String avatarBase64
    ) {
        if (!canPostNotifications(context)) return;
        ensureChannels(context);

        briefWakeLock(context);

        int notifId = getNotificationIdForCall(callId);
        String displayCaller = (callerName != null && !callerName.isEmpty()) ? callerName : "Unknown";
        String callTitle = isVideo ? "Incoming video call" : "Incoming voice call";

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        openIntent.putExtra(EXTRA_CALL_ID, callId);
        openIntent.putExtra(EXTRA_CALL_ACTION, "open");
        PendingIntent fullScreenPi = PendingIntent.getActivity(context, notifId, openIntent, immutableFlags());

        Intent answerIntent = new Intent(context, MainActivity.class);
        answerIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        answerIntent.putExtra(EXTRA_CALL_ID, callId);
        answerIntent.putExtra(EXTRA_CALL_ACTION, "answer");
        PendingIntent answerPi = PendingIntent.getActivity(
            context,
            notifId + 100000,
            answerIntent,
            immutableFlags()
        );

        Intent declineIntent = new Intent(context, NotificationActionReceiver.class);
        declineIntent.setAction(ACTION_DECLINE_CALL);
        declineIntent.putExtra(EXTRA_CALL_ID, callId);
        declineIntent.putExtra(EXTRA_NOTIF_ID, notifId);
        PendingIntent declinePi = PendingIntent.getBroadcast(
            context,
            notifId + 200000,
            declineIntent,
            immutableFlags()
        );

        boolean soundOn = BeyondStateStore.isSoundEnabled(context);
        boolean vibrateOn = BeyondStateStore.isVibrateEnabled(context);
        boolean silent = !soundOn && !vibrateOn;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            silent ? CHANNEL_CALLS_SILENT : CHANNEL_CALLS
        )
            .setSmallIcon(R.drawable.ic_stat_beyond)
            .setColor(0xFF10B981)
            .setContentTitle(displayCaller)
            .setContentText(callTitle + " \u00b7 Tap to answer")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setTimeoutAfter(60000)
            .setContentIntent(fullScreenPi)
            .setFullScreenIntent(fullScreenPi, true)
            .addAction(0, "Decline", declinePi)
            .addAction(0, "Answer", answerPi);

        Bitmap avatar = decodeCircularAvatar(avatarBase64);
        if (avatar != null) {
            builder.setLargeIcon(avatar);
        }

        if (silent) {
            builder.setSilent(true);
        } else {
            if (soundOn) {
                builder.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE));
            }
            if (vibrateOn) {
                builder.setVibrate(new long[] { 0, 500, 300, 500, 300, 500 });
            }
        }

        Notification notif = builder.build();
        if (!silent) {
            notif.flags |= Notification.FLAG_INSISTENT;
        }

        try {
            NotificationManagerCompat.from(context).notify(notifId, notif);
        } catch (SecurityException ignored) {
            // Permission revoked
        }
    }

    public static void cancelCallNotification(Context context, String callId) {
        if (callId == null || callId.isEmpty()) return;
        NotificationManagerCompat.from(context).cancel(getNotificationIdForCall(callId));
    }

    public static void showMissedCallNotification(
        Context context,
        String callId,
        String callerName,
        boolean isVideo
    ) {
        if (!canPostNotifications(context)) return;
        ensureChannels(context);

        cancelCallNotification(context, callId);
        int notifId = getNotificationIdForMissedCall(callId);
        String displayCaller = (callerName != null && !callerName.isEmpty()) ? callerName : "Unknown";

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(context, notifId, openIntent, immutableFlags());

        boolean silent = !BeyondStateStore.isSoundEnabled(context) && !BeyondStateStore.isVibrateEnabled(context);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            silent ? CHANNEL_MESSAGES_SILENT : CHANNEL_MESSAGES
        )
            .setSmallIcon(R.drawable.ic_stat_beyond)
            .setColor(0xFFF43F5E)
            .setContentTitle("Missed " + (isVideo ? "video" : "voice") + " call")
            .setContentText("From " + displayCaller)
            .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pi);

        try {
            NotificationManagerCompat.from(context).notify(notifId, builder.build());
        } catch (SecurityException ignored) {
            // Permission revoked
        }
    }

    public static void clearConversationNotification(Context context, String convoKey) {
        if (convoKey == null || convoKey.isEmpty()) return;
        convoStacks.remove(convoKey);
        NotificationManagerCompat nm = NotificationManagerCompat.from(context);
        nm.cancel(getNotificationIdForConvo(convoKey));
        updateSummaryNotification(context, nm);
    }

    public static void clearConversationStackOnly(String convoKey) {
        if (convoKey != null && !convoKey.isEmpty()) {
            convoStacks.remove(convoKey);
        }
    }

    public static void clearAllNotifications(Context context) {
        convoStacks.clear();
        NotificationManagerCompat.from(context).cancelAll();
    }

    public static boolean showTestNotification(Context context) {
        if (!canPostNotifications(context)) return false;
        ensureChannels(context);

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, TEST_NOTIF_ID, openIntent, immutableFlags());

        boolean soundOn = BeyondStateStore.isSoundEnabled(context);
        boolean vibrateOn = BeyondStateStore.isVibrateEnabled(context);
        boolean silent = !soundOn && !vibrateOn;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            silent ? CHANNEL_MESSAGES_SILENT : CHANNEL_MESSAGES
        )
            .setSmallIcon(R.drawable.ic_stat_beyond)
            .setColor(ACCENT_COLOR)
            .setContentTitle("Beyond Profiles")
            .setContentText("WhatsApp-style phone notifications are active for every message and call!")
            .setStyle(
                new NotificationCompat.BigTextStyle()
                    .bigText("WhatsApp-style phone notifications are active for every message, group chat, and call — even when the app is closed.")
            )
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pi);

        try {
            NotificationManagerCompat.from(context).notify(TEST_NOTIF_ID, builder.build());
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }

    private static int immutableFlags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }

    private static int mutableFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.FLAG_UPDATE_CURRENT;
    }

    private static void briefWakeLock(Context context) {
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "beyondprofiles:call_alert"
                );
                wl.acquire(4000L);
            }
        } catch (Throwable ignored) {
            // Non-fatal
        }
    }

    private static Bitmap decodeCircularAvatar(String dataUrlOrBase64) {
        if (dataUrlOrBase64 == null || dataUrlOrBase64.isEmpty()) return null;
        try {
            String raw = dataUrlOrBase64;
            int comma = raw.indexOf(',');
            if (comma >= 0) {
                raw = raw.substring(comma + 1);
            }
            byte[] bytes = Base64.decode(raw, Base64.DEFAULT);
            if (bytes == null || bytes.length == 0) return null;

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
            int maxDim = Math.max(opts.outWidth, opts.outHeight);
            int sample = 1;
            while (maxDim / sample > 256) {
                sample *= 2;
            }
            opts.inJustDecodeBounds = false;
            opts.inSampleSize = sample;
            Bitmap src = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
            if (src == null) return null;

            int size = 128;
            Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(output);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
            paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));

            int srcSize = Math.min(src.getWidth(), src.getHeight());
            int left = (src.getWidth() - srcSize) / 2;
            int top = (src.getHeight() - srcSize) / 2;
            Rect srcRect = new Rect(left, top, left + srcSize, top + srcSize);
            Rect dstRect = new Rect(0, 0, size, size);
            canvas.drawBitmap(src, srcRect, dstRect, paint);
            src.recycle();
            return output;
        } catch (Throwable ignored) {
            return null;
        }
    }
}
