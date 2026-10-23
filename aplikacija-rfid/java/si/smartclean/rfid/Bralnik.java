package si.smartclean.rfid;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.rscja.deviceapi.RFIDWithUHFUART;
import com.rscja.deviceapi.RFIDWithUHFUSB;
import com.rscja.deviceapi.RFIDWithUHFUrxNetwork;
import com.rscja.deviceapi.enums.AntennaEnum;
import com.rscja.deviceapi.interfaces.KeyEventCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Čitalci Chainway za portal: vgrajen (C72, sprožilec), R1 (USB), UR4 (omrežje, do 4 antene).
 * Vse delo s čitalcem teče v eni niti (init traja sekundo ali dve); prebrani čipi se zberejo in
 * portalu pošljejo v paketih (vsakih 100 ms), vsak čip enkrat na pritisk sprožilca.
 * Na emulatorju je na voljo »preizkus«: oddaja čipe, ki mu jih da portal (za preizkus brez naprave).
 */
class Bralnik {
    interface Poslusalec {
        void stanje(String json, boolean bere);
        void epci(List<String> novi);
    }

    private interface Vmesnik {
        boolean odpri() throws Exception;
        boolean zacni();
        void ustavi();
        void zapri();
        void moc(int dbm);
    }

    static final boolean EMULATOR = Build.FINGERPRINT.contains("generic") || Build.HARDWARE.contains("ranchu")
            || Build.PRODUCT.contains("sdk") || Build.MODEL.contains("sdk");
    static final int MOC_MIN = 5, MOC_MAX = 30;

