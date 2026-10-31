package si.smartclean.rfid;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Neposreden tisk na omrežni tiskalnik (IPP), brez okna Androida. Dokument pripravi aplikacija (isti PDF kot v portalu).
 * Naslov: ročno nastavljen, zadnji uspešen ali najden v omrežju (mDNS _ipp._tcp).
 * Tiskalnik vprašamo, kaj sprejme: PDF, sicer sliko strani (PWG raster ali URF), ki jo izriše PdfRenderer.
 * Povezava je navaden vtič, ker IPP v lokalnem omrežju ni šifriran; WebView ostane samo na https.
 * Ob neuspehu aplikacija odpre okno Androida, zato tisk ne obstane.
 */
final class Tiskalnik {
    interface Izid { void konec(boolean ok, String napaka, String tiskalnik); }

    private static final String LOG = "SmartCleanRFID";
    private static final int IPP_VRATA = 631, PRIKLOP_MS = 3000, BRANJE_MS = 30000, ISKANJE_MS = 3000, DPI = 300;
    private static final int OP_TISK = 0x0002, OP_ATRIBUTI = 0x000B;
    private static final int T_OPERACIJA = 0x01, T_OPRAVILO = 0x02, T_KONEC = 0x03;
    private static final int V_INT = 0x21, V_KLJUC = 0x44, V_URI = 0x45, V_NABOR = 0x47, V_JEZIK = 0x48, V_MIME = 0x49, V_IME = 0x42;

    /** Znana napaka tiskalnika: koda gre v aplikacijo. Iskanje drugega naslova tu ne pomaga. */
    private static final class Napaka extends IOException {
        final String koda;
        Napaka(String koda) { super(koda); this.koda = koda; }
    }

    private static final class Cilj {
        final String gostitelj, pot; final int vrata;
        Cilj(String gostitelj, int vrata, String pot) { this.gostitelj = gostitelj; this.vrata = vrata; this.pot = pot; }
        String uri() { return "ipp://" + gostitelj + ":" + vrata + pot; }
        @Override public String toString() { return gostitelj + ":" + vrata + pot; }
    }

    private static final class Odgovor {
        int status; final Map<String, List<byte[]>> atributi = new HashMap<>();
        List<String> besedila(String ime) {
            List<String> o = new ArrayList<>();
            List<byte[]> v = atributi.get(ime);
            if (v != null) for (byte[] b : v) o.add(new String(b, StandardCharsets.UTF_8));
            return o;
        }
    }

    private final Context ctx;
    private final SharedPreferences nast;
    private final ExecutorService nit = Executors.newSingleThreadExecutor();

    Tiskalnik(Context ctx) {
        this.ctx = ctx.getApplicationContext();
        nast = this.ctx.getSharedPreferences("tiskalnik", Context.MODE_PRIVATE);
    }

    void ustavi() { nit.shutdownNow(); }

    /** Za okno skrbnika: naslov (ročni ali zadnji najdeni) in ime tiskalnika. */
    String stanje() {
        String rocni = nast.getString("rocni", "");
        try {
            return new JSONObject().put("naslov", rocni.isEmpty() ? nast.getString("najden", "") : rocni)
                    .put("rocni", !rocni.isEmpty()).put("ime", nast.getString("ime", "")).toString();
        } catch (Exception e) { return "{}"; }
    }

    /** Prazno = samodejno v omrežju. */
    void nastavi(String naslov) {
        nast.edit().putString("rocni", naslov == null ? "" : naslov.trim()).remove("najden").remove("ime").apply();
    }

    void natisni(byte[] pdf, String ime, Izid izid) {
        nit.execute(() -> {
            String rocni = nast.getString("rocni", "");
            boolean iskano = false;
            Cilj c = preberi(rocni.isEmpty() ? nast.getString("najden", "") : rocni);
            if (c == null) { c = poisci(); iskano = true; }
            if (c == null) { izid.konec(false, "ni-najden", ""); return; }
            String napaka;
            try { izid.konec(true, "", poslji(c, pdf, ime)); return; }
            catch (Napaka n) { izid.konec(false, n.koda, ""); return; }
            catch (Exception | OutOfMemoryError e) { Log.w(LOG, "tisk " + c, e); napaka = "povezava"; }
            // shranjeni naslov ne dela več (nov naslov v omrežju): enkrat poišči znova
            if (rocni.isEmpty() && !iskano) {
                Cilj n = poisci();
                if (n != null && !n.toString().equals(c.toString())) {
                    try { izid.konec(true, "", poslji(n, pdf, ime)); return; }
                    catch (Napaka m) { napaka = m.koda; }
                    catch (Exception | OutOfMemoryError e) { Log.w(LOG, "tisk " + n, e); }
                }
            }
            izid.konec(false, napaka, "");
        });
    }

