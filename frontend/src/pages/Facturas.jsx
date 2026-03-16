import { formatFecha } from '../utils/fecha'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFacturas, crearFactura } from '../api/facturas'
import { getProveedores } from '../api/proveedores'
import { registrarPago, getPagosPorFactura } from '../api/pagos'
import EstadoBadge from '../components/EstadoBadge'

const formFacturaVacio = {
  proveedor_id: '', numero_factura: '', fecha_factura: '', monto_original: ''
}

const formPagoVacio = {
  fecha_pago: '', monto_pagado: '', numero_comprobante: '', notas: ''
}

export default function Facturas() {
  const queryClient = useQueryClient()
  const [mostrarFormFactura, setMostrarFormFactura] = useState(false)
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [mostrarPagos, setMostrarPagos] = useState(false)
  const [formFactura, setFormFactura] = useState(formFacturaVacio)
  const [formPago, setFormPago] = useState(formPagoVacio)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [error, setError] = useState('')

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ['facturas', filtroEstado, filtroProveedor],
    queryFn: () => getFacturas({
      ...(filtroEstado && { estado: filtroEstado }),
      ...(filtroProveedor && { proveedor_id: filtroProveedor })
    }).then(r => r.data)
  })

  const { data: proveedores = [] } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => getProveedores().then(r => r.data)
  })

  const { data: pagosFactura = [] } = useQuery({
    queryKey: ['pagos', facturaSeleccionada?.id],
    queryFn: () => getPagosPorFactura(facturaSeleccionada.id).then(r => r.data),
    enabled: !!facturaSeleccionada && mostrarPagos
  })

  const crearFact = useMutation({
    mutationFn: crearFactura,
    onSuccess: () => {
      queryClient.invalidateQueries(['facturas'])
      queryClient.invalidateQueries(['dashboard'])
      setMostrarFormFactura(false)
      setFormFactura(formFacturaVacio)
      setError('')
    },
    onError: (e) => setError(e.response?.data?.detail ?? 'Error al crear la factura.')
  })

  const registrarPagoMutation = useMutation({
    mutationFn: registrarPago,
    onSuccess: () => {
      queryClient.invalidateQueries(['facturas'])
      queryClient.invalidateQueries(['dashboard'])
      queryClient.invalidateQueries(['pagos', facturaSeleccionada?.id])
      setFormPago(formPagoVacio)
      setError('')
    },
    onError: (e) => setError(e.response?.data?.detail ?? 'Error al registrar el pago.')
  })

  function handleSubmitFactura(e) {
    e.preventDefault()
    if (!formFactura.proveedor_id) return setError('Selecciona un proveedor.')
    if (!formFactura.numero_factura.trim()) return setError('El número de factura es obligatorio.')
    if (!formFactura.fecha_factura) return setError('La fecha es obligatoria.')
    if (!formFactura.monto_original || Number(formFactura.monto_original) <= 0)
      return setError('El monto debe ser mayor a 0.')
    setError('')
    crearFact.mutate({
      ...formFactura,
      monto_original: Number(formFactura.monto_original)
    })
  }

  function handleSubmitPago(e) {
    e.preventDefault()
    if (!formPago.fecha_pago) return setError('La fecha de pago es obligatoria.')
    if (!formPago.monto_pagado || Number(formPago.monto_pagado) <= 0)
      return setError('El monto debe ser mayor a 0.')
    setError('')
    registrarPagoMutation.mutate({
      factura_id: facturaSeleccionada.id,
      fecha_pago: formPago.fecha_pago,
      monto_pagado: Number(formPago.monto_pagado),
      numero_comprobante: formPago.numero_comprobante,
      notas: formPago.notas
    })
  }

  function abrirPagos(factura) {
    setFacturaSeleccionada(factura)
    setMostrarPagos(true)
    setError('')
    setFormPago(formPagoVacio)
  }

  const proveedorSeleccionado = proveedores.find(p => p.id === formFactura.proveedor_id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Facturas</h1>
        <button
          onClick={() => { setMostrarFormFactura(true); setError('') }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Nueva factura
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-4">
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="parcial">Parcial</option>
          <option value="pagada">Pagada</option>
          <option value="vencida">Vencida</option>
        </select>

        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filtroProveedor}
          onChange={e => setFiltroProveedor(e.target.value)}
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>

        {(filtroEstado || filtroProveedor) && (
          <button
            onClick={() => { setFiltroEstado(''); setFiltroProveedor('') }}
            className="text-sm text-gray-500 hover:text-gray-800 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Formulario nueva factura */}
      {mostrarFormFactura && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-800">Nueva factura</h2>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <form onSubmit={handleSubmitFactura} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formFactura.proveedor_id}
                onChange={e => setFormFactura({ ...formFactura, proveedor_id: e.target.value })}
              >
                <option value="">Selecciona un proveedor</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.moneda} — {p.plazo_dias === 0 ? 'inmediato' : `${p.plazo_dias} días`})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° de factura *</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formFactura.numero_factura}
                onChange={e => setFormFactura({ ...formFactura, numero_factura: e.target.value })}
                placeholder="FAC-2026-001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de factura *</label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formFactura.fecha_factura}
                onChange={e => setFormFactura({ ...formFactura, fecha_factura: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monto ({proveedorSeleccionado?.moneda ?? '—'}) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formFactura.monto_original}
                onChange={e => setFormFactura({ ...formFactura, monto_original: e.target.value })}
                placeholder="0.00"
              />
            </div>

            {proveedorSeleccionado && (
              <div className="flex items-end pb-2">
                <p className="text-sm text-gray-500">
                  Vencimiento: <span className="font-medium text-gray-700">
                    {formFactura.fecha_factura
                      ? new Date(new Date(formFactura.fecha_factura).getTime() + (proveedorSeleccionado.plazo_dias + 1) * 86400000)
                          .toLocaleDateString('es-CR')
                      : '—'}
                  </span>
                </p>
              </div>
            )}

            <div className="col-span-2 flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => { setMostrarFormFactura(false); setFormFactura(formFacturaVacio); setError('') }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={crearFact.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {crearFact.isPending ? 'Guardando...' : 'Guardar factura'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal pagos */}
      {mostrarPagos && facturaSeleccionada && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-gray-800">
                Pagos — {facturaSeleccionada.numero_factura}
              </h2>
              <p className="text-sm text-gray-500">
                Saldo pendiente: <span className="font-semibold text-gray-800">
                  {facturaSeleccionada.proveedor.moneda === 'USD' ? '$' : '₡'}
                  {Number(facturaSeleccionada.saldo_pendiente).toLocaleString('es-CR')}
                </span>
              </p>
            </div>
            <button onClick={() => { setMostrarPagos(false); setError('') }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          {facturaSeleccionada.estado !== 'pagada' && (
            <form onSubmit={handleSubmitPago} className="grid grid-cols-2 gap-4 border-t pt-4">
              <h3 className="col-span-2 text-sm font-medium text-gray-700">Registrar pago</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de pago *</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formPago.fecha_pago}
                  onChange={e => setFormPago({ ...formPago, fecha_pago: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto pagado *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formPago.monto_pagado}
                  onChange={e => setFormPago({ ...formPago, monto_pagado: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° comprobante</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formPago.numero_comprobante}
                  onChange={e => setFormPago({ ...formPago, numero_comprobante: e.target.value })}
                  placeholder="TRF-20260316-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formPago.notas}
                  onChange={e => setFormPago({ ...formPago, notas: e.target.value })}
                  placeholder="Opcional"
                />
              </div>

              <div className="col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={registrarPagoMutation.isPending}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {registrarPagoMutation.isPending ? 'Registrando...' : 'Registrar pago'}
                </button>
              </div>
            </form>
          )}

          {pagosFactura.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Historial de pagos</h3>
              <table className="w-full text-sm">
                <thead className="text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="py-2 text-left">Fecha</th>
                    <th className="py-2 text-left">Comprobante</th>
                    <th className="py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagosFactura.map(p => (
                    <tr key={p.id}>
                      <td className="py-2 text-gray-600">{formatFecha(p.fecha_pago)}</td>
                      <td className="py-2 text-gray-600">{p.numero_comprobante ?? '—'}</td>
                      <td className="py-2 text-right font-medium text-gray-800">
                        {facturaSeleccionada.proveedor.moneda === 'USD' ? '$' : '₡'}
                        {Number(p.monto_pagado).toLocaleString('es-CR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tabla de facturas */}
      {isLoading ? (
        <p className="text-gray-500 text-sm">Cargando facturas...</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Proveedor</th>
                <th className="px-4 py-3 text-left">N° Factura</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Vencimiento</th>
                <th className="px-4 py-3 text-right">Monto original</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {facturas.map(f => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{f.proveedor.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{f.numero_factura}</td>
                  <td className="px-4 py-3 text-gray-600">{formatFecha(f.fecha_factura)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatFecha(f.fecha_vencimiento)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {f.proveedor.moneda === 'USD' ? '$' : '₡'}
                    {Number(f.monto_original).toLocaleString('es-CR')}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">
                    {f.proveedor.moneda === 'USD' ? '$' : '₡'}
                    {Number(f.saldo_pendiente).toLocaleString('es-CR')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <EstadoBadge estado={f.estado} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => abrirPagos(f)}
                      className="text-green-600 hover:text-green-800 text-xs font-medium"
                    >
                      Pagos
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {facturas.length === 0 && (
            <p className="text-center text-gray-400 py-8 text-sm">No hay facturas con ese filtro.</p>
          )}
        </div>
      )}
    </div>
  )
}