    private final Context ctx;
    private final Poslusalec pos;
    private final SharedPreferences nas;
    private final ExecutorService nit = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());

    private volatile String izbran;
    private volatile boolean povezan, bere, odpiram;
    private volatile String napaka = "";
    private volatile int moc;
    private volatile String ur4;
    private Vmesnik akt;

    private final LinkedHashSet<String> seja = new LinkedHashSet<>();
    private final List<String> cakajo = new ArrayList<>();
    private boolean posljiNacrtovan;
    private volatile String[] preizkus = new String[0];

    Bralnik(Context c, Poslusalec p) {
        ctx = c.getApplicationContext();
        pos = p;
        nas = c.getSharedPreferences("bralnik", Context.MODE_PRIVATE);
        moc = nas.getInt("moc", 20);
        ur4 = nas.getString("ur4", "");
        izbran = nas.getString("izbran", EMULATOR ? "preizkus" : "vgrajen");
    }

    // ── čipi iz SDK (njegova nit) → paket za portal ──
    private void prejel(String epc) {
        if (epc == null) return;
        epc = epc.trim().toUpperCase();
        if (epc.isEmpty()) return;
        synchronized (seja) {
            if (!seja.add(epc)) return;
            cakajo.add(epc);
            if (posljiNacrtovan) return;
            posljiNacrtovan = true;
        }
        ui.postDelayed(this::poslji, 100);
    }

    private void poslji() {
        List<String> n;
        synchronized (seja) {
            n = new ArrayList<>(cakajo);
            cakajo.clear();
            posljiNacrtovan = false;
        }
        if (!n.isEmpty()) pos.epci(n);
    }

    // ── upravljanje ──
    void samodejno() {
        izvedi(() -> { if (akt == null && !odpiram) odpriVrsto(izbran); });
    }

    void izberi(String id) {
        izvedi(() -> {
            zapriAkt();
            izbran = id;
            nas.edit().putString("izbran", id).apply();
            odpriVrsto(id);
        });
    }

    void zacni() {
        izvedi(() -> {
            if (akt == null || bere) return;
            synchronized (seja) { seja.clear(); cakajo.clear(); }
            try { bere = akt.zacni(); } catch (Throwable e) { bere = false; napaka = "Branje se ni začelo."; }
            obvesti();
        });
    }

    void ustavi() {
        izvedi(() -> {
            if (akt == null || !bere) return;
            try { akt.ustavi(); } catch (Throwable ignored) { }
            bere = false;
            obvesti();
        });
    }

    void zapri() { izvedi(this::zapriAkt); }
    void konec() { izvedi(this::zapriAkt); nit.shutdown(); }

    private void izvedi(Runnable r) {
        try { nit.execute(r); } catch (java.util.concurrent.RejectedExecutionException ignored) { }   // po koncu aktivnosti
    }

    void nastaviMoc(int dbm) {
        moc = Math.max(MOC_MIN, Math.min(MOC_MAX, dbm));
        nas.edit().putInt("moc", moc).apply();
        izvedi(() -> {
            if (akt != null) { try { akt.moc(moc); } catch (Throwable ignored) { } }
            obvesti();
        });
    }

    void nastaviUr4(String naslov) {
        ur4 = naslov == null ? "" : naslov.trim();
        nas.edit().putString("ur4", ur4).apply();
        izberi("ur4");
    }

    void nastaviPreizkus(String json) {
        if (!EMULATOR) return;
        try {
            JSONArray a = new JSONArray(json);
            String[] p = new String[a.length()];
            for (int i = 0; i < a.length(); i++) p[i] = a.getString(i);
            preizkus = p;
        } catch (Exception ignored) { }
    }

    void usbPrikljucen() { if ("r1".equals(izbran) && !povezan) izberi("r1"); }

    private void zapriAkt() {
        if (akt != null) { try { akt.zapri(); } catch (Throwable ignored) { } }
        akt = null;
        povezan = false;
        bere = false;
    }

    private void odpriVrsto(String id) {
        odpiram = true;
        napaka = "";
        povezan = false;
        obvesti();
        Vmesnik v;
        switch (id) {
            case "ur4": v = ur4Vm(); break;
            case "r1": v = r1Vm(); break;
            case "preizkus": v = preizkusVm(); break;
            default: v = vgrajenVm();
        }
        boolean ok;
        try { ok = v.odpri(); } catch (Throwable e) { ok = false; }
        if (ok) {
            akt = v;
            povezan = true;
        } else {
            try { v.zapri(); } catch (Throwable ignored) { }
            akt = null;
            if (napaka.isEmpty()) napaka = sporocilo(id);
        }
        odpiram = false;
        obvesti();
    }

    private static String sporocilo(String id) {
        switch (id) {
            case "ur4": return "UR4 ni dosegljiv.";
            case "r1": return "R1 ni priključen.";
            case "preizkus": return "";
            default: return "Ta naprava nima vgrajenega čitalca.";
        }
    }

    // ── čitalci ──
    private Vmesnik vgrajenVm() {
        return new Vmesnik() {
            RFIDWithUHFUART r;
            public boolean odpri() throws Exception {
                if (EMULATOR) return false;
                r = RFIDWithUHFUART.getInstance();
                if (!r.init(ctx)) return false;
                r.setPower(moc);
                r.setInventoryCallback(t -> prejel(t.getEPC()));
                return true;
            }
            public boolean zacni() { return r.startInventoryTag(); }
            public void ustavi() { r.stopInventory(); }
            public void zapri() { if (r == null) return; try { r.stopInventory(); } catch (Throwable ignored) { } r.free(); }
            public void moc(int d) { r.setPower(d); }
        };
    }

    private Vmesnik r1Vm() {
        return new Vmesnik() {
            RFIDWithUHFUSB r;
            public boolean odpri() {
                r = RFIDWithUHFUSB.getInstance();
                if (!r.init(ctx)) return false;
                r.setPower(moc);
                r.setInventoryCallback(t -> prejel(t.getEPC()));
                r.setKeyEventCallback(new KeyEventCallback() {   // tipka na R1: drži za branje, kot sprožilec
                    public void onKeyDown(int k) { Bralnik.this.zacni(); }
                    public void onKeyUp(int k) { Bralnik.this.ustavi(); }
                });
                return true;
            }
            public boolean zacni() { return r.startInventoryTag(); }
            public void ustavi() { r.stopInventory(); }
            public void zapri() { if (r == null) return; try { r.stopInventory(); } catch (Throwable ignored) { } r.free(); }
            public void moc(int d) { r.setPower(d); }
        };
    }

    private Vmesnik ur4Vm() {
        return new Vmesnik() {
            RFIDWithUHFUrxNetwork r;
            public boolean odpri() {
                String n = ur4 == null ? "" : ur4.trim();
                if (n.isEmpty()) { napaka = "Vpiši naslov UR4."; return false; }
                String gostitelj = n;
                int vrata = 8888;
                int dv = n.lastIndexOf(':');
                if (dv > 0) {
                    gostitelj = n.substring(0, dv);
                    try { vrata = Integer.parseInt(n.substring(dv + 1)); } catch (NumberFormatException e) { napaka = "Neveljaven naslov UR4."; return false; }
                }
                r = new RFIDWithUHFUrxNetwork();
                if (!r.init(gostitelj, vrata)) return false;
                moc(moc);
                r.setInventoryCallback(t -> prejel(t.getEPC()));
                return true;
            }
            public boolean zacni() { return r.startInventoryTag(); }
            public void ustavi() { r.stopInventory(); }
            public void zapri() { if (r == null) return; try { r.stopInventory(); } catch (Throwable ignored) { } r.free(); }
            public void moc(int d) {
                for (AntennaEnum a : new AntennaEnum[]{AntennaEnum.ANT1, AntennaEnum.ANT2, AntennaEnum.ANT3, AntennaEnum.ANT4}) {
                    try { r.setAntennaPower(a, d); } catch (Throwable ignored) { }
                }
            }
        };
    }

    private Vmesnik preizkusVm() {
        return new Vmesnik() {
            volatile boolean tece;
            public boolean odpri() { return EMULATOR; }
            public boolean zacni() {
                tece = true;
                new Thread(() -> {
                    String[] p = preizkus;
                    for (int i = 0; tece && i < p.length; i++) {
                        prejel(p[i]);
                        try { Thread.sleep(12); } catch (InterruptedException e) { return; }
                    }
                }).start();
                return true;
            }
            public void ustavi() { tece = false; }
            public void zapri() { tece = false; }
            public void moc(int d) { }
        };
    }

    // ── stanje za portal ──
    String stanjeJson() {
        try {
            JSONObject o = new JSONObject();
            o.put("tip", "stanje");
            o.put("verzija", Glavna.VERZIJA);
            o.put("naprava", (Build.MANUFACTURER + " " + Build.MODEL).trim());
            o.put("izbran", izbran);
            o.put("povezan", povezan);
            o.put("odpiram", odpiram);
            o.put("bere", bere);
            o.put("napaka", napaka);
            o.put("moc", moc);
            o.put("mocMin", MOC_MIN);
            o.put("mocMax", MOC_MAX);
            o.put("ur4", ur4);
            JSONArray b = new JSONArray();
            b.put(new JSONObject().put("id", "vgrajen").put("ime", "Vgrajen"));
            b.put(new JSONObject().put("id", "r1").put("ime", "R1"));
            b.put(new JSONObject().put("id", "ur4").put("ime", "UR4"));
            if (EMULATOR) b.put(new JSONObject().put("id", "preizkus").put("ime", "Preizkus"));
            o.put("bralniki", b);
            return o.toString();
        } catch (Exception e) {
            return "{\"tip\":\"stanje\"}";
        }
    }

    private void obvesti() { pos.stanje(stanjeJson(), bere); }
}
