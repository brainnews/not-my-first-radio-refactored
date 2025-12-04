package com.notmyfirstradio.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioService")
public class AudioServicePlugin extends Plugin {

    private BroadcastReceiver mediaCommandReceiver;

    @Override
    public void load() {
        super.load();
        setupMediaCommandReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (mediaCommandReceiver != null) {
            getContext().unregisterReceiver(mediaCommandReceiver);
        }
    }

    private void setupMediaCommandReceiver() {
        mediaCommandReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String command = intent.getStringExtra("command");
                if (command != null) {
                    JSObject data = new JSObject();
                    data.put("command", command);
                    notifyListeners("mediaCommand", data);
                }
            }
        };

        IntentFilter filter = new IntentFilter("com.notmyfirstradio.app.MEDIA_COMMAND");
        getContext().registerReceiver(mediaCommandReceiver, filter);
    }

    @PluginMethod
    public void startForegroundService(PluginCall call) {
        String stationName = call.getString("stationName", "Radio Station");
        
        Intent serviceIntent = new Intent(getContext(), AudioForegroundService.class);
        serviceIntent.setAction(AudioForegroundService.ACTION_PLAY);
        serviceIntent.putExtra("stationName", stationName);
        
        getContext().startForegroundService(serviceIntent);
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        Intent serviceIntent = new Intent(getContext(), AudioForegroundService.class);
        serviceIntent.setAction(AudioForegroundService.ACTION_STOP);
        
        getContext().stopService(serviceIntent);
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        String stationName = call.getString("stationName", "Radio Station");
        boolean isPlaying = call.getBoolean("isPlaying", false);
        
        Intent serviceIntent = new Intent(getContext(), AudioForegroundService.class);
        serviceIntent.setAction(isPlaying ? AudioForegroundService.ACTION_PLAY : AudioForegroundService.ACTION_PAUSE);
        serviceIntent.putExtra("stationName", stationName);
        
        getContext().startForegroundService(serviceIntent);
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
}