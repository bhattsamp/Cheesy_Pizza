package com.cheesypizza.app;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.content.res.Configuration;
import android.graphics.drawable.GradientDrawable;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
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
     * covers it, so people see a bouncing pizza slice instead. The Admin app has its own
     * darker pictures (src/admin/res) and words.
     */
    private void showLoading(int bg, int fg) {
        float dp = getResources().getDisplayMetrics().density;
        boolean admin = getPackageName().endsWith(".admin");
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getResources().getColor(R.color.splash_bg, getTheme()));
        root.setClickable(true); // nothing underneath can be tapped while it shows

        ImageView back = new ImageView(this);
        back.setImageResource(R.drawable.loading_bg);
        back.setScaleType(ImageView.ScaleType.CENTER_CROP);
        root.addView(back, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        root.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // The slice bobs and sways like it is waiting to be picked up
        ImageView slice = new ImageView(this);
        slice.setImageResource(R.drawable.loading_slice);
        box.addView(slice, new LinearLayout.LayoutParams((int) (210 * dp), (int) (210 * dp)));
        ObjectAnimator bob = ObjectAnimator.ofFloat(slice, View.TRANSLATION_Y, 0, -16 * dp);
        bob.setDuration(700);
        bob.setRepeatCount(ValueAnimator.INFINITE);
        bob.setRepeatMode(ValueAnimator.REVERSE);
        bob.setInterpolator(new AccelerateDecelerateInterpolator());
        bob.start();
        ObjectAnimator sway = ObjectAnimator.ofFloat(slice, View.ROTATION, -5, 5);
        sway.setDuration(1400);
        sway.setRepeatCount(ValueAnimator.INFINITE);
        sway.setRepeatMode(ValueAnimator.REVERSE);
        sway.setInterpolator(new AccelerateDecelerateInterpolator());
        sway.start();

        ImageView title = new ImageView(this);
        title.setImageResource(R.drawable.loading_title);
        title.setAdjustViewBounds(true);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams((int) (280 * dp), ViewGroup.LayoutParams.WRAP_CONTENT);
        tp.topMargin = (int) (12 * dp);
        box.addView(title, tp);

        TextView note = new TextView(this);
        note.setText(admin ? "Opening your shop counter…" : "Hot, cheesy & made fresh for you");
        note.setTextColor(0xFFFFE27A);
        note.setTypeface(Typeface.DEFAULT_BOLD);
        note.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        note.setPadding(0, (int) (10 * dp), 0, 0);
        box.addView(note);

        // Three dots that pulse one after another
        LinearLayout dots = new LinearLayout(this);
        dots.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dlp.topMargin = (int) (26 * dp);
        box.addView(dots, dlp);
        for (int i = 0; i < 3; i++) {
            View dot = new View(this);
            GradientDrawable g = new GradientDrawable();
            g.setShape(GradientDrawable.OVAL);
            g.setColor(0xFFFFFFFF);
            dot.setBackground(g);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams((int) (10 * dp), (int) (10 * dp));
            p.setMargins((int) (6 * dp), 0, (int) (6 * dp), 0);
            dots.addView(dot, p);
            ObjectAnimator pulse = ObjectAnimator.ofPropertyValuesHolder(dot,
                PropertyValuesHolder.ofFloat(View.ALPHA, 0.3f, 1f),
                PropertyValuesHolder.ofFloat(View.SCALE_X, 0.7f, 1.3f),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, 0.7f, 1.3f));
            pulse.setDuration(450);
            pulse.setStartDelay(i * 150L);
            pulse.setRepeatCount(ValueAnimator.INFINITE);
            pulse.setRepeatMode(ValueAnimator.REVERSE);
            pulse.start();
        }

        TextView wait = new TextView(this);
        wait.setText("Getting your app ready…");
        wait.setTextColor(0xFFFFFFFF);
        wait.setAlpha(0.75f);
        wait.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        wait.setPadding(0, (int) (14 * dp), 0, 0);
        box.addView(wait);

        ((ViewGroup) getWindow().getDecorView()).addView(root, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        loading = root;
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
