# Code natif de l'app Android

Le projet Android est généré à chaque build par `npx cap add android` (voir
`.github/workflows/android.yml`) : ces fichiers y sont copiés juste après, dans
`android/app/src/main/java/` (même arborescence que le paquet `app.tricouture`).

- `MainActivity.java` remplace celle de Capacitor pour déclarer les plugins de
  l'app.
- `SystemColorsPlugin.java` donne au site la couleur du fond d'écran
  (Material You, Android 12+) : voir `app/src/lib/theme.svelte.ts`.
