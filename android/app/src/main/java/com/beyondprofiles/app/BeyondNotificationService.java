package com.beyondprofiles.app;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONObject;

public class BeyondNotificationService extends Service {

    private static final int MAX_SEEN_KEYS = 2000;

    private volatile boolean running = false;
    private volatile String activeProfileId = "";
    private final AtomicInteger sessionGeneration = new AtomicInteger(0);

    private final Set<Thread> workerThreads = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Set<HttpURLConnection> openConnections = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Set<String> seenMsgKeys = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Set<String> seenCallIds = Collections.newSetFromMap(new ConcurrentHashMap<>());

    private final ConcurrentHashMap<String, ProfileMeta> profileCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> chatReads = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, GroupMeta> groupCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CallMeta> activeRingingCalls = new ConcurrentHashMap<>();

    private ConnectivityManager.NetworkCallback networkCallback;

    private static final class ProfileMeta {
        final String name;
        final String photo;

        ProfileMeta(String name, String photo) {
            this.name = name;
            this.photo = photo;
        }
    }

    private static final class GroupMeta {
        volatile String name;
        final Set<String> members = Collections.newSetFromMap(new ConcurrentHashMap<>());
        volatile long myRead;

        GroupMeta(String name) {
            this.name = name;
        }
    }

    private static final class CallMeta {
        final String callerName;
        final boolean isVideo;

        CallMeta(String callerName, boolean isVideo) {
            this.callerName = callerName;
            this.isVideo = isVideo;
        }
    }

