package com.workbranch.app;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;
import com.janeasystems.nodejsmobile.NodeJS;

public class NodeService extends Service {
    private static final String TAG = "NodeService";
    private static NodeJS nodeInstance;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "NodeService onCreate");
        startNodeJS();
    }

    private void startNodeJS() {
        if (nodeInstance == null) {
            try {
                nodeInstance = NodeJS.getInstance(this);
                nodeInstance.start("server.js");
                Log.d(TAG, "Node.js backend started successfully");
            } catch (Exception e) {
                Log.e(TAG, "Failed to start Node.js backend", e);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "NodeService onStartCommand");
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "NodeService onDestroy");
        stopNodeJS();
    }

    private void stopNodeJS() {
        if (nodeInstance != null) {
            try {
                nodeInstance.stop();
                nodeInstance = null;
                Log.d(TAG, "Node.js backend stopped");
            } catch (Exception e) {
                Log.e(TAG, "Error stopping Node.js backend", e);
            }
        }
    }
}
