package com.cotepa.sat;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(BackgroundLocationPlugin.class);
    registerPlugin(ExternalNavigationPlugin.class);
  }
}
