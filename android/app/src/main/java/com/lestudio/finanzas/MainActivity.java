package com.lestudio.finanzas;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FinanzasWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
