package com.cotepa.sat;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExternalNavigation")
public class ExternalNavigationPlugin extends Plugin {
    @PluginMethod
    public void openGoogleMaps(PluginCall call) {
        Double lat = call.getDouble("lat", null);
        Double lng = call.getDouble("lng", null);
        String address = call.getString("address", "");

        String destination;
        boolean tieneCoords = lat != null && lng != null && !(lat == 0.0 && lng == 0.0);
        if (tieneCoords) {
            destination = lat + "," + lng;
        } else {
            destination = address != null ? address.trim() : "";
        }

        if (destination == null || destination.trim().isEmpty()) {
            call.reject("Destino vacío");
            return;
        }

        boolean opened = tryOpenGoogleMapsNavigation(destination);
        if (!opened) {
            opened = tryOpenGoogleMapsHttps(destination);
        }

        if (!opened) {
            call.reject("No se pudo abrir Google Maps");
            return;
        }

        JSObject rsp = new JSObject();
        rsp.put("opened", true);
        call.resolve(rsp);
    }

    private boolean tryOpenGoogleMapsNavigation(String destination) {
        try {
            Uri uri = Uri.parse("google.navigation:q=" + Uri.encode(destination));
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.setPackage("com.google.android.apps.maps");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean tryOpenGoogleMapsHttps(String destination) {
        try {
            Uri uri = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=" + Uri.encode(destination) + "&travelmode=driving&dir_action=navigate");
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.setPackage("com.google.android.apps.maps");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
