package si.smartclean.rfid;

import android.app.admin.DeviceAdminReceiver;

/** Lastnik naprave za kiosk na C72 (adb shell dpm set-device-owner si.smartclean.rfid/.Skrbnik). */
public class Skrbnik extends DeviceAdminReceiver { }
