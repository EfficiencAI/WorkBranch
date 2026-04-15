package com.workbranch.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.getSettings().setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);
            webView.clearCache(true);
            webView.clearHistory();
        }
    }
}
