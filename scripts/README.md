# Iconos de la PWA (mascota Chubi)

Los iconos de la app (`public/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`)
se generan a partir de los SVG fuente de esta carpeta:

- `chubi-icon.svg`          → icono normal (purpose "any")
- `chubi-icon-maskable.svg` → versión con más margen para el recorte circular de Android (purpose "maskable")

La paleta y la anatomía replican la mascota Chubi del CSS (`app/legacy.css`, sección CHUBI).

## Regenerar los PNG

```bash
npm install --no-save sharp
node -e '
const sharp = require("sharp"), fs = require("fs");
const main = fs.readFileSync("scripts/chubi-icon.svg");
const mask = fs.readFileSync("scripts/chubi-icon-maskable.svg");
(async () => {
  await sharp(main, { density: 384 }).resize(512, 512).png().toFile("public/icon-512.png");
  await sharp(main, { density: 384 }).resize(192, 192).png().toFile("public/icon-192.png");
  await sharp(mask, { density: 384 }).resize(512, 512).png().toFile("public/icon-512-maskable.png");
})();
'
```

Editá el SVG, corré el comando y los PNG se actualizan. `sharp` se instala con `--no-save`
(no queda en `package.json`); podés borrar `node_modules/sharp` después.
