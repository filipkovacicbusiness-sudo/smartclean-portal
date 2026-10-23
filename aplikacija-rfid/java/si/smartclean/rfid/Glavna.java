package si.smartclean.rfid;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.hardware.usb.UsbManager;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/**
 * SmartClean RFID: portal (razdelek Čipi) v aplikaciji + most do čitalca (window.ScRfid).
 * Sprožilec C72: drži za branje, spusti za konec. Portal dobi dogodke »scrfid« (stanje, epc).
 * Most dela samo za portal.smartclean.si; druge povezave se odprejo v brskalniku.
 */
public class Glavna extends Activity implements Bralnik.Poslusalec {
    static final String VERZIJA = Nastavitve.VERZIJA;
    // naslov portala določi gradnja (Nastavitve.java): objava = https://portal.smartclean.si, preizkus = lokalni portal
    // tipke sprožilca na čitalcih Chainway (po njihovem vzorcu)
    private static final int[] SPROZILCI = {139, 280, 291, 293, 294, 311, 312, 313, 315, 591, 593, 594, 596};
    // tisk iz portala (predogled spremnih listov): isti vmesnik kot aplikacija za tablico
    private static final String MOST_JS =
            "(function(){if(!window.ScRfid)return;window.Capacitor=window.Capacitor||{};Capacitor.Plugins=Capacitor.Plugins||{};" +
            "Capacitor.Plugins.PralnicaPrint={print:function(o){o=o||{};ScRfid.natisni(String(o.html||''),String(o.jobName||'SmartClean'));return Promise.resolve();}};" +
            "window.dispatchEvent(new CustomEvent('scrfid',{detail:JSON.parse(ScRfid.stanje())}));})();";

    private static final String NAPAKA_URL = "file:///android_asset/ni-povezave.html";

