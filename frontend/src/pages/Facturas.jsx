import { formatFecha } from '../utils/fecha'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFacturas, crearFactura, eliminarFactura, actualizarFactura } from '../api/facturas'
import { getProveedores } from '../api/proveedores'
import { registrarPago, getPagosPorFactura, actualizarPago } from '../api/pagos'
import EstadoBadge from '../components/EstadoBadge'
import Modal from '../components/Modal'
import Toast from '../components/Toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const formFacturaVacio = {
  proveedor_id: '', numero_factura: '', fecha_factura: '', monto_original: ''
}

const formPagoVacio = {
  fecha_pago: '', monto_pagado: '', numero_comprobante: '', notas: ''
}

// ── Cambio 2: símbolo seguro para jsPDF (no soporta ₡) ──────────────────────
function simboloPDF(moneda) {
  return moneda === 'USD' ? '$' : 'CRC'
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
  const [toast, setToast] = useState(null)
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [editandoFactura, setEditandoFactura] = useState(null)
  const [formEditar, setFormEditar] = useState(formFacturaVacio)
  const [editandoPagoId, setEditandoPagoId] = useState(null)
  const [formEditarPago, setFormEditarPago] = useState(formPagoVacio)
  const cerrarToast = useCallback(() => setToast(null), [])
  const location = useLocation()
  const yaAbrio = useRef(false)

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

  // ── Totales calculados desde las facturas visibles ───────────────────────
  const totales = facturas.reduce(
    (acc, f) => {
      const moneda = f.proveedor.moneda === 'USD' ? 'USD' : 'CRC'
      const saldo = Number(f.saldo_pendiente)
      if (f.estado === 'vencida') {
        acc.vencido[moneda]   = (acc.vencido[moneda]   || 0) + saldo
        acc.pendiente[moneda] = (acc.pendiente[moneda] || 0) + saldo
      } else if (f.estado === 'pendiente') {
        acc.pendiente[moneda] = (acc.pendiente[moneda] || 0) + saldo
      }
      return acc
    },
    { pendiente: {}, vencido: {} }
  )

  function formatTotales(totalesPorMoneda) {
    const partes = []
    if (totalesPorMoneda.CRC) partes.push(`₡${totalesPorMoneda.CRC.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    if (totalesPorMoneda.USD) partes.push(`$${totalesPorMoneda.USD.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    return partes.length ? partes : ['0,00']
  }

  // ── Versión de formatTotales para PDF (sin ₡) ────────────────────────────
  function formatTotalesPDF(totalesPorMoneda) {
    const partes = []
    if (totalesPorMoneda.CRC) partes.push(`CRC ${totalesPorMoneda.CRC.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    if (totalesPorMoneda.USD) partes.push(`$${totalesPorMoneda.USD.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    return partes.length ? partes.join('  /  ') : '0,00'
  }

  const crearFact = useMutation({
    mutationFn: crearFactura,
    onSuccess: () => {
      queryClient.invalidateQueries(['facturas'])
      queryClient.invalidateQueries(['dashboard'])
      setMostrarFormFactura(false)
      setFormFactura(formFacturaVacio)
      setError('')
      setToast({ mensaje: 'Factura creada correctamente.', tipo: 'exito' })
    },
    onError: (e) => setError(e.response?.data?.detail ?? 'Error al crear la factura.')
  })

  const eliminar = useMutation({
    mutationFn: eliminarFactura,
    onSuccess: () => {
      queryClient.invalidateQueries(['facturas'])
      queryClient.invalidateQueries(['dashboard'])
      setConfirmEliminar(null)
      setToast({ mensaje: 'Factura eliminada.', tipo: 'exito' })
    },
    onError: () => setToast({ mensaje: 'Error al eliminar la factura.', tipo: 'error' })
  })

  const actualizarFact = useMutation({
    mutationFn: ({ id, datos }) => actualizarFactura(id, datos),
    onSuccess: () => {
      queryClient.invalidateQueries(['facturas'])
      queryClient.invalidateQueries(['dashboard'])
      setEditandoFactura(null)
      setFormEditar(formFacturaVacio)
      setError('')
      setToast({ mensaje: 'Factura actualizada correctamente.', tipo: 'exito' })
    },
    onError: (e) => setError(e.response?.data?.detail ?? 'Error al actualizar la factura.')
  })

  const registrarPagoMutation = useMutation({
    mutationFn: registrarPago,
    onSuccess: () => {
      queryClient.invalidateQueries(['facturas'])
      queryClient.invalidateQueries(['dashboard'])
      queryClient.invalidateQueries(['pagos', facturaSeleccionada?.id])
      setFormPago(formPagoVacio)
      setError('')
      setMostrarPagos(false)
      setToast({ mensaje: 'Pago registrado correctamente.', tipo: 'exito' })
    },
    onError: (e) => setError(e.response?.data?.detail ?? 'Error al registrar el pago.')
  })

  const actualizarPagoMutation = useMutation({
    mutationFn: ({ id, datos }) => actualizarPago(id, datos),
    onSuccess: () => {
      queryClient.invalidateQueries(['facturas'])
      queryClient.invalidateQueries(['dashboard'])
      queryClient.invalidateQueries(['pagos', facturaSeleccionada?.id])
      setEditandoPagoId(null)
      setFormEditarPago(formPagoVacio)
      setError('')
      setToast({ mensaje: 'Pago actualizado correctamente.', tipo: 'exito' })
    },
    onError: (e) => setError(e.response?.data?.detail ?? 'Error al actualizar el pago.')
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
      factura_id:         facturaSeleccionada.id,
      fecha_pago:         formPago.fecha_pago,
      monto_pagado:       Number(formPago.monto_pagado),
      numero_comprobante: formPago.numero_comprobante,
      notas:              formPago.notas
    })
  }

  function handleSubmitEditar(e) {
    e.preventDefault()
    if (!formEditar.proveedor_id) return setError('Selecciona un proveedor.')
    if (!formEditar.numero_factura.trim()) return setError('El número de factura es obligatorio.')
    if (!formEditar.fecha_factura) return setError('La fecha es obligatoria.')
    if (!formEditar.monto_original || Number(formEditar.monto_original) <= 0)
      return setError('El monto debe ser mayor a 0.')
    setError('')
    actualizarFact.mutate({
      id:   editandoFactura.id,
      datos: { ...formEditar, monto_original: Number(formEditar.monto_original) }
    })
  }

  function abrirPagos(factura) {
    setFacturaSeleccionada(factura)
    setMostrarPagos(true)
    setError('')
    setFormPago(formPagoVacio)
    setEditandoPagoId(null)
  }

  function abrirEditarPago(p) {
    setEditandoPagoId(p.id)
    setFormEditarPago({
      fecha_pago:         p.fecha_pago,
      monto_pagado:       p.monto_pagado,
      numero_comprobante: p.numero_comprobante ?? '',
      notas:              p.notas ?? ''
    })
    setError('')
  }

  function cancelarEditarPago() {
    setEditandoPagoId(null)
    setFormEditarPago(formPagoVacio)
    setError('')
  }

  function guardarEdicionPago(e) {
    e.preventDefault()
    if (!formEditarPago.fecha_pago) return setError('La fecha de pago es obligatoria.')
    if (!formEditarPago.monto_pagado || Number(formEditarPago.monto_pagado) <= 0)
      return setError('El monto debe ser mayor a 0.')
    setError('')
    actualizarPagoMutation.mutate({
      id: editandoPagoId,
      datos: {
        fecha_pago:         formEditarPago.fecha_pago,
        monto_pagado:       Number(formEditarPago.monto_pagado),
        numero_comprobante: formEditarPago.numero_comprobante,
        notas:              formEditarPago.notas
      }
    })
  }

  function abrirEditar(f) {
    setFormEditar({
      proveedor_id:   f.proveedor_id,
      numero_factura: f.numero_factura,
      fecha_factura:  f.fecha_factura,
      monto_original: f.monto_original
    })
    setEditandoFactura(f)
    setError('')
  }

  const proveedorSeleccionado = proveedores.find(p => p.id === formFactura.proveedor_id)

  useEffect(() => {
    if (yaAbrio.current) return
    if (location.state?.abrirPago && facturas.length > 0) {
      const factura = facturas.find(f => f.id === location.state.abrirPago)
      if (factura) {
        yaAbrio.current = true
        setTimeout(() => abrirPagos(factura), 0)
      }
    }
  }, [location.state, facturas])

  // PDF con "CRC" en vez de "₡"
  function exportarPDF() {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Cuentas por Pagar - Facturas', 14, 15)
    doc.setFontSize(10)
    doc.text(`Generado: ${new Date().toLocaleDateString('es-CR')}`, 14, 22)

    const partesFiltro = []
    if (filtroEstado === 'por_pagar') partesFiltro.push('Estado: Por pagar (pendiente + vencida)')
    else if (filtroEstado) partesFiltro.push(`Estado: ${filtroEstado}`)
    if (filtroProveedor) {
      const prov = proveedores.find(p => p.id === filtroProveedor)
      if (prov) partesFiltro.push(`Proveedor: ${prov.nombre}`)
    }
    const startY = 28

    autoTable(doc, {
      startY,
      head: [['Proveedor', 'N° Factura', 'Fecha', 'Vencimiento', 'Monto', 'Saldo', 'Estado']],
      body: facturas.map(f => {
        // ── Cambio 2: usar simboloPDF para evitar el caracter roto ──
        const sim = simboloPDF(f.proveedor.moneda)
        return [
          f.proveedor.nombre,
          f.numero_factura,
          formatFecha(f.fecha_factura),
          formatFecha(f.fecha_vencimiento),
          `${sim} ${Number(f.monto_original).toLocaleString('es-CR')}`,
          `${sim} ${Number(f.saldo_pendiente).toLocaleString('es-CR')}`,
          f.estado
        ]
      }),
      styles:     { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] }
    })

    const finalY = doc.lastAutoTable.finalY + 8
    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.text('Resumen de totales:', 14, finalY)
    doc.setFont(undefined, 'normal')

    const lineaBase = finalY + 6
    doc.text(`Total pendiente: ${formatTotalesPDF(totales.pendiente)}`, 14, lineaBase)
    doc.text(`Total vencido:   ${formatTotalesPDF(totales.vencido)}`,   14, lineaBase + 6)

    doc.save('facturas.pdf')
  }

  function exportarExcel() {
    const filas = facturas.map(f => ({
      Proveedor:         f.proveedor.nombre,
      Moneda:            f.proveedor.moneda,
      'N° Factura':      f.numero_factura,
      Fecha:             formatFecha(f.fecha_factura),
      Vencimiento:       formatFecha(f.fecha_vencimiento),
      'Monto original':  Number(f.monto_original),
      'Saldo pendiente': Number(f.saldo_pendiente),
      Estado:            f.estado
    }))

    filas.push({})
    const monedasUsadas = [...new Set(facturas.map(f => f.proveedor.moneda))]
    monedasUsadas.forEach(moneda => {
      const simbolo = moneda === 'USD' ? '$' : '₡'
      const pendM = totales.pendiente[moneda] || 0
      const vencM = totales.vencido[moneda]   || 0
      filas.push({
        Proveedor:         `TOTAL ${moneda}`,
        Moneda:            moneda,
        'N° Factura':      '',
        Fecha:             '',
        Vencimiento:       '',
        'Monto original':  '',
        'Saldo pendiente': `${simbolo}${pendM.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pendiente  |  ${simbolo}${vencM.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} vencido`,
        Estado:            ''
      })
    })

    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Facturas')
    XLSX.writeFile(wb, 'facturas.xlsx')
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Facturas</h1>
        <div className="flex gap-3">
          <button
            onClick={exportarExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Exportar Excel
          </button>
          <button
            onClick={exportarPDF}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Exportar PDF
          </button>
          <button
            onClick={() => { setMostrarFormFactura(true); setError('') }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Nueva factura
          </button>
        </div>
      </div>

      {/* Filtros + Tabla resumen */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* ── Cambio 3: opción "Por pagar" en el selector de estado ── */}
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="por_pagar">Por pagar (pendiente + vencida)</option>
          <option value="pendiente">Pendiente</option>
          <option value="vencida">Vencida</option>
          <option value="pagada">Pagada</option>
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

        {/* Tabla resumen de totales */}
        {!isLoading && (
          <div className="ml-auto flex gap-3">
            <div className="border border-orange-200 bg-orange-50 rounded-lg px-4 py-2 text-sm min-w-[170px]">
              <p className="text-orange-600 font-medium text-xs uppercase tracking-wide mb-0.5">Total pendiente</p>
              {formatTotales(totales.pendiente).map((t, i) => (
                <p key={i} className="text-orange-800 font-semibold">{t}</p>
              ))}
            </div>
            <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-2 text-sm min-w-[170px]">
              <p className="text-red-600 font-medium text-xs uppercase tracking-wide mb-0.5">Total vencido</p>
              {formatTotales(totales.vencido).map((t, i) => (
                <p key={i} className="text-red-800 font-semibold">{t}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal nueva factura */}
      {mostrarFormFactura && (
        <Modal titulo="Nueva factura" onClose={() => { setMostrarFormFactura(false); setFormFactura(formFacturaVacio); setError('') }}>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
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
        </Modal>
      )}

      {/* Modal pagos */}
      {mostrarPagos && facturaSeleccionada && (
        <Modal titulo={`Pagos — ${facturaSeleccionada.numero_factura}`} onClose={() => { setMostrarPagos(false); setError(''); cancelarEditarPago() }}>
          <div className="mb-3">
            <p className="text-sm text-gray-500">
              Saldo pendiente: <span className="font-semibold text-gray-800">
                {facturaSeleccionada.proveedor.moneda === 'USD' ? '$' : '₡'}
                {Number(facturaSeleccionada.saldo_pendiente).toLocaleString('es-CR')}
              </span>
            </p>
          </div>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

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
                    <th className="py-2 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagosFactura.map(p => (
                    editandoPagoId === p.id ? (
                      <tr key={p.id} className="bg-blue-50">
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formEditarPago.fecha_pago}
                            onChange={e => setFormEditarPago({ ...formEditarPago, fecha_pago: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formEditarPago.numero_comprobante}
                            onChange={e => setFormEditarPago({ ...formEditarPago, numero_comprobante: e.target.value })}
                            placeholder="N° comprobante"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formEditarPago.monto_pagado}
                            onChange={e => setFormEditarPago({ ...formEditarPago, monto_pagado: e.target.value })}
                          />
                        </td>
                        <td className="py-2 text-center whitespace-nowrap">
                          <button
                            onClick={guardarEdicionPago}
                            disabled={actualizarPagoMutation.isPending}
                            className="text-green-600 hover:text-green-800 text-xs font-medium mr-2 disabled:opacity-50"
                          >
                            {actualizarPagoMutation.isPending ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button onClick={cancelarEditarPago} className="text-gray-500 hover:text-gray-700 text-xs font-medium">
                            Cancelar
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id}>
                        <td className="py-2 text-gray-600">{formatFecha(p.fecha_pago)}</td>
                        <td className="py-2 text-gray-600">{p.numero_comprobante ?? '—'}</td>
                        <td className="py-2 text-right font-medium text-gray-800">
                          {facturaSeleccionada.proveedor.moneda === 'USD' ? '$' : '₡'}
                          {Number(p.monto_pagado).toLocaleString('es-CR')}
                        </td>
                        <td className="py-2 text-center">
                          <button onClick={() => abrirEditarPago(p)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                            Editar
                          </button>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {/* Modal editar factura */}
      {editandoFactura && (
        <Modal titulo="Editar factura" onClose={() => { setEditandoFactura(null); setError('') }}>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <form onSubmit={handleSubmitEditar} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formEditar.proveedor_id}
                onChange={e => setFormEditar({ ...formEditar, proveedor_id: e.target.value })}
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
                value={formEditar.numero_factura}
                onChange={e => setFormEditar({ ...formEditar, numero_factura: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de factura *</label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formEditar.fecha_factura}
                onChange={e => setFormEditar({ ...formEditar, fecha_factura: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formEditar.monto_original}
                onChange={e => setFormEditar({ ...formEditar, monto_original: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => { setEditandoFactura(null); setError('') }} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button type="submit" disabled={actualizarFact.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {actualizarFact.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal confirmar eliminar */}
      {confirmEliminar && (
        <Modal titulo="Eliminar factura" onClose={() => setConfirmEliminar(null)}>
          <p className="text-gray-700 text-sm mb-6">
            ¿Seguro que deseas eliminar la factura <span className="font-semibold">{confirmEliminar.numero_factura}</span>? Esta acción no se puede deshacer.
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

      {/* Tabla */}
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
                    <div className="flex gap-3 justify-center">
                      <button onClick={() => abrirPagos(f)} className="text-green-600 hover:text-green-800 text-xs font-medium">
                        Pagos
                      </button>
                      <button onClick={() => abrirEditar(f)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                        Editar
                      </button>
                      <button onClick={() => setConfirmEliminar(f)} className="text-red-500 hover:text-red-700 text-xs font-medium">
                        Eliminar
                      </button>
                    </div>
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