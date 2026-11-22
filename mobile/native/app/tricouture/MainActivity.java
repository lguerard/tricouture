package app.tricouture;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

// Remplace celle générée par `npx cap add android` (workflow android.yml) :
// les plugins propres à l'app doivent être déclarés avant super.onCreate().
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemColorsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
