import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Proveedores from './pages/Proveedores'
import Facturas from './pages/Facturas'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/proveedores" element={<Proveedores />} />
            <Route path="/facturas"    element={<Facturas />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}