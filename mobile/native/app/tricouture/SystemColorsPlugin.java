package app.tricouture;

import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Material You : la couleur principale tirée du fond d'écran (Android 12+),
 * pour que le site en tire son thème (app/src/lib/theme.svelte.ts).
 * Avant Android 12, rien : le site garde ses couleurs.
 */
@CapacitorPlugin(name = "SystemColors")
public class SystemColorsPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            int color = getContext().getColor(android.R.color.system_accent1_500);
            result.put("accent", String.format("#%06X", 0xFFFFFF & color));
        }
        call.resolve(result);
    }
}
