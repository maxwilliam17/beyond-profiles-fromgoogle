package com.beyondprofiles.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BeyondNativePlugin.class);
        super.onCreate(savedInstanceState);

        BeyondNotificationHelper.ensureChannels(this);
        applyCallLockscreenFlags(getIntent());

        if (!BeyondStateStore.getProfileId(this).isEmpty()) {
            BeyondNotificationService.start(this);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        applyCallLockscreenFlags(intent);
        super.onNewIntent(intent);
    }

    @SuppressWarnings("deprecation")
    private void applyCallLockscreenFlags(Intent intent) {
        boolean isIncomingCall =
            intent != null &&
            intent.getStringExtra(BeyondNotificationHelper.EXTRA_CALL_ID) != null;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(isIncomingCall);
            setTurnScreenOn(isIncomingCall);
        } else if (getWindow() != null) {
            int flags =
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
            if (isIncomingCall) {
                getWindow().addFlags(flags);
            } else {
                getWindow().clearFlags(flags);
            }
        }
    }
}
