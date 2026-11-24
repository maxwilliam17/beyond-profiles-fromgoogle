package com.beyondprofiles.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BeyondNative",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
    }
)
public class BeyondNativePlugin extends Plugin {

    private volatile JSObject pendingAction = null;

    @Override
    public void load() {
        super.load();
        BeyondNotificationHelper.ensureChannels(getContext());
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        BeyondStateStore.setAppInForeground(true);
        if (!BeyondStateStore.getProfileId(getContext()).isEmpty() && !BeyondStateStore.isServiceRunning()) {
            BeyondNotificationService.start(getContext());
        }
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        BeyondStateStore.setAppInForeground(false);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null) return;

        String callId = intent.getStringExtra(BeyondNotificationHelper.EXTRA_CALL_ID);
        String target = intent.getStringExtra(BeyondNotificationHelper.EXTRA_TARGET);

        if (callId != null && !callId.isEmpty()) {
            String callAction = intent.getStringExtra(BeyondNotificationHelper.EXTRA_CALL_ACTION);
            if (callAction == null || callAction.isEmpty()) callAction = "open";

            BeyondNotificationHelper.cancelCallNotification(getContext(), callId);
            intent.removeExtra(BeyondNotificationHelper.EXTRA_CALL_ID);
            intent.removeExtra(BeyondNotificationHelper.EXTRA_CALL_ACTION);

            JSObject payload = new JSObject();
            payload.put("type", "call-action");
            payload.put("callId", callId);
            payload.put("action", callAction);
            dispatchNotificationAction(payload);
            return;
        }

