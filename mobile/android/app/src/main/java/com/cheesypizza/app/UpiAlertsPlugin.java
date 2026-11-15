package com.cheesypizza.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/** The till's settings for reading UPI alerts on this phone (see UpiAlertService). */
@CapacitorPlugin(name = "UpiAlerts")
public class UpiAlertsPlugin extends Plugin {

    private static final String[][] KNOWN = {
        {"com.phonepe.app.business", "PhonePe Business"}, {"com.paytm.business", "Paytm for Business"},
        {"com.google.android.apps.nbu.paisa.merchant", "GPay for Business"}, {"com.bharatpe.app", "BharatPe"},
        {"com.phonepe.app", "PhonePe"}, {"com.google.android.apps.nbu.paisa.user", "Google Pay"},
        {"net.one97.paytm", "Paytm"}, {"in.org.npci.upiapp", "BHIM"},
        {"com.google.android.apps.messaging", "Messages (bank SMS)"},
    };

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(UpiAlertService.PREFS, Context.MODE_PRIVATE);
    }

    private boolean hasAccess() {
        Context ctx = getContext();
        String on = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        return on != null && on.contains(new ComponentName(ctx, UpiAlertService.class).flattenToString());
    }

    private boolean declared() {
        try {
            getContext().getPackageManager().getServiceInfo(new ComponentName(getContext(), UpiAlertService.class), 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences sp = prefs();
        JSObject r = new JSObject();
        r.put("supported", declared());
        r.put("access", hasAccess());
        r.put("on", !sp.getString("key", "").isEmpty());
        r.put("outletId", sp.getString("outletId", ""));
        r.put("apps", sp.getString("apps", ""));
        r.put("waiting", sp.getString("queue", "[]").split("\\{").length - 1);
        try { r.put("last", new JSObject(sp.getString("last", "{}"))); } catch (Exception e) { r.put("last", new JSObject()); }
        JSArray list = new JSArray();
        PackageManager pm = getContext().getPackageManager();
        for (String[] a : KNOWN) {
            try {
                pm.getPackageInfo(a[0], 0);
                JSObject o = new JSObject();
                o.put("pkg", a[0]);
                o.put("name", a[1]);
                list.put(o);
            } catch (Exception ignored) {
            }
        }
        r.put("installed", list);
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void setup(PluginCall call) {
        SharedPreferences.Editor e = prefs().edit();
        if (call.hasOption("base")) e.putString("base", call.getString("base", "").replaceAll("/+$", ""));
        if (call.hasOption("key")) e.putString("key", call.getString("key", ""));
        if (call.hasOption("outletId")) e.putString("outletId", call.getString("outletId", ""));
        if (call.hasOption("apps")) e.putString("apps", call.getString("apps", ""));
        e.apply();
        UpiAlertService.send(getContext().getApplicationContext(), null); // send anything still waiting
        call.resolve();
    }

    /** Sends a made-up alert through the same path, so the owner can see it reach the till. */
    @PluginMethod
    public void test(PluginCall call) {
        try {
            SharedPreferences sp = prefs();
            JSONObject j = new JSONObject();
            j.put("key", sp.getString("key", ""));
            j.put("pkg", "test");
            j.put("title", "Test alert");
            j.put("text", "Received ₹" + call.getString("amt", "1") + " from TEST PAYMENT");
            j.put("ts", System.currentTimeMillis());
            UpiAlertService.send(getContext().getApplicationContext(), j);
            call.resolve();
        } catch (Exception ex) {
            call.reject(ex.getMessage());
        }
    }

    @PluginMethod
    public void off(PluginCall call) {
        prefs().edit().remove("key").remove("queue").apply();
        call.resolve();
    }
}
