package com.workbranch.app;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetManager;
import android.os.IBinder;
import android.system.Os;
import android.system.ErrnoException;
import android.util.Log;

import java.io.*;
import java.util.ArrayList;

public class NodeService extends Service {
    private static final String TAG = "NodeService";

    private static final String PROJECT_ROOT = "www/nodejs-project";
    private static final String BUILTIN_MODULES = "nodejs-mobile-cordova-assets/builtin_modules";

    private static boolean isNodeRunning = false;
    private static boolean nodeStartedOnce = false;

    private String filesDir;
    private String nodeAppRootAbsolutePath;
    private String nodePath;

    static {
        System.loadLibrary("nodejs-mobile-cordova-native-lib");
        System.loadLibrary("node");
    }

    public native Integer startNodeWithArguments(String[] arguments, String nodePath, boolean redirectOutputToLogcat);
    public native void registerNodeDataDirPath(String dataDir);
    public native void sendMessageToNodeChannel(String channelName, String msg);
    public native String getCurrentABIName();

    public static void sendMessageToApplication(String channelName, String msg) {
        Log.d(TAG, "Received from Node: [" + channelName + "] " + msg);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "NodeService onCreate");

        try {
            Os.setenv("TMPDIR", getCacheDir().getAbsolutePath(), true);
        } catch (ErrnoException e) {
            Log.e(TAG, "Failed to set TMPDIR", e);
        }

        filesDir = getFilesDir().getAbsolutePath();
        registerNodeDataDirPath(filesDir);

        nodeAppRootAbsolutePath = filesDir + "/" + PROJECT_ROOT;
        nodePath = nodeAppRootAbsolutePath + ":" + filesDir + "/" + BUILTIN_MODULES;

        copyNodeAssets();
        startNodeJS();
    }

    private void copyNodeAssets() {
        try {
            File nodejsProjectFolder = new File(nodeAppRootAbsolutePath);
            if (nodejsProjectFolder.exists()) {
                deleteRecursive(nodejsProjectFolder);
            }
            nodejsProjectFolder.mkdirs();

            File builtinModulesFolder = new File(filesDir + "/" + BUILTIN_MODULES);
            if (builtinModulesFolder.exists()) {
                deleteRecursive(builtinModulesFolder);
            }
            builtinModulesFolder.mkdirs();

            copyAssetFolder("www/nodejs-project", nodeAppRootAbsolutePath);
            copyAssetFolder(BUILTIN_MODULES, filesDir + "/" + BUILTIN_MODULES);

            Log.d(TAG, "Node assets copied successfully");
        } catch (Exception e) {
            Log.e(TAG, "Failed to copy node assets", e);
        }
    }

    private void deleteRecursive(File fileOrDirectory) {
        if (fileOrDirectory.isDirectory()) {
            for (File child : fileOrDirectory.listFiles()) {
                deleteRecursive(child);
            }
        }
        fileOrDirectory.delete();
    }

    private void copyAssetFolder(String srcFolder, String destPath) throws IOException {
        AssetManager assetManager = getAssets();
        String[] files = assetManager.list(srcFolder);

        if (files == null || files.length == 0) {
            copyAssetFile(srcFolder, destPath);
            return;
        }

        new File(destPath).mkdirs();
        for (String file : files) {
            copyAssetFolder(srcFolder + "/" + file, destPath + "/" + file);
        }
    }

    private void copyAssetFile(String srcPath, String destPath) throws IOException {
        InputStream in = getAssets().open(srcPath);
        new File(destPath).createNewFile();
        OutputStream out = new FileOutputStream(destPath);
        byte[] buffer = new byte[1024];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
        in.close();
        out.flush();
        out.close();
    }

    private void startNodeJS() {
        if (nodeStartedOnce) {
            Log.w(TAG, "Node.js was already started once, not restarting to avoid mutex issues");
            return;
        }
        
        if (isNodeRunning) {
            Log.w(TAG, "Node.js is already running");
            return;
        }
        
        isNodeRunning = true;
        nodeStartedOnce = true;
        
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    File entryFile = new File(nodeAppRootAbsolutePath + "/index.js");
                    if (!entryFile.exists()) {
                        Log.e(TAG, "index.js not found at " + entryFile.getAbsolutePath());
                        isNodeRunning = false;
                        return;
                    }

                    Os.setenv("FILES_DIR", filesDir, true);
                    Os.setenv("NODE_PATH", nodePath, true);

                    Log.d(TAG, "Starting Node.js with script: " + entryFile.getAbsolutePath());
                    Log.d(TAG, "FILES_DIR: " + filesDir);
                    Log.d(TAG, "NODE_PATH: " + nodePath);
                    
                    Integer result = startNodeWithArguments(
                        new String[]{"node", entryFile.getAbsolutePath()},
                        nodePath,
                        true
                    );
                    Log.d(TAG, "Node.js exited with code: " + result);
                    isNodeRunning = false;
                } catch (Exception e) {
                    Log.e(TAG, "Failed to start Node.js", e);
                    isNodeRunning = false;
                }
            }
        }).start();
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
    }
}
