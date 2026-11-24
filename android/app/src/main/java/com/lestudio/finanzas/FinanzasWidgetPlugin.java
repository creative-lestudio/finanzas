package com.lestudio.finanzas;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Puente entre la app web y el widget: guarda el resumen y refresca el widget. */
@CapacitorPlugin(name = "FinanzasWidget")
public class FinanzasWidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor e = ctx.getSharedPreferences(FinanzasWidgetProvider.PREFS, Context.MODE_PRIVATE).edit();
        boolean show = Boolean.TRUE.equals(call.getBoolean("show", false));
        e.putBoolean("show", show);
        if (show) {
            e.putString("title", call.getString("title", ""));
            e.putString("amount", call.getString("amount", "—"));
            e.putString("sub", call.getString("sub", ""));
        } else {
            // Sin permiso para mostrar cifras: no se guarda nada.
            e.remove("title").remove("amount").remove("sub");
        }
        e.apply();
        FinanzasWidgetProvider.refresh(ctx);
        call.resolve(new JSObject());
    }
}
