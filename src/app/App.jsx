import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'

// El booth trae three.js y el FBX de Watt (~1.5 MB): se carga solo al abrirlo.
const WattBooth = lazy(() => import('../features/booth/WattBooth'))

const loading = <div className="overlay-msg">Cargando a Watt…</div>

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={loading}>
        <Routes>
          {/* La raiz sigue siendo el booth: hay QRs impresos que apuntan aca. */}
          <Route path="/" element={<WattBooth />} />
          <Route path="/e/:slug/watt" element={<WattBooth />} />
          <Route path="*" element={<WattBooth />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
