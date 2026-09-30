import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// La API (server/) corre aparte en el puerto 8787. En desarrollo Vite le
// pasa /api, asi el telefono usa un solo origen HTTPS.
const proxy = {
  '/api': { target: process.env.API_PROXY || 'http://localhost:8787', changeOrigin: true },
}

// getUserMedia (la camara) exige contexto seguro. basicSsl sirve por HTTPS
// con un certificado autofirmado para poder probar desde el telefono.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true,       // expone la LAN para abrir la pagina desde el movil
    port: 5173,
    strictPort: true, // si el puerto esta ocupado, fallar en vez de cambiarlo
    proxy,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    proxy,
  },
})
