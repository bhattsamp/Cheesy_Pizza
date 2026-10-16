package com.cheesypizza.app;

import android.content.res.Configuration;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private View loading;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long shownAt;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpiPayPlugin.class); // pay with a UPI app from checkout
        super.onCreate(savedInstanceState);
        // Android keeps the page clear of the status bar and navigation buttons; colour the
        // strips behind them like the app's header and menu bar (light or dark theme).
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int bg = night ? 0xFF11242A : 0xFFFFFFFF;
        getWindow().getDecorView().setBackgroundColor(bg);
        showLoading(bg, night ? 0xFFE8F1F2 : 0xFF0F2E36);
    }

    /*
     * Our own loading screen, shown until the Cheesy Pizza page itself is on screen. When the
     * free server has been asleep, Render shows its "waking up" page for a while first; this
     * covers it, so people see the pizza and "Getting your app ready" instead.
     */
    private void showLoading(int bg, int fg) {
        float dp = getResources().getDisplayMetrics().density;
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(bg);
        box.setClickable(true); // nothing underneath can be tapped while it shows

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher_round);
        box.addView(logo, new LinearLayout.LayoutParams((int) (112 * dp), (int) (112 * dp)));

        TextView name = new TextView(this);
        name.setText(R.string.app_name);
        name.setTextColor(fg);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        name.setPadding(0, (int) (18 * dp), 0, (int) (6 * dp));
        box.addView(name);

        TextView note = new TextView(this);
        note.setText("Getting your app ready…");
        note.setTextColor(fg);
        note.setAlpha(0.7f);
        note.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        box.addView(note);

        ProgressBar spin = new ProgressBar(this);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams((int) (36 * dp), (int) (36 * dp));
        sp.topMargin = (int) (22 * dp);
        box.addView(spin, sp);

        ((ViewGroup) getWindow().getDecorView()).addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        loading = box;
        shownAt = System.currentTimeMillis();
        handler.postDelayed(this::checkReady, 400);
    }

    // The app page has #intro (its own pizza loading animation) or #app; Render's page has neither
    private void checkReady() {
        if (loading == null) return;
        if (System.currentTimeMillis() - shownAt > 120_000) { hideLoading(); return; } // never hide the screen for good
        try {
            bridge.getWebView().evaluateJavascript("!!(document.getElementById('intro')||document.getElementById('app'))", v -> {
                if ("true".equals(v)) hideLoading();
                else handler.postDelayed(this::checkReady, 400);
            });
        } catch (Exception e) {
            handler.postDelayed(this::checkReady, 400);
        }
    }

    private void hideLoading() {
        if (loading == null) return;
        View v = loading;
        loading = null;
        v.animate().alpha(0f).setDuration(220).withEndAction(() -> ((ViewGroup) v.getParent()).removeView(v)).start();
    }
}