    // »192.168.1.50«, »192.168.1.50:631« ali »tiskalnik:631/ipp/print«
    private static Cilj preberi(String s) {
        if (s == null || s.trim().isEmpty()) return null;
        String t = s.trim(), pot = "/ipp/print";
        int p = t.indexOf('/');
        if (p >= 0) { pot = t.substring(p); t = t.substring(0, p); }
        int d = t.lastIndexOf(':'), vrata = IPP_VRATA;
        if (d > 0) {
            try { vrata = Integer.parseInt(t.substring(d + 1)); } catch (NumberFormatException e) { return null; }
            t = t.substring(0, d);
        }
        return t.isEmpty() ? null : new Cilj(t, vrata, pot);
    }

    // ── tisk ──
    private String poslji(Cilj c, byte[] pdf, String ime) throws IOException {
        Odgovor a = ipp(c, zahteva(OP_ATRIBUTI, c, ime, null), null);
        if (a.status >= 0x0100) throw new Napaka("ne-sprejema");
        List<byte[]> sprejema = a.atributi.get("printer-is-accepting-jobs");
        if (sprejema != null && !sprejema.isEmpty() && sprejema.get(0).length == 1 && sprejema.get(0)[0] == 0) throw new Napaka("ne-sprejema");
        List<String> oblike = a.besedila("document-format-supported");
        String oblika; byte[] dokument;
        if (oblike.contains("application/pdf")) { oblika = "application/pdf"; dokument = pdf; }
        else if (oblike.contains("image/pwg-raster")) { oblika = "image/pwg-raster"; dokument = raster(pdf, locljivostPwg(a), false); }
        else if (oblike.contains("image/urf")) { oblika = "image/urf"; dokument = raster(pdf, locljivostUrf(a), true); }
        else throw new Napaka("format");
        byte[] tisk = zahteva(OP_TISK, c, ime, oblika);
        Odgovor o = null;
        for (int i = 0; i < 3; i++) {   // tiskalnik je še zaseden s prejšnjim opravilom (0x0507)
            o = ipp(c, tisk, dokument);
            if (o.status != 0x0507) break;
            try { Thread.sleep(2000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); break; }
        }
        if (o == null || o.status >= 0x0100) throw new Napaka(o != null && o.status == 0x040A ? "format" : "ne-sprejema");
        List<String> model = a.besedila("printer-make-and-model");
        String tiskalnik = model.isEmpty() ? c.gostitelj : model.get(0);
        if (nast.getString("rocni", "").isEmpty()) nast.edit().putString("najden", c.toString()).apply();
        nast.edit().putString("ime", tiskalnik).apply();
        return tiskalnik;
    }

    private static void atribut(DataOutputStream o, int vrsta, String ime, byte[] vrednost) throws IOException {
        byte[] n = ime.getBytes(StandardCharsets.UTF_8);
        o.writeByte(vrsta); o.writeShort(n.length); o.write(n); o.writeShort(vrednost.length); o.write(vrednost);
    }
    private static byte[] b(String s) { return s.getBytes(StandardCharsets.UTF_8); }

    private static byte[] zahteva(int operacija, Cilj c, String ime, String oblika) throws IOException {
        ByteArrayOutputStream bajti = new ByteArrayOutputStream();
        DataOutputStream o = new DataOutputStream(bajti);
        o.writeShort(0x0200); o.writeShort(operacija); o.writeInt(1);
        o.writeByte(T_OPERACIJA);
        atribut(o, V_NABOR, "attributes-charset", b("utf-8"));
        atribut(o, V_JEZIK, "attributes-natural-language", b("sl"));
        atribut(o, V_URI, "printer-uri", b(c.uri()));
        atribut(o, V_IME, "requesting-user-name", b("SmartClean"));
        if (operacija == OP_ATRIBUTI) {
            String[] zelim = {"document-format-supported", "printer-make-and-model", "printer-is-accepting-jobs",
                    "pwg-raster-document-resolution-supported", "urf-supported"};
            for (int i = 0; i < zelim.length; i++) atribut(o, V_KLJUC, i == 0 ? "requested-attributes" : "", b(zelim[i]));
        } else {
            atribut(o, V_IME, "job-name", b(ime == null || ime.isEmpty() ? "SmartClean" : ime));
            atribut(o, V_MIME, "document-format", b(oblika));
            o.writeByte(T_OPRAVILO);
            atribut(o, V_INT, "copies", ByteBuffer.allocate(4).putInt(1).array());
            atribut(o, V_KLJUC, "sides", b("one-sided"));   // dva izvoda sta dva lista, ne obe strani enega
            atribut(o, V_KLJUC, "media", b("iso_a4_210x297mm"));
        }
        o.writeByte(T_KONEC);
        return bajti.toByteArray();
    }

