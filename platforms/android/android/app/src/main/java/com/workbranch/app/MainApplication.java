package com.workbranch.app;

import android.app.Application;
import android.content.Intent;
import android.util.Log;

public class MainApplication extends Application {
    private static final String TAG = "MainApplication";

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "MainApplication onCreate");
        startNodeService();
    }

    private void startNodeService() {
        Intent intent = new Intent(this, NodeService.class);
        startService(intent);
        Log.d(TAG, "NodeService started");
    }
}
