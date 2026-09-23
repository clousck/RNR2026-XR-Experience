# Foto con Watt

Página de la gincana: el QR (generado fuera de la app) lleva a esta URL, se abre
la cámara con Watt encima, se elige una pose, se toma la foto con cuenta
regresiva de 3 segundos y se comparte al grupo de WhatsApp.

React + Vite + three.js. Sin backend.

## Cómo funciona

La página abre en **modo cámara** (Watt encima del video) y, si el teléfono lo
soporta, ofrece el botón **"Poner a Watt en el piso (AR)"**:

| Dispositivo | AR | Poses en AR | Foto 3s en AR |
|---|---|---|---|
| Android + Chrome (ARCore) | WebXR: Watt apoyado en el piso real | Sí, botones en pantalla | Sí (cámara + Watt) |
| iPhone / iPad (Safari) | AR Quick Look con la pose elegida | Se elige antes de entrar | No: botón de foto de Quick Look o captura de pantalla |
| Otros | Solo modo cámara | Sí | Sí |

- **Modo cámara**: `getUserMedia`, trasera por defecto (⇄ cambia a la frontal). Watt fijo en
  pantalla: un dedo lo mueve, dos dedos lo agrandan y lo giran, ⟲ lo centra.
- **AR en Android**: sesión WebXR `immersive-ar` con `hit-test` (detecta el piso),
  `dom-overlay` (los botones siguen visibles) y `camera-access` (para que la foto
  incluya la imagen de la cámara). Apuntas al piso, aparece un anillo amarillo,
  tocas y Watt queda ahí mirando al teléfono, a 0.8 m de alto. Tocar el piso lo
  mueve; pellizcar lo agranda y lo gira. Compartir/Descargar salen primero del AR.
- **AR en iPhone**: Safari no tiene WebXR, así que se usa Quick Look. La pose
  elegida se "hornea" en una malla estática y se exporta a USDZ en el propio
  navegador (Quick Look no permite cambiar poses adentro). Para otra pose: salir,
  elegirla y volver a entrar.
- **Poses**: cada pose del FBX es un clip de un solo keyframe; los huesos
  interpolan hacia la pose nueva. Cada pose se ajusta para que su punto más bajo
  toque el piso: "Acostado" queda tendido en el suelo (0.34 m alto × 0.8 m largo).
- **Foto**: JPG con exactamente lo que se ve, sin los botones. Resolución:
  - *Android (Chrome)*: foto real del sensor con `ImageCapture.takePhoto()`, a la
    resolución máxima de la cámara, recortada al encuadre de la pantalla sin
    estirar (en un Pixel 9, ~1820×4080). La foto del sensor es 4:3 y puede venir
    girada, y el video puede estar recortado por estabilización: en vez de
    suponerlo, se compara una miniatura del video con la foto para encontrar el
    giro y el recorte. Si la coincidencia no es confiable, se usa el cuadro de video.
  - *iPhone*: Safari no tiene `ImageCapture`; la foto sale del video, pedido en 4K.
  - *AR*: la imagen de la cámara la fija ARCore; la foto sale a la resolución
    nativa de la pantalla.
  - Watt se renderiza directo a la resolución final. JPG calidad 0.95.
- **Foto horizontal**: si la rotación automática está activada, la página gira
  y la foto sale horizontal sola. Si está bloqueada, el acelerómetro detecta que
  el teléfono está de lado: Watt se muestra derecho, aparece la etiqueta
  "Foto horizontal" y la foto se guarda girada, en horizontal. La interfaz no
  gira. Funciona en modo cámara y en AR. En iPhone el acelerómetro pide
  permiso; se solicita con el primer toque. `?rot=90` simula el giro en escritorio.
- **Salir**: en AR vuelve al modo cámara; fuera del AR apaga la cámara y muestra
  una pantalla de cierre (una página abierta desde un QR no puede cerrar su propia
  pestaña). "Volver a empezar" reabre la cámara.
- **Compartir**: Web Share API → hoja de compartir del sistema → WhatsApp → grupo.
  Ninguna web puede mandar una imagen directo a un grupo; el usuario lo elige.

## Estructura

    src/poses.js               botones: clip del FBX → etiqueta
    src/App.jsx                UI: poses, cuenta regresiva, vista previa
    src/components/WattCanvas  canvas de three.js
    src/lib/wattStage.js       escena, carga del FBX, poses, gestos, AR WebXR
    src/lib/quickLook.js       pose → USDZ para Quick Look (iPhone)
    src/lib/useCamera.js       cámara frontal/trasera
    src/lib/useDeviceRotation.js  teléfono de lado con la rotación bloqueada
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
