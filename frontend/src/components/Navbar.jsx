import { Link, useLocation } from 'react-router-dom'

const links = [
  { to: '/',            label: 'Dashboard'    },
  { to: '/proveedores', label: 'Proveedores'  },
  { to: '/facturas',    label: 'Facturas'     },
]

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <span className="font-bold text-2x1 text-gray-800">Cuentas por Pagar</span>
      <div className="flex gap-6">
        {links.map(link => (
          <Link
            key={link.to}
            to={link.to}
            className={`text-sm font-medium transition-colors ${
              pathname === link.to
                ? 'text-blue-600 border-b-2 border-blue-600 pb-1'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}