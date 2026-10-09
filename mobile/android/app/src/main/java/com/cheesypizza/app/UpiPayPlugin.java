package com.cheesypizza.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens GPay, PhonePe, Paytm or any UPI app with a upi://pay link and hands back what the app
 * reports when it closes, e.g. "txnId=..&responseCode=00&Status=SUCCESS&ApprovalRefNo=..".
 * Free: no payment gateway is involved; the money goes straight to the shop's UPI ID.
 */
@CapacitorPlugin(name = "UpiPay")
public class UpiPayPlugin extends Plugin {

    @PluginMethod
    public void hasApp(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay"));
        JSObject r = new JSObject();
        r.put("value", !getContext().getPackageManager().queryIntentActivities(i, 0).isEmpty());
        call.resolve(r);
    }

    @PluginMethod
    public void pay(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("upi://pay")) {
            call.reject("Not a UPI payment link");
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        try {
            startActivityForResult(call, Intent.createChooser(i, "Pay with"), "payDone");
        } catch (ActivityNotFoundException e) {
            call.reject("No UPI app on this phone", "NO_APP");
        }
    }

    @ActivityCallback
    private void payDone(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        Intent data = result.getData();
        String response = "";
        if (data != null) {
            String s = data.getStringExtra("response");
            if (s != null) response = s;
            else {
                // A few apps send the fields as separate extras instead of one string
                Bundle b = data.getExtras();
                if (b != null) {
                    StringBuilder sb = new StringBuilder();
                    for (String k : b.keySet()) {
                        Object v = b.get(k);
                        if (v instanceof String) sb.append(sb.length() > 0 ? "&" : "").append(k).append('=').append(v);
                    }
                    response = sb.toString();
                }
            }
        }
        r.put("ok", result.getResultCode() == Activity.RESULT_OK);
        r.put("response", response);
        call.resolve(r);
    }
}
