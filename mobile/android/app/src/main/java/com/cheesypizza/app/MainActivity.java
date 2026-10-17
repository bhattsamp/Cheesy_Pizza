package com.cheesypizza.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.content.res.Configuration;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private View loading;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long shownAt;
    private static final long SHOW_MS = 6000; // the pizza-to-logo animation plays through once

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
     * covers it with a teal screen: a pizza in a white circle turns into the logo while a cheese
     * wave rolls along the bottom. The Admin app has its own title (src/admin/res) and words.
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

        int W = getResources().getDisplayMetrics().widthPixels;
        root.setClipChildren(false);

        // A cheese wave along the bottom: two layers sliding opposite ways, toppings bobbing in
        // it and drops of cheese jumping out
        int waveH = (int) (W * 520f / 1080f);
        ImageView waveBack = wave(R.drawable.loading_wave_back, W, waveH, root);
        ImageView waveFront = wave(R.drawable.loading_wave_front, W, waveH, root);
        slide(waveBack, 0, -W, 9000);
        slide(waveFront, -W, 0, 6500);
        bob(waveBack, 6 * dp, 2300, 0);
        bob(waveFront, 4 * dp, 1900, 400);
        ImageView tops = new ImageView(this);
        tops.setImageResource(R.drawable.loading_toppings);
        tops.setScaleType(ImageView.ScaleType.FIT_XY);
        FrameLayout.LayoutParams tlp = new FrameLayout.LayoutParams(W, waveH, Gravity.BOTTOM);
        tlp.bottomMargin = -(int) (7 * dp);
        root.addView(tops, tlp);
        bob(tops, 5 * dp, 2100, 200);
        float[][] drops = {{0.10f, 26, 0}, {0.30f, 16, 1}, {0.86f, 22, 0}};
        for (int i = 0; i < drops.length; i++) {
            ImageView d = new ImageView(this);
            d.setImageResource(R.drawable.loading_cheese_drop);
            int s = (int) (drops[i][1] * dp);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(s, s, Gravity.BOTTOM | Gravity.START);
            lp.leftMargin = (int) (W * drops[i][0]);
            lp.bottomMargin = (int) (waveH * 0.72f + drops[i][2] * 26 * dp);
            root.addView(d, lp);
            ObjectAnimator jump = ObjectAnimator.ofFloat(d, View.TRANSLATION_Y, 0f, -22 * dp);
            jump.setDuration(800 + i * 150L);
            jump.setStartDelay(i * 300L);
            jump.setInterpolator(new android.view.animation.DecelerateInterpolator());
            jump.setRepeatCount(ValueAnimator.INFINITE);
            jump.setRepeatMode(ValueAnimator.REVERSE);
            jump.start();
        }

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setClipChildren(false);
        box.setPadding(0, 0, 0, (int) (waveH * 0.5f));
        root.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // The white brush circle holding the pizza (which becomes the logo) and the name
        int C = Math.min((int) (310 * dp), (int) (W * 0.84f));
        FrameLayout ring = new FrameLayout(this);
        ring.setClipChildren(false);
        box.addView(ring, new LinearLayout.LayoutParams(C, C));
        ImageView disc = new ImageView(this);
        disc.setImageResource(R.drawable.loading_circle);
        ring.addView(disc, new FrameLayout.LayoutParams(C, C));
        LinearLayout inner = new LinearLayout(this);
        inner.setOrientation(LinearLayout.VERTICAL);
        inner.setGravity(Gravity.CENTER);
        inner.setClipChildren(false);
        ring.addView(inner, new FrameLayout.LayoutParams(C, C));

        // A whole pizza of eight slices: one slice slides out and grows while the rest fade
        // away, then it turns into the Cheesy Pizza pin and its melted cheese slowly drips down
        int size = (int) (C * 0.5f);
        FrameLayout pizza = new FrameLayout(this);
        pizza.setClipChildren(false);
        inner.addView(pizza, new LinearLayout.LayoutParams(size, size));
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
        ImageView drips = new ImageView(this);
        drips.setImageResource(R.drawable.loading_drips);
        drips.setPivotX(size / 2f);
        drips.setPivotY(size * 582f / 1024f); // where the drips hang from the cheese ring (logo.js DRIP_TOP)
        drips.setScaleY(0f);
        drips.setAlpha(0f);
        pizza.addView(drips, new FrameLayout.LayoutParams(size, size));
        ImageView drop = new ImageView(this);
        drop.setImageResource(R.drawable.loading_drop);
        drop.setAlpha(0f);
        pizza.addView(drop, new FrameLayout.LayoutParams(size, size));
        float lift = size * 0.459f * 0.6f; // from the pizza's centre to the middle of a slice
        ValueAnimator show = ValueAnimator.ofFloat(0f, SHOW_MS);
        show.setDuration(SHOW_MS);
        show.setInterpolator(new LinearInterpolator());
        show.addUpdateListener(an -> {
            float t = (float) an.getAnimatedValue();
            float in = smooth(clamp(t / 500f));           // pizza appears
            float e = smooth(clamp((t - 1000) / 1600f));   // slice slides out and grows, the rest fade
            float m = smooth(clamp((t - 2700) / 1200f));   // slice turns into the pin
            float d = clamp((t - 3900) / 1800f);          // cheese slowly drips down
            pizza.setScaleX(0.6f + 0.4f * in);
            pizza.setScaleY(0.6f + 0.4f * in);
            pizza.setAlpha(in);
            ring.setScaleX(0.8f + 0.2f * in);
            ring.setScaleY(0.8f + 0.2f * in);
            ring.setAlpha(in);
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
            drips.setAlpha(Math.min(1f, d * 5));
            drips.setScaleY(d * (2 - d));
        });
        show.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator an) {
                // the longest drip stretches a little and lets a drop fall, again and again
                ObjectAnimator stretch = ObjectAnimator.ofFloat(drips, View.SCALE_Y, 1f, 1.07f);
                stretch.setDuration(900);
                stretch.setRepeatCount(ValueAnimator.INFINITE);
                stretch.setRepeatMode(ValueAnimator.REVERSE);
                stretch.start();
                ObjectAnimator fall = ObjectAnimator.ofPropertyValuesHolder(drop,
                    PropertyValuesHolder.ofFloat(View.TRANSLATION_Y, 0f, size * 0.16f),
                    PropertyValuesHolder.ofFloat(View.ALPHA, 1f, 1f, 0f));
                fall.setDuration(1100);
                fall.setInterpolator(new android.view.animation.AccelerateInterpolator());
                fall.setRepeatCount(ValueAnimator.INFINITE);
                fall.start();
            }
        });
        show.start();

        ImageView title = new ImageView(this);
        title.setImageResource(R.drawable.loading_title);
        title.setAdjustViewBounds(true);
        inner.addView(title, new LinearLayout.LayoutParams((int) (C * 0.74f), ViewGroup.LayoutParams.WRAP_CONTENT));
        title.setAlpha(0f);
        title.animate().alpha(1f).setStartDelay(3300).setDuration(700).start(); // once the slice has become the logo

        // Three slices that fill up one after another, again and again
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rlp.topMargin = (int) (26 * dp);
        box.addView(row, rlp);
        ImageView[] full = new ImageView[3];
        for (int i = 0; i < 3; i++) {
            FrameLayout slot = new FrameLayout(this);
            ImageView line = new ImageView(this);
            line.setImageResource(R.drawable.loading_slice_line);
            slot.addView(line, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            full[i] = new ImageView(this);
            full[i].setImageResource(R.drawable.loading_slice_full);
            full[i].setAlpha(0f);
            slot.addView(full[i], new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams((int) (42 * dp), (int) (42 * dp));
            p.setMargins((int) (10 * dp), 0, (int) (10 * dp), 0);
            row.addView(slot, p);
        }
        ValueAnimator fillUp = ValueAnimator.ofFloat(0f, 1f);
        fillUp.setDuration(2400);
        fillUp.setInterpolator(new LinearInterpolator());
        fillUp.setRepeatCount(ValueAnimator.INFINITE);
        fillUp.addUpdateListener(an -> {
            float t = (float) an.getAnimatedValue();
            for (int i = 0; i < 3; i++) {
                float a = smooth(clamp((t - 0.06f - i * 0.22f) / 0.12f)) * (1 - clamp((t - 0.86f) / 0.1f));
                full[i].setAlpha(a);
                full[i].setScaleX(0.6f + 0.4f * a);
                full[i].setScaleY(0.6f + 0.4f * a);
            }
        });
        fillUp.start();

        // "Preparing Something Cheesy…" (Admin: "Opening your shop counter…") in the logo's script face
        ImageView wait = new ImageView(this);
        wait.setImageResource(R.drawable.loading_msg);
        wait.setAdjustViewBounds(true);
        LinearLayout.LayoutParams wlp = new LinearLayout.LayoutParams((int) (270 * dp), ViewGroup.LayoutParams.WRAP_CONTENT);
        wlp.topMargin = (int) (12 * dp);
        box.addView(wait, wlp);

        ((ViewGroup) getWindow().getDecorView()).addView(root, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        loading = root;
        shownAt = System.currentTimeMillis();
        handler.postDelayed(this::checkReady, 400);
    }

    private ImageView wave(int res, int w, int h, FrameLayout root) {
        ImageView v = new ImageView(this);
        v.setImageResource(res);
        v.setScaleType(ImageView.ScaleType.FIT_XY);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w * 2, h, Gravity.BOTTOM | Gravity.START); // two waves wide, so it can slide forever
        lp.bottomMargin = -(int) (8 * getResources().getDisplayMetrics().density); // room to bob without showing a gap
        root.addView(v, lp);
        return v;
    }

    private static void slide(View v, float from, float to, long ms) {
        ObjectAnimator a = ObjectAnimator.ofFloat(v, View.TRANSLATION_X, from, to);
        a.setDuration(ms);
        a.setInterpolator(new LinearInterpolator());
        a.setRepeatCount(ValueAnimator.INFINITE);
        a.start();
    }

    private static void bob(View v, float amp, long ms, long delay) {
        ObjectAnimator a = ObjectAnimator.ofFloat(v, View.TRANSLATION_Y, -amp, amp);
        a.setDuration(ms);
        a.setStartDelay(delay);
        a.setRepeatCount(ValueAnimator.INFINITE);
        a.setRepeatMode(ValueAnimator.REVERSE);
        a.start();
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
