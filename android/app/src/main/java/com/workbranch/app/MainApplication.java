package com.workbranch.app;

import android.app.Application;
import android.content.Intent;
import android.util.Log;

public class MainApplication extends Application {
    private static final String TAG = "MainApplication";

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "=== MainApplication.onCreate START ===");
        try {
            startNodeService();
            Log.d(TAG, "=== MainApplication.onCreate OK, NodeService started ===");
        } catch (Exception e) {
            Log.e(TAG, "=== MainApplication.onCreate CRASH ===", e);
        }
    }

    private void startNodeService() {
        Log.d(TAG, "startNodeService: about to create Intent");
        Intent intent = new Intent(this, NodeService.class);
        Log.d(TAG, "startNodeService: about to startService");
        startService(intent);
        Log.d(TAG, "startNodeService: startService returned");
    }
}
