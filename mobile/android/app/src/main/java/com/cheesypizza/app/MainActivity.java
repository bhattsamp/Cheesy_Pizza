package com.cheesypizza.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
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
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private View loading;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long shownAt;
    private static final long SHOW_MS = 3000; // the pizza-to-logo animation plays through once

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

        // A whole pizza of eight slices: one slice slides out and grows while the rest fade
        // away, then it turns into the Cheesy Pizza pin, which keeps gently pulsing
        int size = (int) (230 * dp);
        FrameLayout pizza = new FrameLayout(this);
        pizza.setClipChildren(false);
        box.setClipChildren(false);
        root.setClipChildren(false);
        box.addView(pizza, new LinearLayout.LayoutParams(size, size));
        ImageView[] slices = new ImageView[8];
        for (int i = 0; i < 8; i++) {
            ImageView s = new ImageView(this);
            s.setImageResource(R.drawable.loading_wedge);
            s.setPivotX(size / 2f);
            s.setPivotY(size / 2f);
            s.setRotation(i * 45);
            if (i % 2 == 1) s.setScaleX(-1); // mirrored so neighbouring toppings differ
            pizza.addView(s, new FrameLayout.LayoutParams(size, size));
            slices[i] = s;
        }
        ImageView hero = slices[0];
        hero.bringToFront();
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.loading_logo);
        logo.setAlpha(0f);
        pizza.addView(logo, new FrameLayout.LayoutParams(size, size));
        float lift = size * 0.459f * 0.6f; // from the pizza's centre to the middle of a slice
        ValueAnimator show = ValueAnimator.ofFloat(0f, SHOW_MS);
        show.setDuration(SHOW_MS);
        show.setInterpolator(new LinearInterpolator());
        show.addUpdateListener(an -> {
            float t = (float) an.getAnimatedValue();
            float in = smooth(clamp(t / 300f));           // pizza appears
            float e = smooth(clamp((t - 700) / 1000f));   // slice slides out and grows, the rest fade
            float m = smooth(clamp((t - 1700) / 800f));   // slice turns into the pin
            pizza.setScaleX(0.6f + 0.4f * in);
            pizza.setScaleY(0.6f + 0.4f * in);
            pizza.setAlpha(in);
            float k = (1 + 0.85f * e) * (1 + 0.15f * m);
            hero.setScaleX(k);
            hero.setScaleY(k);
            hero.setTranslationY(lift * (1 + 0.85f * e) * e);
            hero.setRotation(-10 * e * (1 - m));
            hero.setAlpha(1 - m);
            for (int i = 1; i < 8; i++) slices[i].setAlpha(Math.max(0f, 1f - Math.min(1f, e * 1.8f - (i - 1) * 0.08f)));
            logo.setAlpha(m);
            logo.setScaleX(0.7f + 0.3f * m);
            logo.setScaleY(0.7f + 0.3f * m);
        });
        show.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator an) {
                ObjectAnimator pulse = ObjectAnimator.ofPropertyValuesHolder(logo,
                    PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.06f),
                    PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.06f));
                pulse.setDuration(700);
                pulse.setRepeatCount(ValueAnimator.INFINITE);
                pulse.setRepeatMode(ValueAnimator.REVERSE);
                pulse.start();
            }
        });
        show.start();

        ImageView title = new ImageView(this);
        title.setImageResource(R.drawable.loading_title);
        title.setAdjustViewBounds(true);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams((int) (280 * dp), ViewGroup.LayoutParams.WRAP_CONTENT);
        tp.topMargin = (int) (12 * dp);
        box.addView(title, tp);

        TextView note = new TextView(this);
        note.setText(admin ? "Opening your shop counter…" : "Really Cheesy..!");
        note.setTextColor(0xFFFFE27A);
        note.setTypeface(Typeface.DEFAULT_BOLD);
        note.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        note.setPadding(0, (int) (10 * dp), 0, 0);
        if (admin) box.addView(note);

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

    private static float clamp(float t) {
        return Math.max(0f, Math.min(1f, t));
    }

    private static float smooth(float t) {
        return t * t * (3 - 2 * t);
    }

    // The app page has #intro (its own loading animation, for browsers) or #app; Render's page has neither
    private void checkReady() {
        if (loading == null) return;
        if (System.currentTimeMillis() - shownAt > 120_000) { hideLoading(); return; } // never hide the screen for good
        try {
            bridge.getWebView().evaluateJavascript("!!(document.getElementById('intro')||document.getElementById('app'))", v -> {
                if (!"true".equals(v)) handler.postDelayed(this::checkReady, 400);
                else if (System.currentTimeMillis() - shownAt < SHOW_MS) handler.postDelayed(this::checkReady, 200); // let the pizza become the logo first
                else {
                    // This screen already played the intro, so the page skips its own
                    bridge.getWebView().evaluateJavascript("(function(){var i=document.getElementById('intro');if(i)i.remove()})()", null);
                    hideLoading();
                }
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
