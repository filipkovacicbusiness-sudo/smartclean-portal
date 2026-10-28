package si.smartclean.rfid;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import com.rscja.deviceapi.RFIDWithUHFUART;
import com.rscja.deviceapi.RFIDWithUHFUSB;
import com.rscja.deviceapi.RFIDWithUHFUrxNetwork;
import com.rscja.deviceapi.entity.AntennaConnectState;
import com.rscja.deviceapi.entity.AntennaState;
import com.rscja.deviceapi.enums.AntennaEnum;
import com.rscja.deviceapi.interfaces.KeyEventCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

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

    // le preizkusna gradnja: v objavi naprava z nenavadnim prstnim odtisom ne izgubi vgrajenega čitalca
    static final boolean EMULATOR = Nastavitve.PREIZKUS && (Build.FINGERPRINT.contains("generic") || Build.HARDWARE.contains("ranchu")
            || Build.PRODUCT.contains("sdk") || Build.MODEL.contains("sdk"));
    static final int MOC_MIN = 5, MOC_MAX = 30;
    // UR4 z zunanjo anteno 9 dBi: EU (ETSI EN 302 208) dovoli 2 W ERP → na izhodu bralnika največ 27 dBm
    static final int UR4_MOC_MAX = 27;
    private static final AntennaEnum[] ANTENE = {AntennaEnum.ANT1, AntennaEnum.ANT2, AntennaEnum.ANT3, AntennaEnum.ANT4};

    private final Context ctx;
    private final Poslusalec pos;
    private final SharedPreferences nas;
    // ena nit za ves proces (ne za okno): ob ponovnem ustvarjanju aktivnosti se stari čitalec sprosti pred odprtjem novega
    private static final ExecutorService NIT = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());

    private volatile String izbran;
    private volatile boolean povezan, bere, odpiram;
    private volatile String napaka = "";
    private volatile int moc;
    private volatile String ur4;
    private Vmesnik akt;
    private final AtomicBoolean zacetekVVrsti = new AtomicBoolean();   // en začetek naenkrat: pritiski med počasnim odpiranjem se ne nalagajo
    private volatile boolean zelim;                                   // oseba želi brati (drži sprožilec, Beri): zastareli začetki in ustavitve v vrsti se preskočijo
    private volatile long zadnjiNeuspeh;                              // zadnje neuspešno odpiranje (ponovno samo po premoru)
    private static RFIDWithUHFUrxNetwork ur4R;                         // en objekt UR4 na proces: vsak nov pusti v SDK dve niti
    private volatile boolean zamujen;                                 // pritisk med začetkom v teku: po njem začni znova

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

    // Začetek branja. Vgrajen čitalec se sam znova odpre (ob zagonu ni uspelo ali ga je vzel drug program),
    // a največ enkrat na pritisk in ne prej kot 3 s po neuspehu; R1 in UR4 le z »Poveži« (njuno odpiranje traja sekunde).
    void zacni() {
        zelim = true;
        if (!zacetekVVrsti.compareAndSet(false, true)) { zamujen = true; return; }   // začetek že teče: po njem še enkrat (glej finally)
        zamujen = false;
        izvedi(() -> {
            try {
                if (bere || !zelim) return;   // že bere ali je oseba medtem spustila sprožilec
                boolean vgrajen = "vgrajen".equals(izbran);
                boolean smeOdpreti = vgrajen && SystemClock.uptimeMillis() - zadnjiNeuspeh > 3000;
                if (akt == null && !odpiram && smeOdpreti) odpriVrsto(izbran);
                if (akt == null) {   // napako odpiranja je že sporočil odpriVrsto; R1/UR4 brez nje: »Poveži« na strani
                    if (!vgrajen && napaka.isEmpty()) napaka = "Čitalec ni povezan.";
                    if (!vgrajen || !smeOdpreti) obvesti();
                    return;
                }
                synchronized (seja) { seja.clear(); }   // čipi, ki še čakajo na pošiljanje (zadnjih 100 ms), gredo vseeno na stran
                boolean ok;
                try { ok = akt.zacni(); } catch (Throwable e) { ok = false; }
                if (!ok && vgrajen) {   // modul ne odgovori (npr. drug program ga je vmes sprostil): zapri, odpri, poskusi še enkrat
                    zapriAkt();
                    napaka = "";
                    odpriVrsto(izbran);
                    if (akt != null) { try { ok = akt.zacni(); } catch (Throwable e) { ok = false; } }
                } else if (!ok && akt != null) {   // R1/UR4 (šibko omrežje): še en poskus, preden se povezava zavrže
                    SystemClock.sleep(300);
                    try { ok = akt.zacni(); } catch (Throwable e) { ok = false; }
                }
                if (ok && !zelim) { try { akt.ustavi(); } catch (Throwable ignored) { } ok = false; napaka = ""; obvesti(); return; }   // spuščen med odpiranjem
                bere = ok;
                if (!ok) {
                    boolean bilOdprt = akt != null;
                    zapriAkt();
                    zadnjiNeuspeh = SystemClock.uptimeMillis();
                    if (!vgrajen) napaka = "Čitalec ni povezan.";   // stran pokaže »Poveži« (znova pritisniti ne pomaga)
                    else if (bilOdprt || napaka.isEmpty()) napaka = "Čitalec se ni odzval. Pritisni znova.";   // natančnejšo napako odpiranja ohrani
                }
                obvesti();
            } finally {
                zacetekVVrsti.set(false);
                // pritisk med tem začetkom (npr. med ustavljanjem po prezgodnjem spustu): oseba drži sprožilec, a nič ne bere
                if (zamujen && zelim && !bere && akt != null) { zamujen = false; zacni(); }
            }
        });
    }

    void ustavi() {
        zelim = false;
        izvedi(() -> {
            if (zelim || akt == null || !bere) return;   // medtem znova pritisnjen: bere naprej
            try { akt.ustavi(); } catch (Throwable ignored) { }
            bere = false;
            obvesti();
        });
    }

    void zapri() { izvedi(this::zapriAkt); }
    void konec() { ui.removeCallbacksAndMessages(null); izvedi(this::zapriAkt); }

    private void izvedi(Runnable r) {
        try { NIT.execute(r); } catch (java.util.concurrent.RejectedExecutionException ignored) { }
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
            zadnjiNeuspeh = SystemClock.uptimeMillis();   // tudi ob zagonu: pritisk takoj za tem ne čaka na novo odpiranje
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
            default: return "Vgrajenega čitalca ni bilo mogoče odpreti.";
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
                if (ur4R == null) ur4R = new RFIDWithUHFUrxNetwork();
                r = ur4R;
                if (!r.init(gostitelj, vrata)) return false;
                antene();
                moc(moc);
                r.setInventoryCallback(t -> prejel(t.getEPC()));
                return true;
            }
            public boolean zacni() { return r.startInventoryTag(); }
            public void ustavi() { r.stopInventory(); }
            public void zapri() { if (r == null) return; try { r.stopInventory(); } catch (Throwable ignored) { } r.free(); }
            public void moc(int d) {
                int m = Math.min(d, UR4_MOC_MAX);
                for (AntennaEnum a : ANTENE) {
                    try { r.setAntennaPower(a, m); } catch (Throwable ignored) { }
                }
            }
            // vključi priključene antene (1 do 4); če bralnik tega ne pove, vsaj prvo
            private void antene() {
                try {
                    List<AntennaConnectState> st = r.getAntennaConnectState();
                    List<AntennaState> nove = new ArrayList<>();
                    boolean katera = false;
                    for (AntennaEnum a : ANTENE) {
                        boolean on = false;
                        if (st != null) for (AntennaConnectState s : st) if (s.getAntennaName() == a && s.isConnected()) on = true;
                        nove.add(new AntennaState(a, on));
                        katera |= on;
                    }
                    if (!katera) nove.set(0, new AntennaState(AntennaEnum.ANT1, true));
                    r.setANT(nove);
                } catch (Throwable ignored) { }
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
