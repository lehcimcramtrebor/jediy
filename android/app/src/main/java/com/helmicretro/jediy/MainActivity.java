package com.helmicretro.jediy;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Disable system font scaling (accessibility text zoom)
        WebSettings settings = this.getBridge().getWebView().getSettings();
        settings.setTextZoom(100);
    }
}

