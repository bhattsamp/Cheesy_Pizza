package com.cheesypizza.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Admin app only (declared in src/admin/AndroidManifest.xml). With the owner's OK ("Notification
 * access"), Android hands this service the notifications of the UPI apps the shop picked, e.g.
 * "Received ₹450 from RIPAL PATEL". Only alerts that mention an amount are sent, straight to the
 * Cheesy Pizza server, which reads them and marks the matching unpaid order paid. Alerts that
 * can't be sent (no internet) wait here and go with the next one.
 */
public class UpiAlertService extends NotificationListenerService {

    static final String PREFS = "upi_alerts";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String key = sp.getString("key", ""), base = sp.getString("base", "");
            if (key.isEmpty() || base.isEmpty()) return;
            Set<String> apps = new HashSet<>(Arrays.asList(sp.getString("apps", "").split(",")));
            if (!apps.contains(sbn.getPackageName())) return;
            Notification n = sbn.getNotification();
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle ex = n.extras;
            CharSequence title = ex.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence text = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (text == null) text = ex.getCharSequence(Notification.EXTRA_TEXT);
            String t = (title == null ? "" : title.toString()), x = (text == null ? "" : text.toString());
            String all = t + " " + x;
            // Only payment alerts: they always name an amount
            if (!(all.contains("₹") || all.matches("(?is).*\\b(rs\\.?|inr)\\s*[0-9].*"))) return;
            JSONObject j = new JSONObject();
            j.put("key", key);
            j.put("pkg", sbn.getPackageName());
            j.put("title", t);
            j.put("text", x);
            j.put("ts", sbn.getPostTime());
            sp.edit().putString("last", new JSONObject().put("ts", System.currentTimeMillis()).put("text", all.length() > 120 ? all.substring(0, 120) : all).toString()).apply();
            send(getApplicationContext(), j);
        } catch (Exception ignored) {
        }
    }

    /** Sends this alert and any that are still waiting; keeps the ones that fail for next time. */
    static void send(Context ctx, JSONObject alert) {
        new Thread(() -> {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            synchronized (UpiAlertService.class) {
                JSONArray waiting;
                try { waiting = new JSONArray(sp.getString("queue", "[]")); } catch (Exception e) { waiting = new JSONArray(); }
                if (alert != null) waiting.put(alert);
                JSONArray left = new JSONArray();
                String base = sp.getString("base", "");
                for (int i = 0; i < waiting.length(); i++) {
                    JSONObject a = waiting.optJSONObject(i);
                    if (a == null) continue;
                    if (!post(base + "/api/upi-alerts", a)) left.put(a);
                }
                // never keep more than the last 100
                JSONArray keep = new JSONArray();
                for (int i = Math.max(0, left.length() - 100); i < left.length(); i++) keep.put(left.opt(i));
                sp.edit().putString("queue", keep.toString()).apply();
            }
        }).start();
    }

    private static boolean post(String url, JSONObject body) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            int code = c.getResponseCode();
            return code < 500 && code != 429; // 4xx (e.g. a removed key) won't get better by retrying
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
