import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getComprobantes, eliminarComprobante } from '../api/comprobantes'
import { formatFecha } from '../utils/fecha'
import * as XLSX from 'xlsx'
import Toast from '../components/Toast'
import Modal from '../components/Modal'

const fmt = (n) => Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Todas las tasas posibles para la tabla resumen, en orden
const TASAS_ORDEN = ['13%', '8%', '4%', '2%', '1%', '1% Canasta básica', '0.5%', '0% Exento', '0% Exonerado', '0% No sujeto', 'Otros cargos']

export default function GenerarReporte({ entidad }) {
  const queryClient = useQueryClient()
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [toast, setToast]   = useState(null)
  const cerrarToast = useCallback(() => setToast(null), [])

  const { data: comprobantes = [], isLoading } = useQuery({
    queryKey: ['comprobantes', entidad, fechaDesde, fechaHasta],
    queryFn: () => getComprobantes({
      entidad,
      ...(fechaDesde && { fecha_desde: fechaDesde }),
      ...(fechaHasta && { fecha_hasta: fechaHasta }),
    }).then(r => r.data)
  })

  const eliminar = useMutation({
    mutationFn: eliminarComprobante,
    onSuccess: () => {
      queryClient.invalidateQueries(['comprobantes', entidad])
      setConfirmEliminar(null)
      setToast({ mensaje: 'Comprobante eliminado.', tipo: 'exito' })
    },
    onError: () => setToast({ mensaje: 'Error al eliminar.', tipo: 'error' })
  })

  // ── Totales generales ─────────────────────────────────────────────────────
  const totales = comprobantes.reduce(
    (acc, c) => ({
      subtotal:   acc.subtotal   + Number(c.subtotal_crc),
      descuentos: acc.descuentos + Number(c.descuentos_crc),
      impuesto:   acc.impuesto   + Number(c.impuesto_crc),
      total:      acc.total      + Number(c.total_crc),
    }),
    { subtotal: 0, descuentos: 0, impuesto: 0, total: 0 }
  )

  // ── Resumen agrupado por tasa IVA ─────────────────────────────────────────
  // Una factura puede tener varias tasas (ej: "13%, 0% Exento")
  // La lógica la asigna completa por ahora; si el cliente necesita prorrateo exacto por línea
  // hay que guardar más detalle en el backend.
  const resumenPorTasa = {}
  comprobantes.forEach(c => {
    const tasas = c.tasas_iva.split(',').map(t => t.trim())
    // Si solo tiene una tasa, le asignamos todos los montos a esa tasa
    // Si tiene varias, los totales van a "Otros cargos"
    const tasa = tasas.length === 1 ? tasas[0] : 'Otros cargos'
    if (!resumenPorTasa[tasa]) resumenPorTasa[tasa] = { subtotal: 0, impuesto: 0, total: 0 }
    resumenPorTasa[tasa].subtotal  += Number(c.subtotal_crc)
    resumenPorTasa[tasa].impuesto  += Number(c.impuesto_crc)
    resumenPorTasa[tasa].total     += Number(c.total_crc)
  })

  // ── Exportar Excel ────────────────────────────────────────────────────────
  function exportarExcel() {
    // Sheet 1: detalle de comprobantes
    const filas = comprobantes.map(c => ({
      'N° Consecutivo':  c.numero_consecutivo,
      'Fecha':           c.fecha_emision,
      'Emisor':          c.emisor_nombre,
      'Cédula emisor':   c.emisor_cedula,
      'Moneda original': c.moneda_original,
      'Tipo de cambio':  Number(c.tipo_cambio),
      'Subtotal (₡)':    Number(c.subtotal_crc),
      'Descuentos (₡)':  Number(c.descuentos_crc),
      'IVA (₡)':         Number(c.impuesto_crc),
      'Total (₡)':       Number(c.total_crc),
      'Tasa(s) IVA':     c.tasas_iva,
    }))
    // Fila de totales
    filas.push({})
    filas.push({
      'N° Consecutivo': 'TOTALES',
      'Subtotal (₡)':   totales.subtotal,
      'Descuentos (₡)': totales.descuentos,
      'IVA (₡)':        totales.impuesto,
      'Total (₡)':      totales.total,
    })

    // Sheet 2: resumen por tasa IVA (estilo Hacienda)
    const filasResumen = TASAS_ORDEN.map(tasa => ({
      'Tarifa IVA':     tasa,
      'SubTotal (₡)':   resumenPorTasa[tasa] ? Number(resumenPorTasa[tasa].subtotal.toFixed(2))  : '',
      'Impuesto (₡)':   resumenPorTasa[tasa] ? Number(resumenPorTasa[tasa].impuesto.toFixed(2))  : '',
      'IVA Devuelto':   '-',
      'Total (₡)':      resumenPorTasa[tasa] ? Number(resumenPorTasa[tasa].total.toFixed(2))     : '',
    }))
    // Filas extra de totales del resumen
    filasResumen.push({
      'Tarifa IVA':   'Totales',
      'SubTotal (₡)': Number(totales.subtotal.toFixed(2)),
      'Impuesto (₡)': Number(totales.impuesto.toFixed(2)),
      'IVA Devuelto': '-',
      'Total (₡)':    Number(totales.total.toFixed(2)),
    })

    const wsDetalle  = XLSX.utils.json_to_sheet(filas)
    const wsResumen  = XLSX.utils.json_to_sheet(filasResumen)
    const wb         = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Comprobantes')
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen por tasa IVA')

    const label = entidad === 'empresa' ? 'Empresa' : 'Ferreteria'
    const desde = fechaDesde || 'inicio'
    const hasta = fechaHasta || 'hoy'
    XLSX.writeFile(wb, `reporte_${label}_${desde}_${hasta}.xlsx`)
  }

  return (
    <div className="space-y-6">

      {/* Filtros */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={e => setFechaDesde(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={e => setFechaHasta(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {(fechaDesde || fechaHasta) && (
          <button
            onClick={() => { setFechaDesde(''); setFechaHasta('') }}
            className="text-sm text-gray-500 hover:text-gray-800 underline self-end pb-2"
          >
            Limpiar fechas
          </button>
        )}
        <div className="ml-auto self-end">
          <button
            onClick={exportarExcel}
            disabled={!comprobantes.length}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Cuadros de totales */}
      {!isLoading && comprobantes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Subtotal', valor: totales.subtotal,   color: 'blue'   },
            { label: 'Descuentos', valor: totales.descuentos, color: 'gray' },
            { label: 'IVA total', valor: totales.impuesto,  color: 'orange' },
            { label: 'Total',     valor: totales.total,     color: 'green'  },
          ].map(({ label, valor, color }) => (
            <div key={label} className={`border border-${color}-200 bg-${color}-50 rounded-xl px-4 py-3`}>
              <p className={`text-${color}-600 font-medium text-xs uppercase tracking-wide mb-0.5`}>{label}</p>
              <p className={`text-${color}-800 font-semibold text-sm`}>₡{fmt(valor)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Resumen por tasa IVA */}
      {!isLoading && comprobantes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-700">Resumen por tasa de IVA</p>
          </div>
          <table className="w-full text-sm">
            <thead className="text-gray-500 uppercase text-xs bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Tarifa IVA</th>
                <th className="px-4 py-2 text-right">SubTotal ₡</th>
                <th className="px-4 py-2 text-right">Impuesto ₡</th>
                <th className="px-4 py-2 text-right">Total ₡</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {TASAS_ORDEN.filter(t => resumenPorTasa[t]).map(tasa => (
                <tr key={tasa} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 font-medium">{tasa}</td>
                  <td className="px-4 py-2 text-right text-gray-600">₡{fmt(resumenPorTasa[tasa].subtotal)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">₡{fmt(resumenPorTasa[tasa].impuesto)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-800">₡{fmt(resumenPorTasa[tasa].total)}</td>
                </tr>
              ))}
              {/* Totales */}
              <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                <td className="px-4 py-2 text-gray-800">Totales</td>
                <td className="px-4 py-2 text-right text-gray-800">₡{fmt(totales.subtotal)}</td>
                <td className="px-4 py-2 text-right text-gray-800">₡{fmt(totales.impuesto)}</td>
                <td className="px-4 py-2 text-right text-gray-800">₡{fmt(totales.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla detalle de comprobantes */}
      {isLoading ? (
        <p className="text-gray-500 text-sm">Cargando comprobantes...</p>
      ) : comprobantes.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">No hay comprobantes cargados{(fechaDesde || fechaHasta) ? ' para ese rango de fechas' : ''}.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              {comprobantes.length} comprobante{comprobantes.length > 1 ? 's' : ''}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-3 py-3 text-left">Consecutivo</th>
                <th className="px-3 py-3 text-left">Emisor</th>
                <th className="px-3 py-3 text-left">Cédula</th>
                <th className="px-3 py-3 text-left">Fecha</th>
                <th className="px-3 py-3 text-left">Moneda</th>
                <th className="px-3 py-3 text-right">Subtotal ₡</th>
                <th className="px-3 py-3 text-right">Desc. ₡</th>
                <th className="px-3 py-3 text-right">IVA ₡</th>
                <th className="px-3 py-3 text-left">Tasa(s) IVA</th>
                <th className="px-3 py-3 text-right">Total ₡</th>
                <th className="px-3 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comprobantes.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-500 text-xs font-mono">{c.numero_consecutivo}</td>
                  <td className="px-3 py-2 text-gray-800 font-medium">{c.emisor_nombre}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{c.emisor_cedula}</td>
                  <td className="px-3 py-2 text-gray-600">{c.fecha_emision.split('-').reverse().join('-')}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.moneda_original === 'USD' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {c.moneda_original}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">₡{fmt(c.subtotal_crc)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">₡{fmt(c.descuentos_crc)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">₡{fmt(c.impuesto_crc)}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{c.tasas_iva}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">₡{fmt(c.total_crc)}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setConfirmEliminar(c)}
                      className="text-red-400 hover:text-red-600 text-xs font-medium"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal confirmar eliminar */}
      {confirmEliminar && (
        <Modal titulo="Eliminar comprobante" onClose={() => setConfirmEliminar(null)}>
          <p className="text-gray-700 text-sm mb-6">
            ¿Seguro que deseás eliminar el comprobante de{' '}
            <span className="font-semibold">{confirmEliminar.emisor_nombre}</span>{' '}
            del {formatFecha(confirmEliminar.fecha_emision)}? Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setConfirmEliminar(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button
              onClick={() => eliminar.mutate(confirmEliminar.id)}
              disabled={eliminar.isPending}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {eliminar.isPending ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </Modal>
      )}

      {toast && <Toast mensaje={toast.mensaje} tipo={toast.tipo} onClose={cerrarToast} />}
    </div>
  )
}