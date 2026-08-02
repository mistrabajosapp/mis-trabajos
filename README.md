# Mis Trabajos — Gemini por audio

Esta versión agrega **Crear trabajo por audio**. El audio se procesa en una función segura de Vercel y la clave de Gemini nunca se incluye en el navegador.

## 1. Crear la clave de Gemini

1. Entrá a [Google AI Studio](https://aistudio.google.com/apikey) con tu cuenta de Google.
2. Tocá **Create API key**.
3. Elegí o creá un proyecto de Google Cloud.
4. Copiá la clave. No la pegues en `index.html` ni la compartas.

## 2. Configurar la clave en Vercel

1. Abrí el proyecto **Mis Trabajos** en Vercel.
2. Entrá en **Settings → Environment Variables**.
3. Creá una variable llamada exactamente `GEMINI_API_KEY`.
4. Pegá la clave como valor.
5. Marcá **Production**, **Preview** y **Development**.
6. Guardá.
7. Volvé a desplegar el proyecto. Una variable nueva no se aplica a un despliegue anterior.

Opcionalmente podés configurar `GEMINI_MODEL`. Si no existe, se usa `gemini-2.5-flash`.

## 3. Publicar en Vercel

Subí la carpeta completa, conservando esta estructura:

```text
index.html
manifest.webmanifest
service-worker.js
icon-192.png
icon-512.png
apple-touch-icon.png
vercel.json
api/
  interpretar-audio.js
README.md
```

No subas únicamente `index.html`: la carpeta `api` es la que protege la clave y se comunica con Gemini.

## 4. Probar

1. Abrí la URL pública HTTPS de Vercel.
2. Iniciá sesión.
3. Tocá **Crear trabajo → Grabar audio**.
4. Permití el micrófono.
5. Decí, por ejemplo: “Trabajo para Juan Pérez, una mesa de comedor. Costo veinte mil, precio treinta y cinco mil, dejó diez mil de seña y entrego el viernes”.
6. Tocá **Detener**.
7. Revisá y corregí la pantalla de confirmación.
8. Tocá **Guardar trabajo**.

Nada se guarda antes de esa confirmación.

## Problemas frecuentes

- **Falta configurar GEMINI_API_KEY:** agregá la variable en Vercel y volvé a desplegar.
- **Permiso rechazado:** habilitá el micrófono para el sitio en Safari/Chrome o usá la carga manual.
- **No aparece la versión nueva:** aceptá el aviso de actualización de la PWA o cerrá y abrí la app.
- **La IA está temporalmente ocupada:** esperá unos segundos y repetí el audio.
- **Desarrollo local:** las funciones `/api` no funcionan abriendo `index.html` con doble clic; probá el despliegue de Vercel o usá Vercel CLI.

## Seguridad y caché

- `GEMINI_API_KEY` solo se lee dentro de `/api/interpretar-audio.js`.
- La función valida la sesión de Supabase antes de llamar a Gemini.
- `/api/` queda excluido del service worker.
- Los audios se envían en memoria para una sola interpretación y no se guardan en Supabase, caché ni archivos del proyecto.