        if (target != null && !target.isEmpty()) {
            BeyondNotificationHelper.clearConversationNotification(getContext(), target);
            intent.removeExtra(BeyondNotificationHelper.EXTRA_TARGET);

            JSObject payload = new JSObject();
            payload.put("type", "open-conversation");
            payload.put("target", target);
            dispatchNotificationAction(payload);
        }
    }

    private void dispatchNotificationAction(JSObject payload) {
        if (hasListeners("notificationAction")) {
            pendingAction = null;
            notifyListeners("notificationAction", payload, false);
        } else {
            pendingAction = payload;
        }
    }

    @PluginMethod
    public void consumePendingAction(PluginCall call) {
        JSObject action = pendingAction;
        pendingAction = null;
        JSObject ret = new JSObject();
        if (action != null) {
            ret.put("hasAction", true);
            ret.put("type", action.getString("type"));
            if (action.has("target")) ret.put("target", action.getString("target"));
            if (action.has("callId")) ret.put("callId", action.getString("callId"));
            if (action.has("action")) ret.put("action", action.getString("action"));
        } else {
            ret.put("hasAction", false);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        call.resolve(buildStatusObject());
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(buildStatusObject());
            return;
        }
        if (
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            call.resolve(buildStatusObject());
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsPermsCallback");
    }

    @PermissionCallback
    private void notificationsPermsCallback(PluginCall call) {
        call.resolve(buildStatusObject());
    }

    @PluginMethod
    public void setLoggedInSession(PluginCall call) {
        String profileId = call.getString("profileId", "");
        String profileName = call.getString("profileName", "");
        String profileJson = call.getString("profileJson", "");
        String dbUrl = call.getString("dbUrl", BeyondStateStore.DEFAULT_DB_URL);
        boolean messages = Boolean.TRUE.equals(call.getBoolean("messages", true));
        boolean calls = Boolean.TRUE.equals(call.getBoolean("calls", true));
        boolean sound = Boolean.TRUE.equals(call.getBoolean("sound", true));
        boolean vibrate = Boolean.TRUE.equals(call.getBoolean("vibrate", true));

        BeyondStateStore.saveSession(
            getContext(),
            profileId,
            profileName,
            profileJson,
            dbUrl,
            messages,
            calls,
            sound,
            vibrate
        );

        boolean started = false;
        if (profileId != null && !profileId.isEmpty()) {
            started = BeyondNotificationService.start(getContext());
        }

        JSObject ret = new JSObject();
        ret.put("started", started);
        call.resolve(ret);
    }

    @PluginMethod
    public void getLoggedInSession(PluginCall call) {
        JSObject ret = new JSObject();
        String profileId = BeyondStateStore.getProfileId(getContext());
        if (!profileId.isEmpty()) {
            ret.put("profileId", profileId);
            ret.put("profileName", BeyondStateStore.getProfileName(getContext()));
            ret.put("profileJson", BeyondStateStore.getProfileJson(getContext()));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void updateNotificationPrefs(PluginCall call) {
        boolean messages = Boolean.TRUE.equals(call.getBoolean("messages", true));
        boolean calls = Boolean.TRUE.equals(call.getBoolean("calls", true));
        boolean sound = Boolean.TRUE.equals(call.getBoolean("sound", true));
        boolean vibrate = Boolean.TRUE.equals(call.getBoolean("vibrate", true));
        BeyondStateStore.savePrefs(getContext(), messages, calls, sound, vibrate);
        call.resolve();
    }

    @PluginMethod
    public void setActiveScreen(PluginCall call) {
        String tab = call.getString("tab", "home");
        String convoKey = call.getString("convoKey", "");
        BeyondStateStore.setActiveScreen(tab, convoKey);
        if (convoKey != null && !convoKey.isEmpty()) {
            BeyondNotificationHelper.clearConversationNotification(getContext(), convoKey);
        }
        call.resolve();
    }

    @PluginMethod
    public void clearConversationNotification(PluginCall call) {
        String convoKey = call.getString("convoKey", "");
        if (convoKey != null && !convoKey.isEmpty()) {
            BeyondNotificationHelper.clearConversationNotification(getContext(), convoKey);
        }
        call.resolve();
    }

    @PluginMethod
    public void clearCallNotification(PluginCall call) {
        String callId = call.getString("callId", "");
        if (callId != null && !callId.isEmpty()) {
            BeyondNotificationHelper.cancelCallNotification(getContext(), callId);
        }
        call.resolve();
    }

    @PluginMethod
    public void showTestNotification(PluginCall call) {
        boolean shown = BeyondNotificationHelper.showTestNotification(getContext());
        JSObject ret = new JSObject();
        ret.put("shown", shown);
        call.resolve(ret);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + ctx.getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
        } catch (Throwable ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        try {
            Context ctx = getContext();
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + ctx.getPackageName()));
                Activity activity = getActivity();
                if (activity != null) {
                    activity.startActivity(intent);
                } else {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(intent);
                }
            }
        } catch (Throwable ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void logout(PluginCall call) {
        BeyondStateStore.clearSession(getContext());
        BeyondNotificationService.stop(getContext());
        BeyondNotificationHelper.clearAllNotifications(getContext());
        call.resolve();
    }

    private JSObject buildStatusObject() {
        Context ctx = getContext();
        String permStr;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean granted =
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED;
            boolean enabled = NotificationManagerCompat.from(ctx).areNotificationsEnabled();
            if (granted && enabled) {
                permStr = "granted";
            } else if (granted && !enabled) {
                permStr = "denied";
            } else {
                PermissionState state = getPermissionState("notifications");
                if (state == PermissionState.DENIED) {
                    permStr = "denied";
                } else {
                    permStr = "prompt";
                }
            }
        } else {
            permStr = NotificationManagerCompat.from(ctx).areNotificationsEnabled() ? "granted" : "denied";
        }

        boolean fullScreenAllowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                fullScreenAllowed = nm.canUseFullScreenIntent();
            }
        }

        boolean ignoringBattery = false;
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            ignoringBattery = pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }

        JSObject ret = new JSObject();
        ret.put("permission", permStr);
        ret.put("fullScreenIntentAllowed", fullScreenAllowed);
        ret.put("ignoringBatteryOptimizations", ignoringBattery);
        ret.put("serviceRunning", BeyondStateStore.isServiceRunning());
        return ret;
    }
}
