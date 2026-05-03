import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { useAuth } from './context/useAuth'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Proveedores from './pages/Proveedores'
import Facturas from './pages/Facturas'
import Comprobantes from './pages/Comprobantes'
import Login from './pages/Login'

function AppRoutes() {
  const { session } = useAuth()

  // Todavía cargando la sesión inicial
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  // Sin sesión → solo muestra login
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  // Con sesión → app completa
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/"             element={<Dashboard />}    />
          <Route path="/proveedores"  element={<Proveedores />}  />
          <Route path="/facturas"     element={<Facturas />}     />
          <Route path="/comprobantes" element={<Comprobantes />} />
          <Route path="*"             element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