    public static boolean start(Context context) {
        if (context == null) return false;
        Context appCtx = context.getApplicationContext();
        String profileId = BeyondStateStore.getProfileId(appCtx);
        if (profileId.isEmpty()) return false;

        try {
            BeyondNotificationHelper.ensureChannels(appCtx);
            Intent intent = new Intent(appCtx, BeyondNotificationService.class);
            ContextCompat.startForegroundService(appCtx, intent);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    public static void stop(Context context) {
        if (context == null) return;
        Context appCtx = context.getApplicationContext();
        try {
            appCtx.stopService(new Intent(appCtx, BeyondNotificationService.class));
        } catch (Throwable ignored) {
            // Non-fatal
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        BeyondNotificationHelper.ensureChannels(this);
        registerNetworkCallback();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String profileId = BeyondStateStore.getProfileId(this);
        String profileName = BeyondStateStore.getProfileName(this);

        // Must enter foreground immediately on every startForegroundService call
        startForegroundCompat(profileName);

        if (profileId.isEmpty()) {
            BeyondStateStore.setServiceRunning(false);
            stopSelf();
            return START_NOT_STICKY;
        }

        BeyondStateStore.setServiceRunning(true);

        if (!running || !profileId.equals(activeProfileId)) {
            stopWorkers();
            int gen = sessionGeneration.incrementAndGet();
            seenMsgKeys.clear();
            seenCallIds.clear();
            chatReads.clear();
            groupCache.clear();
            activeRingingCalls.clear();
            activeProfileId = profileId;
            running = true;
            startWorkers(profileId, gen);
        }

        return START_STICKY;
    }

    public void onTimeout(int startId, int fgsType) {
        stopSelf(startId);
    }

    @Override
    public void onDestroy() {
        running = false;
        activeProfileId = "";
        BeyondStateStore.setServiceRunning(false);
        unregisterNetworkCallback();
        stopWorkers();
        super.onDestroy();
    }

    private void startForegroundCompat(String profileName) {
        Notification notification = BeyondNotificationHelper.buildServiceNotification(this, profileName);
        int fgsType = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            fgsType = ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING;
        }
        try {
            ServiceCompat.startForeground(
                this,
                BeyondNotificationHelper.ONGOING_SERVICE_NOTIF_ID,
                notification,
                fgsType
            );
        } catch (Throwable ignored) {
            // Fallback for OEMs with unexpected FGS restrictions
            try {
                startForeground(BeyondNotificationHelper.ONGOING_SERVICE_NOTIF_ID, notification);
            } catch (Throwable ignoredAgain) {
                // Non-fatal
            }
        }
    }

    private void startWorkers(final String myId, final int gen) {
        spawnWorker("bp-profiles-sync", () -> fetchProfilesSnapshot());
        spawnWorker("bp-sse-chats", () -> runSseLoop("chats", gen, (event, path, data, isSnapshot) ->
            handleChatsEvent(myId, event, path, data, isSnapshot)
        ));
        spawnWorker("bp-sse-groups", () -> runSseLoop("groups", gen, (event, path, data, isSnapshot) ->
            handleGroupsEvent(myId, event, path, data, isSnapshot)
        ));
        spawnWorker("bp-sse-calls", () -> runSseLoop("calls", gen, (event, path, data, isSnapshot) ->
            handleCallsEvent(myId, event, path, data, isSnapshot)
        ));
    }

    private void spawnWorker(String name, Runnable task) {
        Thread t = new Thread(task, name);
        t.setDaemon(true);
        workerThreads.add(t);
        t.start();
    }

    private void stopWorkers() {
        running = false;
        sessionGeneration.incrementAndGet();
        for (HttpURLConnection conn : openConnections) {
            try {
                conn.disconnect();
            } catch (Throwable ignored) {}
        }
        openConnections.clear();
        for (Thread t : workerThreads) {
            try {
                t.interrupt();
            } catch (Throwable ignored) {}
        }
        workerThreads.clear();
    }

    private interface SseEventHandler {
        void onEvent(String eventName, String path, Object data, boolean isRootSnapshot);
    }

    private void runSseLoop(String node, int gen, SseEventHandler handler) {
        long backoffMs = 2000L;

        while (running && sessionGeneration.get() == gen) {
            HttpURLConnection conn = null;
            try {
                String url = BeyondStateStore.getDbUrl(this) + "/" + node + ".json";
                conn = BeyondFirebaseRest.openStreamConnection(url);
                openConnections.add(conn);

                try (
                    BufferedReader reader = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
                    )
                ) {
                    String eventName = null;
                    StringBuilder dataBuf = new StringBuilder();
                    String line;

                    while (running && sessionGeneration.get() == gen && (line = reader.readLine()) != null) {
                        if (line.isEmpty()) {
                            if (eventName != null) {
                                String rawData = dataBuf.toString();
                                if ("keep-alive".equals(eventName)) {
                                    backoffMs = 2000L;
                                } else if ("cancel".equals(eventName) || "auth_revoked".equals(eventName)) {
                                    break;
                                } else if ("put".equals(eventName) || "patch".equals(eventName)) {
                                    backoffMs = 2000L;
                                    try {
                                        JSONObject env = new JSONObject(rawData);
                                        String path = env.optString("path", "/");
                                        Object data = env.isNull("data") ? null : env.opt("data");
                                        boolean isRootSnapshot = "put".equals(eventName) && "/".equals(path);
                                        handler.onEvent(eventName, path, data, isRootSnapshot);
                                    } catch (Throwable ignored) {
                                        // Skip malformed frame
                                    }
                                }
                            }
                            eventName = null;
                            dataBuf.setLength(0);
                        } else if (line.startsWith("event:")) {
                            eventName = line.substring(6).trim();
                        } else if (line.startsWith("data:")) {
                            if (dataBuf.length() > 0) dataBuf.append('\n');
                            dataBuf.append(line.substring(5).trim());
                        }
                    }
                }
            } catch (Throwable ignored) {
                // Network dropped or read timeout — reconnect below
            } finally {
                if (conn != null) {
                    openConnections.remove(conn);
                    try {
                        conn.disconnect();
                    } catch (Throwable ignored) {}
                }
            }

            if (!running || sessionGeneration.get() != gen) break;
            try {
                Thread.sleep(backoffMs);
            } catch (InterruptedException e) {
                // Woken up by network change or shutdown
                if (!running || sessionGeneration.get() != gen) break;
                backoffMs = 2000L;
                continue;
            }
            backoffMs = Math.min(backoffMs * 2L, 30000L);
        }
    }

    private void fetchProfilesSnapshot() {
        try {
            String raw = BeyondFirebaseRest.getJson(BeyondStateStore.getDbUrl(this) + "/profiles.json");
            if (raw == null || raw.trim().isEmpty() || "null".equals(raw.trim())) return;
            JSONObject root = new JSONObject(raw);
            Iterator<String> keys = root.keys();
            while (keys.hasNext()) {
                String id = keys.next();
                JSONObject p = root.optJSONObject(id);
                if (p == null) continue;
                String name = p.optString("name", "");
                String photo = p.isNull("photo") ? null : p.optString("photo", null);
                profileCache.put(id, new ProfileMeta(name, photo));
            }
        } catch (Throwable ignored) {
            // Will retry on demand
        }
    }

    private ProfileMeta lookupProfile(String profileId) {
        if (profileId == null || profileId.isEmpty()) return null;
        ProfileMeta cached = profileCache.get(profileId);
        if (cached != null) return cached;
        try {
            String raw = BeyondFirebaseRest.getJson(
                BeyondStateStore.getDbUrl(this) + "/profiles/" + BeyondFirebaseRest.encodeSegment(profileId) + ".json"
            );
            if (raw != null && !raw.trim().isEmpty() && !"null".equals(raw.trim())) {
                JSONObject p = new JSONObject(raw);
                ProfileMeta meta = new ProfileMeta(
                    p.optString("name", ""),
                    p.isNull("photo") ? null : p.optString("photo", null)
                );
                profileCache.put(profileId, meta);
                return meta;
            }
        } catch (Throwable ignored) {}
        return null;
    }

    /* ============================================================
       DIRECT CHATS SSE HANDLER
       ============================================================ */
    private void handleChatsEvent(String myId, String event, String path, Object data, boolean isInitial) {
        String[] segs = splitPath(path);

        if (segs.length == 0) {
            if (!(data instanceof JSONObject)) return;
            JSONObject allChats = (JSONObject) data;
            long lastNotified = BeyondStateStore.getLastMsgNotifiedAt(this);
            Iterator<String> chatIds = allChats.keys();
            while (chatIds.hasNext()) {
                String chatId = chatIds.next();
                JSONObject chatObj = allChats.optJSONObject(chatId);
                if (chatObj == null || !isMyChat(chatId, chatObj, myId)) continue;
                inspectFullChat(myId, chatId, chatObj, isInitial, lastNotified);
            }
            return;
        }

        String chatId = segs[0];
        if (!chatIdContainsUser(chatId, myId)) {
            if (segs.length == 1 && data instanceof JSONObject) {
                if (!isMyChat(chatId, (JSONObject) data, myId)) return;
            } else {
                return;
            }
        }

        if (segs.length == 1) {
            if (data instanceof JSONObject) {
                inspectFullChat(myId, chatId, (JSONObject) data, false, 0L);
            }
            return;
        }

        if ("reads".equals(segs[1])) {
            if (segs.length == 3 && myId.equals(segs[2]) && data instanceof Number) {
                chatReads.put(chatId, ((Number) data).longValue());
                BeyondNotificationHelper.clearConversationNotification(this, "dm:" + chatId);
            } else if (segs.length == 2 && data instanceof JSONObject) {
                JSONObject reads = (JSONObject) data;
                if (reads.has(myId)) {
                    chatReads.put(chatId, reads.optLong(myId, 0L));
                    BeyondNotificationHelper.clearConversationNotification(this, "dm:" + chatId);
                }
            }
            return;
        }

        if ("messages".equals(segs[1])) {
            if (segs.length == 3 && data instanceof JSONObject) {
                handleIncomingDmMessage(myId, chatId, segs[2], (JSONObject) data, false, 0L);
            } else if (segs.length == 2 && data instanceof JSONObject) {
                JSONObject msgs = (JSONObject) data;
                Iterator<String> msgIds = msgs.keys();
                while (msgIds.hasNext()) {
                    String msgId = msgIds.next();
                    JSONObject m = msgs.optJSONObject(msgId);
                    if (m != null) {
                        handleIncomingDmMessage(myId, chatId, msgId, m, false, 0L);
                    }
                }
            }
        }
    }

    private void inspectFullChat(String myId, String chatId, JSONObject chatObj, boolean isInitial, long lastNotified) {
        JSONObject reads = chatObj.optJSONObject("reads");
        long myRead = reads != null ? reads.optLong(myId, 0L) : 0L;
        chatReads.put(chatId, myRead);

        JSONObject messages = chatObj.optJSONObject("messages");
        if (messages == null) return;
        Iterator<String> msgIds = messages.keys();
        while (msgIds.hasNext()) {
            String msgId = msgIds.next();
            JSONObject msgObj = messages.optJSONObject(msgId);
            if (msgObj != null) {
                handleIncomingDmMessage(myId, chatId, msgId, msgObj, isInitial, lastNotified);
            }
        }
    }

    private void handleIncomingDmMessage(
        String myId,
        String chatId,
        String msgId,
        JSONObject msgObj,
        boolean isInitial,
        long lastNotified
    ) {
        String key = "dm:" + chatId + ":" + msgId;
        if (!markSeenKey(key)) return;

        String senderId = msgObj.optString("senderId", "");
        if (senderId.isEmpty() || myId.equals(senderId)) return;

        long createdAt = msgObj.optLong("createdAt", System.currentTimeMillis());
        Long readObj = chatReads.get(chatId);
        long myRead = readObj != null ? readObj : 0L;

        if (isInitial) {
            // Only notify missed unread messages that arrived after our last notified timestamp
            if (lastNotified <= 0L || createdAt <= lastNotified || createdAt <= myRead) {
                return;
            }
        }

        BeyondStateStore.updateLastMsgNotifiedAt(this, Math.max(createdAt, System.currentTimeMillis()));

        if (!BeyondStateStore.isMessagesEnabled(this)) return;
        String convoKey = "dm:" + chatId;
        if (BeyondStateStore.isViewingConversation(convoKey)) return;

        ProfileMeta senderMeta = lookupProfile(senderId);
        String senderName = (senderMeta != null && !senderMeta.name.isEmpty())
            ? senderMeta.name
            : msgObj.optString("senderName", "New Message");
        String avatar = senderMeta != null ? senderMeta.photo : null;
        String text = msgObj.optString("text", "New message");

        BeyondNotificationHelper.showMessageNotification(
            this,
            "dm",
            chatId,
            senderName,
            null,
            text,
            createdAt,
            avatar
        );
    }

    /* ============================================================
       GROUP CHATS SSE HANDLER
       ============================================================ */
    private void handleGroupsEvent(String myId, String event, String path, Object data, boolean isInitial) {
        String[] segs = splitPath(path);

        if (segs.length == 0) {
            if (!(data instanceof JSONObject)) return;
            JSONObject allGroups = (JSONObject) data;
            long lastNotified = BeyondStateStore.getLastMsgNotifiedAt(this);
            Iterator<String> groupIds = allGroups.keys();
            while (groupIds.hasNext()) {
                String groupId = groupIds.next();
                JSONObject g = allGroups.optJSONObject(groupId);
                if (g != null) {
                    inspectFullGroup(myId, groupId, g, isInitial, lastNotified);
                }
            }
            return;
        }

        String groupId = segs[0];
        if (segs.length == 1) {
            if (data == null) {
                groupCache.remove(groupId);
                BeyondNotificationHelper.clearConversationNotification(this, "group:" + groupId);
            } else if (data instanceof JSONObject) {
                inspectFullGroup(myId, groupId, (JSONObject) data, false, 0L);
            }
            return;
        }

        GroupMeta meta = groupCache.get(groupId);
        if ("name".equals(segs[1]) && data instanceof String) {
            if (meta != null) meta.name = (String) data;
            return;
        }

        if ("members".equals(segs[1])) {
            if (meta == null) {
                meta = new GroupMeta("Group");
                groupCache.put(groupId, meta);
            }
            if (segs.length == 2 && data instanceof JSONObject) {
                updateGroupMembers(meta, (JSONObject) data);
            } else if (segs.length == 3) {
                String uid = segs[2];
                if (Boolean.TRUE.equals(data)) {
                    meta.members.add(uid);
                } else {
                    meta.members.remove(uid);
                }
            }
            return;
        }

        if ("reads".equals(segs[1])) {
            if (segs.length == 3 && myId.equals(segs[2]) && data instanceof Number) {
                if (meta != null) meta.myRead = ((Number) data).longValue();
                BeyondNotificationHelper.clearConversationNotification(this, "group:" + groupId);
            } else if (segs.length == 2 && data instanceof JSONObject) {
                JSONObject reads = (JSONObject) data;
                if (reads.has(myId)) {
                    if (meta != null) meta.myRead = reads.optLong(myId, 0L);
                    BeyondNotificationHelper.clearConversationNotification(this, "group:" + groupId);
                }
            }
            return;
        }

        if ("messages".equals(segs[1])) {
            if (meta == null) {
                meta = fetchGroupMeta(myId, groupId);
            }
            if (meta == null || !meta.members.contains(myId)) return;

            if (segs.length == 3 && data instanceof JSONObject) {
                handleIncomingGroupMessage(myId, groupId, meta, segs[2], (JSONObject) data, false, 0L);
            } else if (segs.length == 2 && data instanceof JSONObject) {
                JSONObject msgs = (JSONObject) data;
                Iterator<String> msgIds = msgs.keys();
                while (msgIds.hasNext()) {
                    String msgId = msgIds.next();
                    JSONObject m = msgs.optJSONObject(msgId);
                    if (m != null) {
                        handleIncomingGroupMessage(myId, groupId, meta, msgId, m, false, 0L);
                    }
                }
            }
        }
    }

    private void inspectFullGroup(String myId, String groupId, JSONObject g, boolean isInitial, long lastNotified) {
        GroupMeta meta = groupCache.get(groupId);
        if (meta == null) {
            meta = new GroupMeta(g.optString("name", "Group"));
            groupCache.put(groupId, meta);
        } else if (g.has("name")) {
            meta.name = g.optString("name", meta.name);
        }

        JSONObject membersObj = g.optJSONObject("members");
        if (membersObj != null) {
            updateGroupMembers(meta, membersObj);
        }

        if (!meta.members.contains(myId)) return;

        JSONObject reads = g.optJSONObject("reads");
        if (reads != null) {
            meta.myRead = reads.optLong(myId, 0L);
        }

        JSONObject messages = g.optJSONObject("messages");
        if (messages == null) return;
        Iterator<String> msgIds = messages.keys();
        while (msgIds.hasNext()) {
            String msgId = msgIds.next();
            JSONObject msgObj = messages.optJSONObject(msgId);
            if (msgObj != null) {
                handleIncomingGroupMessage(myId, groupId, meta, msgId, msgObj, isInitial, lastNotified);
            }
        }
    }

    private GroupMeta fetchGroupMeta(String myId, String groupId) {
        try {
            String raw = BeyondFirebaseRest.getJson(
                BeyondStateStore.getDbUrl(this) + "/groups/" + BeyondFirebaseRest.encodeSegment(groupId) + ".json"
            );
            if (raw == null || raw.trim().isEmpty() || "null".equals(raw.trim())) return null;
            JSONObject g = new JSONObject(raw);
            GroupMeta meta = new GroupMeta(g.optString("name", "Group"));
            JSONObject members = g.optJSONObject("members");
            if (members != null) updateGroupMembers(meta, members);
            JSONObject reads = g.optJSONObject("reads");
            if (reads != null) meta.myRead = reads.optLong(myId, 0L);
            groupCache.put(groupId, meta);
            return meta;
        } catch (Throwable ignored) {
            return null;
        }
    }

    private void updateGroupMembers(GroupMeta meta, JSONObject membersObj) {
        Set<String> fresh = new HashSet<>();
        Iterator<String> keys = membersObj.keys();
        while (keys.hasNext()) {
            String uid = keys.next();
            if (membersObj.optBoolean(uid, false)) {
                fresh.add(uid);
            }
        }
        meta.members.clear();
        meta.members.addAll(fresh);
    }

    private void handleIncomingGroupMessage(
        String myId,
        String groupId,
        GroupMeta meta,
        String msgId,
        JSONObject msgObj,
        boolean isInitial,
        long lastNotified
    ) {
        String key = "group:" + groupId + ":" + msgId;
        if (!markSeenKey(key)) return;

        String senderId = msgObj.optString("senderId", "");
        if (senderId.isEmpty() || myId.equals(senderId)) return;

        long createdAt = msgObj.optLong("createdAt", System.currentTimeMillis());

        if (isInitial) {
            if (lastNotified <= 0L || createdAt <= lastNotified || createdAt <= meta.myRead) {
                return;
            }
        }

        BeyondStateStore.updateLastMsgNotifiedAt(this, Math.max(createdAt, System.currentTimeMillis()));

        if (!BeyondStateStore.isMessagesEnabled(this)) return;
        String convoKey = "group:" + groupId;
        if (BeyondStateStore.isViewingConversation(convoKey)) return;

        ProfileMeta senderMeta = lookupProfile(senderId);
        String senderName = (senderMeta != null && !senderMeta.name.isEmpty())
            ? senderMeta.name
            : msgObj.optString("senderName", "Member");
        String avatar = senderMeta != null ? senderMeta.photo : null;
        String text = msgObj.optString("text", "New message");

        BeyondNotificationHelper.showMessageNotification(
            this,
            "group",
            groupId,
            senderName,
            meta.name,
            text,
            createdAt,
            avatar
        );
    }

    /* ============================================================
       VOICE & VIDEO CALLS SSE HANDLER
       ============================================================ */
    private void handleCallsEvent(String myId, String event, String path, Object data, boolean isInitial) {
        String[] segs = splitPath(path);

        if (segs.length == 0) {
            if (!(data instanceof JSONObject)) return;
            JSONObject allCalls = (JSONObject) data;
            Iterator<String> callIds = allCalls.keys();
            while (callIds.hasNext()) {
                String callId = callIds.next();
                JSONObject callObj = allCalls.optJSONObject(callId);
                if (callObj != null) {
                    inspectCallObject(myId, callId, callObj);
                }
            }
            return;
        }

        String callId = segs[0];
        if (segs.length == 1) {
            if (data == null) {
                // Call node deleted
                activeRingingCalls.remove(callId);
                BeyondNotificationHelper.cancelCallNotification(this, callId);
            } else if (data instanceof JSONObject) {
                inspectCallObject(myId, callId, (JSONObject) data);
            }
            return;
        }

        if (segs.length == 2 && "status".equals(segs[1]) && data instanceof String) {
            handleCallStatusChange(callId, (String) data);
        }
    }

    private void inspectCallObject(String myId, String callId, JSONObject callObj) {
        String calleeId = callObj.optString("calleeId", "");
        if (!myId.equals(calleeId)) return;

        String status = callObj.optString("status", "");
        if ("ringing".equals(status)) {
            long createdAt = callObj.optLong("createdAt", System.currentTimeMillis());
            if (Math.abs(System.currentTimeMillis() - createdAt) > 120_000L) return;

            String callerId = callObj.optString("callerId", "");
            ProfileMeta callerMeta = lookupProfile(callerId);
            String callerName = (callerMeta != null && !callerMeta.name.isEmpty())
                ? callerMeta.name
                : callObj.optString("callerName", "Unknown");
            boolean isVideo = callObj.optBoolean("video", false);

            activeRingingCalls.put(callId, new CallMeta(callerName, isVideo));

            if (seenCallIds.add(callId)) {
                if (!BeyondStateStore.isAppInForeground() && BeyondStateStore.isCallsEnabled(this)) {
                    BeyondNotificationHelper.showIncomingCallNotification(
                        this,
                        callId,
                        callerName,
                        isVideo,
                        callerMeta != null ? callerMeta.photo : null
                    );
                }
            }
        } else if (!status.isEmpty()) {
            handleCallStatusChange(callId, status);
        }
    }

    private void handleCallStatusChange(String callId, String status) {
        if ("ended".equals(status)) {
            CallMeta meta = activeRingingCalls.remove(callId);
            BeyondNotificationHelper.cancelCallNotification(this, callId);
            if (meta != null && !BeyondStateStore.isAppInForeground() && BeyondStateStore.isCallsEnabled(this)) {
                BeyondNotificationHelper.showMissedCallNotification(this, callId, meta.callerName, meta.isVideo);
            }
        } else if ("accepted".equals(status) || "declined".equals(status) || "busy".equals(status)) {
            activeRingingCalls.remove(callId);
            BeyondNotificationHelper.cancelCallNotification(this, callId);
        }
    }

    /* ============================================================
       HELPERS & NETWORK CALLBACK
       ============================================================ */
    private boolean markSeenKey(String key) {
        if (seenMsgKeys.size() > MAX_SEEN_KEYS) {
            seenMsgKeys.clear();
        }
        return seenMsgKeys.add(key);
    }

    private static boolean chatIdContainsUser(String chatId, String myId) {
        if (chatId == null || myId == null || myId.isEmpty()) return false;
        String[] parts = chatId.split("__");
        for (String p : parts) {
            if (myId.equals(p)) return true;
        }
        return false;
    }

    private static boolean isMyChat(String chatId, JSONObject chatObj, String myId) {
        if (chatIdContainsUser(chatId, myId)) return true;
        if (chatObj == null) return false;
        JSONObject meta = chatObj.optJSONObject("meta");
        if (meta == null) return false;
        JSONObject participants = meta.optJSONObject("participants");
        return participants != null && participants.optBoolean(myId, false);
    }

    private static String[] splitPath(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) {
            return new String[0];
        }
        String trimmed = path;
        if (trimmed.startsWith("/")) trimmed = trimmed.substring(1);
        if (trimmed.endsWith("/")) trimmed = trimmed.substring(0, trimmed.length() - 1);
        if (trimmed.isEmpty()) return new String[0];
        return trimmed.split("/");
    }

    private void registerNetworkCallback() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return;
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(@NonNull Network network) {
                    for (Thread t : workerThreads) {
                        if (t.getState() == Thread.State.TIMED_WAITING) {
                            t.interrupt();
                        }
                    }
                }
            };
            NetworkRequest req = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
            cm.registerNetworkCallback(req, networkCallback);
        } catch (Throwable ignored) {
            // Non-fatal
        }
    }

    private void unregisterNetworkCallback() {
        try {
            if (networkCallback != null) {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) {
                    cm.unregisterNetworkCallback(networkCallback);
                }
                networkCallback = null;
            }
        } catch (Throwable ignored) {}
    }
}
