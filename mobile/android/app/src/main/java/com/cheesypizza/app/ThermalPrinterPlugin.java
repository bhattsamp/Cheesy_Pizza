package com.cheesypizza.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Prints bills and KOTs on a receipt printer (the common 58 mm / 80 mm ESC/POS kind) and opens
 * the cash drawer plugged into it. Admin app only (its manifest holds the Bluetooth permissions).
 *
 * Two kinds of printer:
 *  - Bluetooth: already paired in Android's Bluetooth settings. Address is its MAC address.
 *    POS terminals with a built-in printer usually show it here too (e.g. "InnerPrinter").
 *  - USB: plugged into the terminal. Address is "usb:VENDOR:PRODUCT" so it survives a re-plug.
 *    Android asks once to allow the app to use it.
 *
 * The page sends plain text lines. With drawer: true the printer also gets the ESC/POS
 * "open drawer" pulse, which opens a cash drawer wired to the printer's RJ11 drawer port.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class ThermalPrinterPlugin extends Plugin {

    // Serial port profile: what Bluetooth receipt printers speak
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String USB_PREFIX = "usb:";
    private static final String USB_PERMISSION = "com.cheesypizza.USB_PRINTER_PERMISSION";

    // ESC p m t1 t2: pulse drawer pin 2, then pin 5, so both common drawer wirings open
    private static final byte[] DRAWER = { 0x1B, 0x70, 0x00, 0x19, (byte) 0xFA, 0x1B, 0x70, 0x01, 0x19, (byte) 0xFA };

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    private UsbManager usb() {
        return (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    }

    // Android 12+ asks the person once for "Nearby devices"; older phones grant it at install
    private boolean needsAsk() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    /** Why Bluetooth can't be used right now, or null when it can. */
    private String btProblem() {
        BluetoothAdapter a = adapter();
        if (a == null) return "NO_BT";
        if (!a.isEnabled()) return "BT_OFF";
        return null;
    }

    private static final java.util.Map<String, String> BT_MSG = new java.util.HashMap<String, String>() {{
        put("NO_BT", "This phone has no Bluetooth");
        put("BT_OFF", "Bluetooth is off");
    }};

    // ---------- list ----------

    @PluginMethod
    public void list(PluginCall call) {
        if (needsAsk() && btProblem() == null) { requestPermissionForAlias("bluetooth", call, "listAfterAsk"); return; }
        doList(call);
    }

    @PermissionCallback
    private void listAfterAsk(PluginCall call) {
        doList(call);
    }

    @SuppressLint("MissingPermission")
    private void doList(PluginCall call) {
        JSArray list = new JSArray();
        // USB printers first: on a POS terminal that is usually the one
        UsbManager um = usb();
        if (um != null) {
            for (UsbDevice d : um.getDeviceList().values()) {
                if (findOut(d) == null) continue;
                JSObject o = new JSObject();
                String n = Build.VERSION.SDK_INT >= 21 ? d.getProductName() : null;
                o.put("name", (n == null || n.trim().isEmpty() ? "USB printer" : n.trim()) + " (USB)");
                o.put("address", USB_PREFIX + d.getVendorId() + ":" + d.getProductId());
                o.put("type", "usb");
                list.put(o);
            }
        }
        String bp = btProblem();
        boolean btOk = bp == null && !needsAsk();
        if (btOk) {
            for (BluetoothDevice d : adapter().getBondedDevices()) {
                JSObject o = new JSObject();
                String n = d.getName();
                o.put("name", n == null || n.isEmpty() ? d.getAddress() : n);
                o.put("address", d.getAddress());
                o.put("type", "bt");
                list.put(o);
            }
        }
        if (list.length() == 0 && !btOk) {
            String code = bp != null ? bp : "NO_PERMISSION";
            call.reject(bp != null ? BT_MSG.get(bp) : "Bluetooth permission was not given", code);
            return;
        }
        JSObject r = new JSObject();
        r.put("devices", list);
        call.resolve(r);
    }

    // ---------- print / open drawer ----------

    @PluginMethod
    public void print(PluginCall call) {
        start(call);
    }

    @PluginMethod
    public void openDrawer(PluginCall call) {
        start(call);
    }

    private boolean isUsb(String address) {
        return address != null && address.startsWith(USB_PREFIX);
    }

    private void start(PluginCall call) {
        String address = call.getString("address", "");
        if (isUsb(address)) { sendUsb(call); return; }
        if (needsAsk()) { requestPermissionForAlias("bluetooth", call, "sendAfterAsk"); return; }
        sendBt(call);
    }

    @PermissionCallback
    private void sendAfterAsk(PluginCall call) {
        if (needsAsk()) { call.reject("Bluetooth permission was not given", "NO_PERMISSION"); return; }
        sendBt(call);
    }

    /** The bytes for this call: text (print) and/or the drawer pulse. */
    private byte[] payload(PluginCall call) {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        boolean drawerOnly = "openDrawer".equals(call.getMethodName());
        boolean drawer = drawerOnly || Boolean.TRUE.equals(call.getBoolean("drawer", false));
        byte[] reset = { 0x1B, 0x40 };
        b.write(reset, 0, reset.length);
        if (drawer) b.write(DRAWER, 0, DRAWER.length); // open first, so the cashier isn't waiting on the print
        if (!drawerOnly) {
            byte[] t = call.getString("text", "").replace("\r", "").getBytes(StandardCharsets.US_ASCII);
            b.write(t, 0, t.length);
            byte[] feed = "\n\n\n\n".getBytes(StandardCharsets.US_ASCII); // feed past the tear bar
            b.write(feed, 0, feed.length);
            byte[] cut = { 0x1D, 0x56, 0x42, 0x00 }; // cut, on printers that have a cutter
            b.write(cut, 0, cut.length);
        }
        return b.toByteArray();
    }

    @SuppressLint("MissingPermission")
    private void sendBt(PluginCall call) {
        String address = call.getString("address", "");
        if (!BluetoothAdapter.checkBluetoothAddress(address)) { call.reject("No printer chosen", "NO_PRINTER"); return; }
        String bp = btProblem();
        if (bp != null) { call.reject(BT_MSG.get(bp), bp); return; }
        BluetoothAdapter a = adapter();
        byte[] data = payload(call);
        new Thread(() -> {
            BluetoothSocket s = null;
            try {
                a.cancelDiscovery();
                BluetoothDevice d = a.getRemoteDevice(address);
                try {
                    s = d.createRfcommSocketToServiceRecord(SPP);
                    s.connect();
                } catch (Exception first) {
                    // Some cheap printers only answer on the insecure channel
                    try { if (s != null) s.close(); } catch (Exception ignored) {}
                    s = d.createInsecureRfcommSocketToServiceRecord(SPP);
                    s.connect();
                }
                OutputStream out = s.getOutputStream();
                out.write(data);
                out.flush();
                Thread.sleep(600); // let the printer take it all before the link closes
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not reach the printer. Check it is on, has paper and is near the phone.", "PRINT_FAILED");
            } finally {
                try { if (s != null) s.close(); } catch (Exception ignored) {}
            }
        }).start();
    }

    // ---------- USB ----------

    private UsbDevice findUsb(String address) {
        UsbManager um = usb();
        if (um == null) return null;
        String[] p = address.substring(USB_PREFIX.length()).split(":");
        if (p.length != 2) return null;
        for (UsbDevice d : um.getDeviceList().values()) {
            if (String.valueOf(d.getVendorId()).equals(p[0]) && String.valueOf(d.getProductId()).equals(p[1])) return d;
        }
        return null;
    }

    /** The interface + bulk OUT endpoint to write to, preferring a USB printer-class interface. */
    private Object[] findOut(UsbDevice d) {
        Object[] fallback = null;
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            UsbInterface itf = d.getInterface(i);
            for (int j = 0; j < itf.getEndpointCount(); j++) {
                UsbEndpoint ep = itf.getEndpoint(j);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                    if (itf.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return new Object[] { itf, ep };
                    if (fallback == null && itf.getInterfaceClass() != UsbConstants.USB_CLASS_MASS_STORAGE) fallback = new Object[] { itf, ep };
                }
            }
        }
        return fallback;
    }

    private void sendUsb(PluginCall call) {
        String address = call.getString("address", "");
        UsbDevice d = findUsb(address);
        if (d == null) { call.reject("The USB printer is not plugged in", "USB_GONE"); return; }
        UsbManager um = usb();
        if (um.hasPermission(d)) { writeUsb(call, d); return; }
        // Android shows "Allow Cheesy Pizza Admin to access the printer?" once
        Context ctx = getContext();
        BroadcastReceiver r = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                try { ctx.unregisterReceiver(this); } catch (Exception ignored) {}
                if (um.hasPermission(d)) writeUsb(call, d);
                else call.reject("USB printer access was not allowed", "USB_DENIED");
            }
        };
        ContextCompat.registerReceiver(ctx, r, new IntentFilter(USB_PERMISSION), ContextCompat.RECEIVER_NOT_EXPORTED);
        Intent intent = new Intent(USB_PERMISSION).setPackage(ctx.getPackageName());
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        um.requestPermission(d, PendingIntent.getBroadcast(ctx, 0, intent, flags));
    }

    private void writeUsb(PluginCall call, UsbDevice d) {
        byte[] data = payload(call);
        new Thread(() -> {
            UsbDeviceConnection con = null;
            UsbInterface itf = null;
            try {
                Object[] out = findOut(d);
                if (out == null) throw new Exception("no output");
                itf = (UsbInterface) out[0];
                UsbEndpoint ep = (UsbEndpoint) out[1];
                con = usb().openDevice(d);
                if (con == null || !con.claimInterface(itf, true)) throw new Exception("busy");
                int off = 0;
                while (off < data.length) {
                    int n = Math.min(4096, data.length - off);
                    byte[] chunk = new byte[n];
                    System.arraycopy(data, off, chunk, 0, n);
                    int w = con.bulkTransfer(ep, chunk, n, 5000);
                    if (w <= 0) throw new Exception("write failed");
                    off += w;
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not reach the USB printer. Check it is on, plugged in and has paper.", "PRINT_FAILED");
            } finally {
                try { if (con != null && itf != null) con.releaseInterface(itf); } catch (Exception ignored) {}
                try { if (con != null) con.close(); } catch (Exception ignored) {}
            }
        }).start();
    }
}
