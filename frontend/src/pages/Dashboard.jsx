import { useQuery } from '@tanstack/react-query'
import { getDashboard, getFacturas } from '../api/facturas'
import EstadoBadge from '../components/EstadoBadge'

function TarjetaResumen({ titulo, valor, color }) {
  return (
    <div className={`rounded-xl p-6 text-white ${color}`}>
      <p className="text-sm font-medium opacity-80">{titulo}</p>
      <p className="text-4xl font-bold mt-1">{valor}</p>
    </div>
  )
}

export default function Dashboard() {
  const { data: resumen } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => getDashboard().then(r => r.data)
  })

  const { data: vencidas } = useQuery({
    queryKey: ['facturas', 'vencida'],
    queryFn: () => getFacturas({ estado: 'vencida' }).then(r => r.data)
  })

  const { data: proximas } = useQuery({
    queryKey: ['facturas', 'pendiente'],
    queryFn: () => getFacturas({ estado: 'pendiente' }).then(r => r.data)
  })

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4">
        <TarjetaResumen
          titulo="Facturas pendientes"
          valor={resumen?.pendientes ?? '—'}
          color="bg-yellow-500"
        />
        <TarjetaResumen
          titulo="Próximas a vencer (7 días)"
          valor={resumen?.proximas_a_vencer ?? '—'}
          color="bg-blue-500"
        />
        <TarjetaResumen
          titulo="Facturas vencidas"
          valor={resumen?.vencidas ?? '—'}
          color="bg-red-500"
        />
      </div>

      <div className="space-y-6">
        <Section titulo="Facturas vencidas" facturas={vencidas} />
        <Section titulo="Próximas a vencer" facturas={proximas} />
      </div>
    </div>
  )
}

function Section({ titulo, facturas }) {
  if (!facturas?.length) return null

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-700 mb-3">{titulo}</h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Proveedor</th>
              <th className="px-4 py-3 text-left">N° Factura</th>
              <th className="px-4 py-3 text-left">Vencimiento</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {facturas.map(f => (
              <tr key={f.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{f.proveedor.nombre}</td>
                <td className="px-4 py-3 text-gray-600">{f.numero_factura}</td>
                <td className="px-4 py-3 text-gray-600">{f.fecha_vencimiento}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-800">
                  {f.proveedor.moneda === 'USD' ? '$' : '₡'}
                  {Number(f.saldo_pendiente).toLocaleString('es-CR')}
                </td>
                <td className="px-4 py-3 text-center">
                  <EstadoBadge estado={f.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}