# App-Grafiken

`icon.svg` ist die Quelle für alle App-Icons und Startbildschirme (iOS, Android, Google-Play-Icon).
Nach einer Änderung neu erzeugen:

```sh
CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/native/make-icons.mjs
```
