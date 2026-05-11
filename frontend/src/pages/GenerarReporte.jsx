import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getComprobantes, eliminarComprobante } from '../api/comprobantes'
import { formatFecha } from '../utils/fecha'
import * as XLSX from 'xlsx'
import Toast from '../components/Toast'
import Modal from '../components/Modal'

const fmt = (n) => Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2  = (n) => Math.round(Number(n) * 100) / 100

// Orden oficial de tasas para el resumen
const TASAS_ORDEN = [
  '13%', '8%', '4% Transitorio', '4%', '2%', '1%', '0.5%',
  '0%', '0% Exenta', '0% Transitorio', '0% Sin crédito', 'Otros cargos'
]

export default function GenerarReporte({ entidad }) {
  const queryClient = useQueryClient()
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [toast, setToast] = useState(null)
  const cerrarToast = useCallback(() => setToast(null), [])

  const { data: comprobantes = [], isLoading } = useQuery({
    queryKey: ['comprobantes', entidad, fechaDesde, fechaHasta],
    queryFn:  () => getComprobantes({
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

  // ── Totales generales ────────────────────────────────────────────────────
  const totales = comprobantes.reduce(
    (acc, c) => ({
      gravado:    acc.gravado    + r2(c.gravado_crc    ?? 0),
      exento:     acc.exento     + r2(c.exento_crc     ?? 0),
      exonerado:  acc.exonerado  + r2(c.exonerado_crc  ?? 0),
      no_sujeto:  acc.no_sujeto  + r2(c.no_sujeto_crc  ?? 0),
      descuentos: acc.descuentos + r2(c.descuentos_crc ?? 0),
      subtotal:   acc.subtotal   + r2(c.subtotal_crc),
      impuesto:   acc.impuesto   + r2(c.impuesto_crc),
      total:      acc.total      + r2(c.total_crc),
    }),
    { gravado: 0, exento: 0, exonerado: 0, no_sujeto: 0, descuentos: 0, subtotal: 0, impuesto: 0, total: 0 }
  )

  // ── Resumen por tasa IVA usando desglose_iva real ─────────────────────────
  const resumenPorTasa = {}

  const agregarATasa = (label, subtotal, impuesto) => {
    if (!resumenPorTasa[label]) resumenPorTasa[label] = { subtotal: 0, impuesto: 0, total: 0 }
    resumenPorTasa[label].subtotal  += r2(subtotal)
    resumenPorTasa[label].impuesto  += r2(impuesto)
    resumenPorTasa[label].total     += r2(subtotal) + r2(impuesto)
  }

  comprobantes.forEach(c => {
    const desglose = c.desglose_iva ?? []
    if (desglose.length > 0) {
      desglose.forEach(d => agregarATasa(d.label, d.subtotal_crc, d.impuesto_crc))
    } else {
      // Fallback para comprobantes sin desglose
      const tasas = c.tasas_iva.split(',').map(t => t.trim())
      const tasa  = tasas.length === 1 ? tasas[0] : 'Otros cargos'
      agregarATasa(tasa, c.subtotal_crc, c.impuesto_crc)
    }
  })

  // Tasas presentes ordenadas
  const tasasPresentes = [
    ...TASAS_ORDEN.filter(t => resumenPorTasa[t]),
    ...Object.keys(resumenPorTasa).filter(t => !TASAS_ORDEN.includes(t))
  ]

  // ── Texto de desglose IVA por comprobante para el Excel ─────────────────
  // Formato: "13%: ₡287,61  0%: ₡0,00"
  function desgloseIvaTexto(c) {
    const desglose = c.desglose_iva ?? []
    if (desglose.length === 0) return fmt(r2(c.impuesto_crc))
    return desglose
      .map(d => `${d.label}: ₡${fmt(r2(d.impuesto_crc))}`)
      .join('  ')
  }

  // ── Exportar Excel ────────────────────────────────────────────────────────
  function exportarExcel() {
    // Sheet 1: detalle
    const filas = comprobantes.map(c => ({
      'Tipo':              c.tipo_comprobante ?? 'Factura',
      'N° Consecutivo':    c.numero_consecutivo,
      'Fecha':             c.fecha_emision.split('-').reverse().join('-'),
      'Emisor':            c.emisor_nombre,
      'Moneda original':   c.moneda_original,
      'Tipo de cambio':    r2(c.tipo_cambio),
      'Gravado (₡)':       r2(c.gravado_crc   ?? 0),
      'Exento (₡)':        r2(c.exento_crc    ?? 0),
      'Exonerado (₡)':     r2(c.exonerado_crc ?? 0),
      'No sujeto (₡)':     r2(c.no_sujeto_crc ?? 0),
      'Descuentos (₡)':    r2(c.descuentos_crc),
      'Subtotal neto (₡)': r2(c.subtotal_crc),
      'IVA por tasa':      desgloseIvaTexto(c),   // ej: "13%: ₡287,61  0%: ₡0,00"
      'IVA total (₡)':     r2(c.impuesto_crc),
      'Total (₡)':         r2(c.total_crc),
    }))
    filas.push({})
    filas.push({
      'Tipo':              'TOTALES',
      'Gravado (₡)':       r2(totales.gravado),
      'Exento (₡)':        r2(totales.exento),
      'Exonerado (₡)':     r2(totales.exonerado),
      'No sujeto (₡)':     r2(totales.no_sujeto),
      'Descuentos (₡)':    r2(totales.descuentos),
      'Subtotal neto (₡)': r2(totales.subtotal),
      'IVA total (₡)':     r2(totales.impuesto),
      'Total (₡)':         r2(totales.total),
    })

    // Sheet 2: resumen por tasa IVA
    const filasResumen = tasasPresentes.map(tasa => ({
      'Tarifa IVA':        tasa,
      'SubTotal neto (₡)': r2(resumenPorTasa[tasa].subtotal),
      'Impuesto (₡)':      r2(resumenPorTasa[tasa].impuesto),
      'Total (₡)':         r2(resumenPorTasa[tasa].total),
    }))
    filasResumen.push({
      'Tarifa IVA':        'TOTALES',
      'SubTotal neto (₡)': r2(totales.subtotal),
      'Impuesto (₡)':      r2(totales.impuesto),
      'Total (₡)':         r2(totales.total),
    })

    const wsDetalle = XLSX.utils.json_to_sheet(filas)
    const wsResumen = XLSX.utils.json_to_sheet(filasResumen)
    const wb        = XLSX.utils.book_new()
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
            type="date" value={fechaDesde}
            onChange={e => setFechaDesde(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
          <input
            type="date" value={fechaHasta}
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

      {/* ── Resumen expandido igual que el Excel ─────────────────────────── */}
      {!isLoading && comprobantes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-700">Resumen del período</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 uppercase text-xs bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-right">Gravado ₡</th>
                  <th className="px-4 py-2 text-right">Exento ₡</th>
                  {totales.exonerado !== 0 && <th className="px-4 py-2 text-right">Exonerado ₡</th>}
                  {totales.no_sujeto !== 0  && <th className="px-4 py-2 text-right">No sujeto ₡</th>}
                  {totales.descuentos !== 0 && <th className="px-4 py-2 text-right">Descuentos ₡</th>}
                  <th className="px-4 py-2 text-right">Subtotal neto ₡</th>
                  <th className="px-4 py-2 text-right">IVA total ₡</th>
                  <th className="px-4 py-2 text-right font-bold">Total ₡</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100">
                  <td className={`px-4 py-3 text-right font-semibold ${totales.gravado < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    ₡{fmt(totales.gravado)}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${totales.exento < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    ₡{fmt(totales.exento)}
                  </td>
                  {totales.exonerado !== 0 && (
                    <td className={`px-4 py-3 text-right font-semibold ${totales.exonerado < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      ₡{fmt(totales.exonerado)}
                    </td>
                  )}
                  {totales.no_sujeto !== 0 && (
                    <td className={`px-4 py-3 text-right font-semibold ${totales.no_sujeto < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      ₡{fmt(totales.no_sujeto)}
                    </td>
                  )}
                  {totales.descuentos !== 0 && (
                    <td className={`px-4 py-3 text-right font-semibold ${totales.descuentos < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      ₡{fmt(totales.descuentos)}
                    </td>
                  )}
                  <td className={`px-4 py-3 text-right font-semibold ${totales.subtotal < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    ₡{fmt(totales.subtotal)}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${totales.impuesto < 0 ? 'text-red-600' : 'text-orange-700'}`}>
                    ₡{fmt(totales.impuesto)}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold text-base ${totales.total < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    ₡{fmt(totales.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Resumen por tasa IVA ─────────────────────────────────────────── */}
      {!isLoading && comprobantes.length > 0 && tasasPresentes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-700">Resumen por tasa de IVA</p>
          </div>
          <table className="w-full text-sm">
            <thead className="text-gray-500 uppercase text-xs bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Tarifa IVA</th>
                <th className="px-4 py-2 text-right">SubTotal neto ₡</th>
                <th className="px-4 py-2 text-right">Impuesto ₡</th>
                <th className="px-4 py-2 text-right">Total ₡</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasasPresentes.map(tasa => (
                <tr key={tasa} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 font-medium">{tasa}</td>
                  <td className={`px-4 py-2 text-right ${resumenPorTasa[tasa].subtotal < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    ₡{fmt(resumenPorTasa[tasa].subtotal)}
                  </td>
                  <td className={`px-4 py-2 text-right ${resumenPorTasa[tasa].impuesto < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    ₡{fmt(resumenPorTasa[tasa].impuesto)}
                  </td>
                  <td className={`px-4 py-2 text-right font-semibold ${resumenPorTasa[tasa].total < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    ₡{fmt(resumenPorTasa[tasa].total)}
                  </td>
                </tr>
              ))}
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

      {/* ── Tabla detalle de comprobantes ────────────────────────────────── */}
      {isLoading ? (
        <p className="text-gray-500 text-sm">Cargando comprobantes...</p>
      ) : comprobantes.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">
          No hay comprobantes cargados{(fechaDesde || fechaHasta) ? ' para ese rango de fechas' : ''}.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-700">
              {comprobantes.length} comprobante{comprobantes.length > 1 ? 's' : ''}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-3 py-3 text-left">Consecutivo</th>
                <th className="px-3 py-3 text-left">Tipo</th>
                <th className="px-3 py-3 text-left">Emisor</th>
                <th className="px-3 py-3 text-left">Fecha</th>
                <th className="px-3 py-3 text-left">Moneda</th>
                <th className="px-3 py-3 text-right">Subtotal ₡</th>
                <th className="px-3 py-3 text-right">Desc. ₡</th>
                <th className="px-3 py-3 text-right">IVA ₡</th>
                <th className="px-3 py-3 text-right">Total ₡</th>
                <th className="px-3 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comprobantes.map(c => {
                const desglose = c.desglose_iva ?? []
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500 text-xs font-mono">{c.numero_consecutivo}</td>
                    <td className="px-3 py-2">
                      {c.tipo_comprobante === 'Nota de Crédito'
                        ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">NC</span>
                        : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">FE</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-gray-800 font-medium">{c.emisor_nombre}</td>
                    <td className="px-3 py-2 text-gray-600">{c.fecha_emision.split('-').reverse().join('-')}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.moneda_original === 'USD' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {c.moneda_original}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right ${r2(c.subtotal_crc) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      ₡{fmt(r2(c.subtotal_crc))}
                    </td>
                    <td className={`px-3 py-2 text-right ${r2(c.descuentos_crc) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {r2(c.descuentos_crc) !== 0 ? `₡${fmt(c.descuentos_crc)}` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs ${r2(c.impuesto_crc) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {desglose.length > 1
                        ? desglose.map((d, i) => (
                            <span key={i} className="block whitespace-nowrap">
                              {d.label}: ₡{fmt(r2(d.impuesto_crc))}
                            </span>
                          ))
                        : `₡${fmt(r2(c.impuesto_crc))}`
                      }
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${r2(c.total_crc) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      ₡{fmt(r2(c.total_crc))}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => setConfirmEliminar(c)}
                        className="text-red-400 hover:text-red-600 text-xs font-medium"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                )
              })}
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