# Code natif de l'app Android

Le projet Android est généré à chaque build par `npx cap add android` (voir
`.github/workflows/android.yml`) : ces fichiers y sont copiés juste après, dans
`android/app/src/main/java/` (même arborescence que le paquet `app.tricouture`).

- `MainActivity.java` remplace celle de Capacitor pour déclarer les plugins de
  l'app.
- `SystemColorsPlugin.java` lit la couleur du fond d'écran (Material You,
  Android 12+). L'app publiée n'a pas d'adresse de serveur intégrée : les
  plugins ne sont joignables que depuis sa page de départ (`www/index.html`),
  qui passe la couleur au site dans l'adresse (`#…&tc_accent=#rrggbb`, voir
  `app/src/lib/shell.ts`). Avec une adresse intégrée (`SERVER_URL`), le site
  appelle le plugin lui-même.
