package com.beyondprofiles.app;

import android.content.Context;
import android.content.SharedPreferences;

public final class BeyondStateStore {

    private static final String PREFS_NAME = "beyond_profiles_native_prefs";
    private static final String KEY_PROFILE_ID = "profile_id";
    private static final String KEY_PROFILE_NAME = "profile_name";
    private static final String KEY_PROFILE_JSON = "profile_json";
    private static final String KEY_DB_URL = "db_url";
    private static final String KEY_PREF_MESSAGES = "pref_messages";
    private static final String KEY_PREF_CALLS = "pref_calls";
    private static final String KEY_PREF_SOUND = "pref_sound";
    private static final String KEY_PREF_VIBRATE = "pref_vibrate";
    private static final String KEY_LAST_MSG_TS = "last_msg_ts";

    public static final String DEFAULT_DB_URL = "https://beyondprofiles-5b71a-default-rtdb.firebaseio.com";

    private static volatile boolean appInForeground = false;
    private static volatile boolean serviceRunning = false;
    private static volatile String activeTab = "home";
    private static volatile String activeConvoKey = "";

    private BeyondStateStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static void saveSession(
        Context context,
        String profileId,
        String profileName,
        String profileJson,
        String dbUrl,
        boolean messages,
        boolean calls,
        boolean sound,
        boolean vibrate
    ) {
        SharedPreferences sp = prefs(context);
        String prevProfileId = sp.getString(KEY_PROFILE_ID, "");
        SharedPreferences.Editor editor = sp.edit();
        editor.putString(KEY_PROFILE_ID, profileId != null ? profileId : "");
        editor.putString(KEY_PROFILE_NAME, profileName != null ? profileName : "");
        if (profileJson != null) {
            editor.putString(KEY_PROFILE_JSON, profileJson);
        }
        if (dbUrl != null && !dbUrl.isEmpty()) {
            editor.putString(KEY_DB_URL, dbUrl.endsWith("/") ? dbUrl.substring(0, dbUrl.length() - 1) : dbUrl);
        }
        editor.putBoolean(KEY_PREF_MESSAGES, messages);
        editor.putBoolean(KEY_PREF_CALLS, calls);
        editor.putBoolean(KEY_PREF_SOUND, sound);
        editor.putBoolean(KEY_PREF_VIBRATE, vibrate);
        if (prevProfileId == null || !prevProfileId.equals(profileId)) {
            editor.putLong(KEY_LAST_MSG_TS, System.currentTimeMillis());
        } else if (sp.getLong(KEY_LAST_MSG_TS, 0L) == 0L) {
            editor.putLong(KEY_LAST_MSG_TS, System.currentTimeMillis());
        }
        editor.apply();
    }

    public static void clearSession(Context context) {
        prefs(context)
            .edit()
            .remove(KEY_PROFILE_ID)
            .remove(KEY_PROFILE_NAME)
            .remove(KEY_PROFILE_JSON)
            .remove(KEY_LAST_MSG_TS)
            .apply();
        activeConvoKey = "";
    }

    public static String getProfileId(Context context) {
        String id = prefs(context).getString(KEY_PROFILE_ID, "");
        return id != null ? id : "";
    }

    public static String getProfileName(Context context) {
        String name = prefs(context).getString(KEY_PROFILE_NAME, "");
        return name != null ? name : "";
    }

    public static String getProfileJson(Context context) {
        String json = prefs(context).getString(KEY_PROFILE_JSON, "");
        return json != null ? json : "";
    }

    public static String getDbUrl(Context context) {
        String url = prefs(context).getString(KEY_DB_URL, DEFAULT_DB_URL);
        if (url == null || url.isEmpty()) {
            return DEFAULT_DB_URL;
        }
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    public static void savePrefs(
        Context context,
        boolean messages,
        boolean calls,
        boolean sound,
        boolean vibrate
    ) {
        prefs(context)
            .edit()
            .putBoolean(KEY_PREF_MESSAGES, messages)
            .putBoolean(KEY_PREF_CALLS, calls)
            .putBoolean(KEY_PREF_SOUND, sound)
            .putBoolean(KEY_PREF_VIBRATE, vibrate)
            .apply();
    }

    public static boolean isMessagesEnabled(Context context) {
        return prefs(context).getBoolean(KEY_PREF_MESSAGES, true);
    }

    public static boolean isCallsEnabled(Context context) {
        return prefs(context).getBoolean(KEY_PREF_CALLS, true);
    }

    public static boolean isSoundEnabled(Context context) {
        return prefs(context).getBoolean(KEY_PREF_SOUND, true);
    }

    public static boolean isVibrateEnabled(Context context) {
        return prefs(context).getBoolean(KEY_PREF_VIBRATE, true);
    }

    public static long getLastMsgNotifiedAt(Context context) {
        return prefs(context).getLong(KEY_LAST_MSG_TS, 0L);
    }

    public static void updateLastMsgNotifiedAt(Context context, long ts) {
        if (ts <= 0L) return;
        SharedPreferences sp = prefs(context);
        long current = sp.getLong(KEY_LAST_MSG_TS, 0L);
        if (ts > current) {
            sp.edit().putLong(KEY_LAST_MSG_TS, ts).apply();
        }
    }

    public static void setAppInForeground(boolean foreground) {
        appInForeground = foreground;
    }

    public static boolean isAppInForeground() {
        return appInForeground;
    }

    public static void setServiceRunning(boolean running) {
        serviceRunning = running;
    }

    public static boolean isServiceRunning() {
        return serviceRunning;
    }

    public static void setActiveScreen(String tab, String convoKey) {
        activeTab = tab != null ? tab : "home";
        activeConvoKey = convoKey != null ? convoKey : "";
    }

    public static String getActiveTab() {
        return activeTab;
    }

    public static String getActiveConvoKey() {
        return activeConvoKey;
    }

    public static boolean isViewingConversation(String convoKey) {
        return appInForeground && "chats".equals(activeTab) && convoKey != null && convoKey.equals(activeConvoKey);
    }
}
