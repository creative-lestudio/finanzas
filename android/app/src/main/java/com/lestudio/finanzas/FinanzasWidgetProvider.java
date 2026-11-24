package com.lestudio.finanzas;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Widget de pantalla de inicio. Muestra lo que la app le deja en SharedPreferences (solo si el usuario
 * activó «Mostrar saldo en el widget»); si no hay datos muestra un acceso rápido sin cifras.
 */
public class FinanzasWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "finanzas_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    /** Refresca todos los widgets colocados (lo llama el plugin cuando la app envía datos nuevos). */
    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FinanzasWidgetProvider.class));
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    static RemoteViews build(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean show = p.getBoolean("show", false);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_finanzas);
        if (show) {
            v.setTextViewText(R.id.widget_title, p.getString("title", context.getString(R.string.widget_available)));
            v.setTextViewText(R.id.widget_amount, p.getString("amount", "—"));
            v.setTextViewText(R.id.widget_sub, p.getString("sub", ""));
            v.setViewVisibility(R.id.widget_sub, View.VISIBLE);
        } else {
            v.setTextViewText(R.id.widget_title, context.getString(R.string.app_name));
            v.setTextViewText(R.id.widget_amount, context.getString(R.string.widget_open));
            v.setViewVisibility(R.id.widget_sub, View.GONE);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        // Tocar el widget abre la app.
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, open, flags));
        // El botón «+» abre «Nuevo movimiento» (enlace profundo que la app entiende).
        Intent add = new Intent(Intent.ACTION_VIEW, Uri.parse("com.lestudio.finanzas://nuevo"), context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.widget_add, PendingIntent.getActivity(context, 1, add, flags));
        return v;
    }
}