    private WebView web;
    private boolean naNapaki;   // prikazan zaslon »Ni povezave«; ob povezavi se portal naloži sam
    private ConnectivityManager.NetworkCallback omrezje;
    private Bralnik bralnik;
    private ToneGenerator ton;
    private volatile String trenutni = "";
    private long zadnjiPisk;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle shranjeno) {
        super.onCreate(shranjeno);
        barvaPasov("#ffffff");
        try { ton = new ToneGenerator(AudioManager.STREAM_MUSIC, 60); } catch (Exception e) { ton = null; }
        bralnik = new Bralnik(this, this);

        if (Nastavitve.PREIZKUS) WebView.setWebContentsDebuggingEnabled(true);   // samo preizkusna gradnja (lokalni portal)
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " SmartCleanRFID/" + VERZIJA);
        CookieManager.getInstance().setAcceptCookie(true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (dovoljen(u)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
            @Override public void onPageStarted(WebView v, String url, Bitmap ikona) {
                trenutni = url == null ? "" : url;
                if (dovoljen(Uri.parse(trenutni))) naNapaki = false;
            }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean ponovno) { trenutni = url == null ? "" : url; }
            @Override public void onPageFinished(WebView v, String url) {
                trenutni = url == null ? "" : url;
                if (dovoljen(Uri.parse(trenutni))) v.evaluateJavascript(MOST_JS, null);
                else if (NAPAKA_URL.equals(trenutni)) v.evaluateJavascript("document.body.dataset.portal=" + JSONObject.quote(Nastavitve.PORTAL + "#cipi"), null);
            }
            // portal ni dosegljiv (prvi zagon brez povezave; pozneje ga ima portal v predpomnilniku): zaslon z gumbom, sam poskusi znova
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame() || !dovoljen(r.getUrl())) return;
                naNapaki = true;
                v.loadUrl(NAPAKA_URL);
                ui.removeCallbacks(znova);
                ui.postDelayed(znova, 5000);
            }
            // brskalniški proces se je zrušil (malo pomnilnika): okno na novo, aplikacija ostane odprta
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                if (v == web) {
                    ((ViewGroup) v.getParent()).removeView(v);
                    v.destroy();
                    web = null;
                    recreate();
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Most(), "ScRfid");
        setContentView(web);
        if (shranjeno == null || web.restoreState(shranjeno) == null) web.loadUrl(Nastavitve.PORTAL + "#cipi");
        ui.postDelayed(() -> {   // prvi zagon takoj po vklopu naprave: nalaganje se včasih ne začne
            String u = web == null ? "x" : web.getUrl();
            if (u == null || u.isEmpty()) web.loadUrl(Nastavitve.PORTAL + "#cipi");
        }, 4000);
        obravnavajUsb(getIntent());
        omrezje = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network n) { ui.post(() -> { if (naNapaki) znova.run(); }); }
        };
        try { ((ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE)).registerDefaultNetworkCallback(omrezje); } catch (Exception ignored) { omrezje = null; }
    }

    private final Runnable znova = new Runnable() {
        @Override public void run() {
            if (!naNapaki || web == null) return;
            naNapaki = false;
            web.loadUrl(Nastavitve.PORTAL + "#cipi");
        }
    };

    private static boolean dovoljen(Uri u) {
        return u != null && Nastavitve.SHEMA.equals(u.getScheme()) && Nastavitve.GOSTITELJ.equals(u.getHost()) && u.getPort() == Nastavitve.VRATA;
    }

    private boolean mostDovoljen() { return dovoljen(Uri.parse(trenutni == null ? "" : trenutni)); }

    @Override protected void onStart() { super.onStart(); bralnik.samodejno(); }
    // v ozadju portal miruje (baterija ročnega čitalca); ob vrnitvi se sam osveži (visibilitychange)
    @Override protected void onResume() { super.onResume(); if (web != null) { web.onResume(); web.resumeTimers(); } }
    @Override protected void onPause() { if (web != null) { web.onPause(); web.pauseTimers(); } super.onPause(); }
    @Override protected void onStop() { bralnik.zapri(); super.onStop(); }   // čitalec sprosti v ozadju (baterija, druge aplikacije)
    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); if (web != null && !naNapaki) web.saveState(o); }
    @Override protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (omrezje != null) { try { ((ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE)).unregisterNetworkCallback(omrezje); } catch (Exception ignored) { } }
        bralnik.konec();
        if (ton != null) ton.release();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        obravnavajUsb(i);
    }

    private void obravnavajUsb(Intent i) {
        if (i != null && UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(i.getAction())) bralnik.usbPrikljucen();
    }

    @Override
    public void onBackPressed() {
        if (web != null && !naNapaki && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private static boolean sprozilec(int k) {
        for (int x : SPROZILCI) if (x == k) return true;
        return false;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (sprozilec(e.getKeyCode())) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) bralnik.zacni();
            else if (e.getAction() == KeyEvent.ACTION_UP) bralnik.ustavi();
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    // ── dogodki čitalca → portal ──
    @Override
    public void stanje(String json, boolean bere) {
        ui.post(() -> {
            if (bere) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            dogodek(json);
        });
    }

    @Override
    public void epci(List<String> novi) {
        try {
            JSONObject o = new JSONObject().put("tip", "epc").put("epc", new JSONArray(novi));
            ui.post(() -> {
                dogodek(o.toString());
                long t = SystemClock.uptimeMillis();
                if (ton != null && t - zadnjiPisk > 70) { zadnjiPisk = t; ton.startTone(ToneGenerator.TONE_PROP_BEEP, 40); }
            });
        } catch (Exception ignored) { }
    }

    private void dogodek(String json) {
        if (web == null || !mostDovoljen()) return;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('scrfid',{detail:" + json + "}))", null);
    }

    // barva vrha in dna po temi portala
    private void barvaPasov(String hex) {
        int c;
        try { c = Color.parseColor(hex); } catch (Exception e) { return; }
        Window w = getWindow();
        w.setStatusBarColor(c);
        w.setNavigationBarColor(c);
        double svetlost = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255;
        int z = 0;
        if (svetlost > 0.6) {
            z |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 27) z |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        w.getDecorView().setSystemUiVisibility(z);
    }

    private void tiskaj(String html, String ime) {
        WebView t = new WebView(this);
        t.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm != null) pm.print(ime, v.createPrintDocumentAdapter(ime), new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            }
        });
        t.getSettings().setJavaScriptEnabled(false);
        t.loadDataWithBaseURL(Nastavitve.PORTAL, html, "text/html", "utf-8", null);
    }

    /** window.ScRfid — vse metode delujejo le, ko je odprt portal. */
    private class Most {
        @JavascriptInterface public String stanje() { return mostDovoljen() ? bralnik.stanjeJson() : "{}"; }
        @JavascriptInterface public void izberi(String id) { if (mostDovoljen()) bralnik.izberi(id); }
        @JavascriptInterface public void zacni() { if (mostDovoljen()) bralnik.zacni(); }
        @JavascriptInterface public void ustavi() { if (mostDovoljen()) bralnik.ustavi(); }
        @JavascriptInterface public void moc(int dbm) { if (mostDovoljen()) bralnik.nastaviMoc(dbm); }
        @JavascriptInterface public void ur4(String naslov) { if (mostDovoljen()) bralnik.nastaviUr4(naslov); }
        @JavascriptInterface public void preizkus(String epci) { if (mostDovoljen()) bralnik.nastaviPreizkus(epci); }
        @JavascriptInterface public void barva(String hex) { if (mostDovoljen()) ui.post(() -> barvaPasov(hex)); }
        @JavascriptInterface public void natisni(String html, String ime) { if (mostDovoljen()) ui.post(() -> tiskaj(html, ime)); }
    }
}
