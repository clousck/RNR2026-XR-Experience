# Foto con Watt

Página de la gincana: el QR (generado fuera de la app) lleva a esta URL, se abre
la cámara con Watt encima, se elige una pose, se toma la foto con cuenta
regresiva de 3 segundos y se comparte al grupo de WhatsApp.

React + Vite + three.js. Sin backend.

## Cómo funciona

- **Cámara**: `getUserMedia`. Arranca con la frontal (selfie); el botón ⇄ cambia
  a la trasera. La frontal se ve espejada, como cualquier app de cámara.
- **Watt**: se carga `src/assets/watt.fbx` con el `FBXLoader` de three.js y se
  dibuja en un canvas transparente encima del video. Watt queda fijo en la
  pantalla (no está anclado al suelo): un dedo lo mueve, dos dedos lo agrandan y
  lo giran, ⟲ lo vuelve a centrar.
- **Poses**: cada pose del FBX es un clip de un solo keyframe. Al tocar un botón,
  los huesos interpolan hacia la pose nueva (transición suave, sin AnimationMixer).
- **Foto**: se compone el frame del video + el render de Watt en un JPG, con el
  mismo recorte que se ve en pantalla. Los botones de la UI no salen en la foto.
- **Compartir**: Web Share API → hoja de compartir del sistema → WhatsApp → grupo.
  No existe forma de mandar una imagen directo a un grupo de WhatsApp desde una
  web; el usuario elige el grupo. Si el navegador no soporta compartir archivos,
  la foto se descarga.

## Estructura

    src/poses.js               botones: clip del FBX → etiqueta
    src/App.jsx                UI: poses, cuenta regresiva, vista previa
    src/components/WattCanvas  canvas de three.js
    src/lib/wattStage.js       escena, carga del FBX, poses, gestos
    src/lib/useCamera.js       cámara frontal/trasera
    src/lib/composePhoto.js    video + Watt → JPG

## Poses

El FBX trae 10 clips. Los que se usan:

| Clip              | Botón    |
|-------------------|----------|
| `Armature|Pose 1` | Baile    |
| `Armature|Pose 2` | Tierno   |
| `Armature|Pose 3` | ¡Fuerza! |
| `Armature|Pose 4` | Abrazo   |
| `Armature|Pose 5` | Acostado |
| `Armature|Pose 6` | Pícaro   |

`Pose T`, `Action`, `Action.001` y `Action.002` quedan fuera: las tres `Action`
son copias exactas de la Pose T (restos de Blender). Para renombrar o reordenar
botones, edita `src/poses.js`.

`?pose=Pose%203` en la URL elige la pose inicial.

## ⚠️ Textura de Watt

La textura **no está embebida** en el FBX: el archivo apunta a
`C:\Users\Oscar\Desktop\U\UIES ED Games\gatoieeee.png`, una ruta de otra PC.
Para que Watt salga con sus colores, copia ese PNG a `src/assets/gatoieeee.png`.
La app lo busca por nombre de archivo, así que la ruta original da igual.

Mientras falte, Watt se ve gris claro (color base del material) y la consola
avisa `[watt] Faltan texturas: gatoieeee.png`.

Alternativa: reexportar desde Blender con *Path Mode: Copy* + *Embed Textures*.

## Uso

    npm install
    npm run dev                          # https://localhost:5173, para programar
    npm run build && npm run preview     # https://<tu-ip>:4173, para probar en el celular

Las dos corren por HTTPS (certificado autofirmado): sin HTTPS el navegador no
da acceso a la cámara. En el celular hay que aceptar la advertencia del
certificado una vez. Para probar desde el celular usa `preview`, no `dev`:
en dev three.js se sirve sin minificar y tarda mucho en cargar por wifi.

`?nocam` en la URL no pide la cámara (fondo liso), útil en escritorio.

## Deploy en Cloudflare Pages

Workers & Pages → Create → Pages → *Connect to Git* → este repo, con:

| Campo                  | Valor           |
|------------------------|-----------------|
| Framework preset       | `React (Vite)`  |
| Build command          | `npm run build` |
| Build output directory | `dist`          |

La versión de Node sale de `.node-version` (22); Vite 8 no compila con Node 18.
Cada push a `main` redespliega solo. Cloudflare da HTTPS, que es obligatorio
para la cámara. Es una sola página, no hace falta configurar rewrites. El QR
debe apuntar a la URL final (`https://<proyecto>.pages.dev` o tu dominio).
