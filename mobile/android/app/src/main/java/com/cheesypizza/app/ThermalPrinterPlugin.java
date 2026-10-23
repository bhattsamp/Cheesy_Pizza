package com.cheesypizza.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Prints bills and KOTs on a Bluetooth receipt printer (the common 58 mm / 80 mm ESC/POS kind)
 * that is already paired in the phone's Bluetooth settings. Admin app only (its manifest holds
 * the Bluetooth permissions). The page sends plain text lines, 32 characters wide.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class ThermalPrinterPlugin extends Plugin {

    // Serial port profile: what Bluetooth receipt printers speak
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    // Android 12+ asks the person once for "Nearby devices"; older phones grant it at install
    private boolean needsAsk() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private boolean ready(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("This phone has no Bluetooth", "NO_BT"); return false; }
        if (!a.isEnabled()) { call.reject("Bluetooth is off", "BT_OFF"); return false; }
        return true;
    }

    @PluginMethod
    public void list(PluginCall call) {
        if (needsAsk()) { requestPermissionForAlias("bluetooth", call, "listAfterAsk"); return; }
        doList(call);
    }

    @PermissionCallback
    private void listAfterAsk(PluginCall call) {
        if (needsAsk()) { call.reject("Bluetooth permission was not given", "NO_PERMISSION"); return; }
        doList(call);
    }

    @SuppressLint("MissingPermission")
    private void doList(PluginCall call) {
        if (!ready(call)) return;
        JSArray list = new JSArray();
        for (BluetoothDevice d : adapter().getBondedDevices()) {
            JSObject o = new JSObject();
            String n = d.getName();
            o.put("name", n == null || n.isEmpty() ? d.getAddress() : n);
            o.put("address", d.getAddress());
            list.put(o);
        }
        JSObject r = new JSObject();
        r.put("devices", list);
        call.resolve(r);
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (needsAsk()) { requestPermissionForAlias("bluetooth", call, "printAfterAsk"); return; }
        doPrint(call);
    }

    @PermissionCallback
    private void printAfterAsk(PluginCall call) {
        if (needsAsk()) { call.reject("Bluetooth permission was not given", "NO_PERMISSION"); return; }
        doPrint(call);
    }

    @SuppressLint("MissingPermission")
    private void doPrint(PluginCall call) {
        String address = call.getString("address", "");
        String text = call.getString("text", "");
        if (!BluetoothAdapter.checkBluetoothAddress(address)) { call.reject("No printer chosen", "NO_PRINTER"); return; }
        if (!ready(call)) return;
        BluetoothAdapter a = adapter();
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
                out.write(new byte[] { 0x1B, 0x40 }); // reset
                out.write(text.replace("\r", "").getBytes(StandardCharsets.US_ASCII));
                out.write("\n\n\n\n".getBytes(StandardCharsets.US_ASCII)); // feed past the tear bar
                out.write(new byte[] { 0x1D, 0x56, 0x42, 0x00 }); // cut, on printers that have a cutter
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
}
