# Icônes de l'app

Les icônes représentent l'emoji 🪡 (aiguille à coudre) de **Noto Emoji**
(Google), publié sous licence Apache 2.0 :
https://github.com/googlefonts/noto-emoji

- `android/` est copié dans `android/app/src/main/res/` par le workflow
  *Build Android APK*, juste après `npx cap add android` : il remplace l'icône
  par défaut de Capacitor (icônes classiques, rondes et adaptatives).
- Les mêmes icônes servent au site : `app/static/favicon.svg`,
  `apple-touch-icon.png`, `icon-192.png` et `icon-512.png`.