    private static Odgovor ipp(Cilj c, byte[] zahteva, byte[] dokument) throws IOException {
        byte[] r = http(c, zahteva, dokument);
        if (r.length < 8) throw new IOException("kratek odgovor IPP");
        Odgovor a = new Odgovor();
        a.status = u16(r, 2);
        int i = 8; String zadnji = null;
        while (i < r.length) {
            int oznaka = r[i++] & 255;
            if (oznaka == T_KONEC) break;
            if (oznaka < 0x10) continue;   // začetek skupine
            int dn = u16(r, i); i += 2;
            String ime = new String(r, i, dn, StandardCharsets.UTF_8); i += dn;
            int dv = u16(r, i); i += 2;
            byte[] v = Arrays.copyOfRange(r, i, i + dv); i += dv;
            if (dn > 0) zadnji = ime;
            if (zadnji == null) continue;
            List<byte[]> l = a.atributi.get(zadnji);
            if (l == null) { l = new ArrayList<>(); a.atributi.put(zadnji, l); }
            l.add(v);
        }
        return a;
    }
    private static int u16(byte[] b, int i) { return (b[i] & 255) << 8 | (b[i + 1] & 255); }

    private static byte[] http(Cilj c, byte[] zahteva, byte[] dokument) throws IOException {
        try (Socket s = new Socket()) {
            s.setSoTimeout(BRANJE_MS);
            s.connect(new InetSocketAddress(c.gostitelj, c.vrata), PRIKLOP_MS);
            OutputStream o = new BufferedOutputStream(s.getOutputStream(), 64 * 1024);
            long dolzina = zahteva.length + (dokument == null ? 0L : dokument.length);
            o.write(("POST " + c.pot + " HTTP/1.1\r\nHost: " + c.gostitelj + ":" + c.vrata + "\r\nContent-Type: application/ipp\r\n"
                    + "Content-Length: " + dolzina + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
            o.write(zahteva);
            if (dokument != null) o.write(dokument);
            o.flush();
            return odgovor(new BufferedInputStream(s.getInputStream()));
        }
    }

    private static byte[] odgovor(InputStream i) throws IOException {
        while (true) {
            String prva = vrstica(i);
            String[] d = prva.split(" ");
            if (d.length < 2) throw new IOException("odgovor: " + prva);
            int koda;
            try { koda = Integer.parseInt(d[1]); } catch (NumberFormatException e) { throw new IOException("odgovor: " + prva); }
            long dolzina = -1; boolean kosi = false;
            for (String h = vrstica(i); !h.isEmpty(); h = vrstica(i)) {
                String m = h.toLowerCase(Locale.ROOT);
                if (m.startsWith("content-length:")) dolzina = Long.parseLong(m.substring(15).trim());
                else if (m.startsWith("transfer-encoding:") && m.contains("chunked")) kosi = true;
            }
            if (koda == 100) continue;
            if (koda != 200) throw new IOException("HTTP " + koda);
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            if (kosi) {
                while (true) {
                    String v = vrstica(i); int p = v.indexOf(';');
                    long n = Long.parseLong((p >= 0 ? v.substring(0, p) : v).trim(), 16);
                    if (n == 0) break;
                    prepisi(i, o, n);
                    vrstica(i);
                }
            } else if (dolzina >= 0) prepisi(i, o, dolzina);
            else { byte[] b = new byte[8192]; for (int n = i.read(b); n > 0; n = i.read(b)) o.write(b, 0, n); }
            return o.toByteArray();
        }
    }
    private static void prepisi(InputStream i, ByteArrayOutputStream o, long n) throws IOException {
        byte[] b = new byte[8192];
        while (n > 0) {
            int r = i.read(b, 0, (int) Math.min(b.length, n));
            if (r < 0) throw new EOFException();
            o.write(b, 0, r); n -= r;
        }
    }
    private static String vrstica(InputStream i) throws IOException {
        StringBuilder s = new StringBuilder();
        for (int c = i.read(); ; c = i.read()) {
            if (c < 0) throw new EOFException();
            if (c == '\n') break;
            if (c != '\r') s.append((char) c);
        }
        return s.toString();
    }

    // ── iskanje v omrežju ──
    private Cilj poisci() {
        NsdManager nsd = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
        if (nsd == null) return null;
        CountDownLatch najden = new CountDownLatch(1);
        AtomicReference<Cilj> cilj = new AtomicReference<>();
        Deque<NsdServiceInfo> vrsta = new ArrayDeque<>();
        boolean[] razresujem = {false};
        // Android razreši eno storitev naenkrat
        Runnable[] naslednja = new Runnable[1];
        naslednja[0] = () -> {
            NsdServiceInfo s;
            synchronized (vrsta) {
                if (razresujem[0] || vrsta.isEmpty()) return;
                s = vrsta.poll(); razresujem[0] = true;
            }
            nsd.resolveService(s, new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo i, int napaka) {
                    synchronized (vrsta) { razresujem[0] = false; }
                    naslednja[0].run();
                }
                @Override public void onServiceResolved(NsdServiceInfo i) {
                    synchronized (vrsta) { razresujem[0] = false; }
                    if (i.getHost() instanceof Inet4Address) {
                        byte[] rp = i.getAttributes().get("rp");
                        String pot = rp == null || rp.length == 0 ? "/ipp/print" : "/" + new String(rp, StandardCharsets.UTF_8);
                        cilj.compareAndSet(null, new Cilj(i.getHost().getHostAddress(), i.getPort() > 0 ? i.getPort() : IPP_VRATA, pot));
                        najden.countDown();
                    } else naslednja[0].run();
                }
            });
        };
        NsdManager.DiscoveryListener poslusalec = new NsdManager.DiscoveryListener() {
            @Override public void onStartDiscoveryFailed(String tip, int napaka) { najden.countDown(); }
            @Override public void onStopDiscoveryFailed(String tip, int napaka) { }
            @Override public void onDiscoveryStarted(String tip) { }
            @Override public void onDiscoveryStopped(String tip) { }
            @Override public void onServiceLost(NsdServiceInfo s) { }
            @Override public void onServiceFound(NsdServiceInfo s) {
                synchronized (vrsta) { vrsta.add(s); }
                naslednja[0].run();
            }
        };
        try {
            nsd.discoverServices("_ipp._tcp", NsdManager.PROTOCOL_DNS_SD, poslusalec);
            najden.await(ISKANJE_MS, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            Log.w(LOG, "iskanje tiskalnika", e);
        } finally {
            try { nsd.stopServiceDiscovery(poslusalec); } catch (Exception ignored) { }
        }
        return cilj.get();
    }

    // ── slika strani za tiskalnik, ki PDF ne sprejme ──
    private static int locljivostPwg(Odgovor a) {
        List<byte[]> v = a.atributi.get("pwg-raster-document-resolution-supported");
        int prva = 0;
        if (v != null) for (byte[] r : v) {
            if (r.length < 4) continue;
            int x = ByteBuffer.wrap(r).getInt();
            if (x == DPI) return DPI;
            if (prva == 0) prva = x;
        }
        return prva > 0 ? prva : DPI;
    }
    private static int locljivostUrf(Odgovor a) {
        int prva = 0;
        for (String z : a.besedila("urf-supported")) {
            if (!z.startsWith("RS")) continue;
            for (String d : z.substring(2).split("-")) {
                try {
                    int x = Integer.parseInt(d);
                    if (x == DPI) return DPI;
                    if (prva == 0) prva = x;
                } catch (NumberFormatException ignored) { }
            }
        }
        return prva > 0 ? prva : DPI;
    }

    /** Sivinska slika strani (8 bitov): PWG raster ali URF; stiskanje vrstic je pri obeh enako. */
    private byte[] raster(byte[] pdf, int dpi, boolean urf) throws IOException {
        File zacasna = File.createTempFile("tisk", ".pdf", ctx.getCacheDir());
        try {
            try (FileOutputStream f = new FileOutputStream(zacasna)) { f.write(pdf); }
            try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(zacasna, ParcelFileDescriptor.MODE_READ_ONLY);
                 PdfRenderer r = new PdfRenderer(fd)) {
                ByteArrayOutputStream o = new ByteArrayOutputStream(1 << 20);
                int strani = r.getPageCount();
                if (urf) { o.write("UNIRAST\0".getBytes(StandardCharsets.ISO_8859_1)); o.write(ByteBuffer.allocate(4).putInt(strani).array()); }
                else o.write("RaS2".getBytes(StandardCharsets.ISO_8859_1));
                for (int s = 0; s < strani; s++) {
                    try (PdfRenderer.Page p = r.openPage(s)) {
                        int w = Math.round(p.getWidth() * dpi / 72f), h = Math.round(p.getHeight() * dpi / 72f);
                        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                        b.eraseColor(Color.WHITE);
                        p.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT);
                        o.write(urf ? glavaUrf(w, h, dpi) : glavaPwg(w, h, dpi, p.getWidth(), p.getHeight(), strani));
                        strani(o, b);
                        b.recycle();
                    }
                }
                return o.toByteArray();
            }
        } finally {
            if (!zacasna.delete()) zacasna.deleteOnExit();
        }
    }

    private static byte[] glavaPwg(int w, int h, int dpi, int wPt, int hPt, int strani) {
        ByteBuffer g = ByteBuffer.allocate(1796);
        niz(g, 0, "PwgRaster");
        g.putInt(276, dpi); g.putInt(280, dpi);
        g.putInt(340, 1);                         // NumCopies
        g.putInt(352, wPt); g.putInt(356, hPt);   // PageSize
        g.putInt(372, w); g.putInt(376, h);
        g.putInt(384, 8); g.putInt(388, 8); g.putInt(392, w);   // bitov na barvo, na točko, bajtov v vrstici
        g.putInt(400, 18);                        // sGray
        g.putInt(420, 1);                         // barv
        g.putInt(452, strani);
        g.putInt(456, 1); g.putInt(460, 1);       // brez preslikave
        g.putInt(472, w); g.putInt(476, h);       // ImageBox
        niz(g, 1732, "iso_a4_210x297mm");
        return g.array();
    }
    private static void niz(ByteBuffer g, int mesto, String s) {
        byte[] b = s.getBytes(StandardCharsets.ISO_8859_1);
        System.arraycopy(b, 0, g.array(), mesto, b.length);
    }

    private static byte[] glavaUrf(int w, int h, int dpi) {
        ByteBuffer g = ByteBuffer.allocate(32);
        g.put(0, (byte) 8);   // bitov na točko
        g.put(1, (byte) 0);   // sGray
        g.put(2, (byte) 1);   // enostransko
        g.put(3, (byte) 4);   // običajna kakovost
        g.putInt(12, w); g.putInt(16, h); g.putInt(20, dpi);
        return g.array();
    }

    private static void strani(ByteArrayOutputStream o, Bitmap b) {
        int w = b.getWidth(), h = b.getHeight(), ponovitev = 0;
        int[] tocke = new int[w];
        byte[] zadnja = new byte[w], trenutna = new byte[w];
        boolean ima = false;
        for (int y = 0; y < h; y++) {
            b.getPixels(tocke, 0, w, 0, y, w, 1);
            for (int x = 0; x < w; x++) {
                int c = tocke[x];
                trenutna[x] = (byte) ((Color.red(c) * 299 + Color.green(c) * 587 + Color.blue(c) * 114) / 1000);
            }
            if (ima && ponovitev < 255 && Arrays.equals(trenutna, zadnja)) { ponovitev++; continue; }
            if (ima) { o.write(ponovitev); vrsta(o, zadnja); }
            byte[] t = zadnja; zadnja = trenutna; trenutna = t;
            ponovitev = 0; ima = true;
        }
        if (ima) { o.write(ponovitev); vrsta(o, zadnja); }
    }

    // ena vrstica: 0–127 = ista točka n+1-krat, 129–255 = 257−n različnih točk
    private static void vrsta(ByteArrayOutputStream o, byte[] l) {
        int i = 0, n = l.length;
        while (i < n) {
            int j = i + 1;
            if (j < n && l[j] == l[i]) {
                while (j < n && j - i < 128 && l[j] == l[i]) j++;
                o.write(j - i - 1); o.write(l[i]);
            } else {
                while (j < n && j - i < 128 && (j + 1 >= n || l[j] != l[j + 1])) j++;
                int d = j - i;
                if (d == 1) { o.write(0); o.write(l[i]); }
                else { o.write(257 - d); o.write(l, i, d); }
            }
            i = j;
        }
    }
}
