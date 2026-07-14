import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { crearComprobante } from '../api/comprobantes'
import Toast from '../components/Toast'

// ── Códigos oficiales de CodigoTarifaIVA según XSD Hacienda v4.4 ───────────
const TASA_LABEL = {
  '01': '0%',               // Tarifa 0% (Artículo 32, num 1, RLIVA)
  '02': '1%',               // Tarifa reducida 1%
  '03': '2%',               // Tarifa reducida 2%
  '04': '4%',               // Tarifa reducida 4%
  '05': '0% Transitorio',   // Transitorio 0%
  '06': '4% Transitorio',   // Transitorio 4%
  '07': '8%',               // Tarifa transitoria 8%
  '08': '13%',              // Tarifa general 13%
  '09': '0.5%',             // Tarifa reducida 0.5%
  '10': '0% Exenta',        // Tarifa Exenta (canasta básica, medicamentos)
  '11': '0% Sin crédito',   // Tarifa 0% sin derecho a crédito
}

// ── Tipos de documento soportados ──────────────────────────────────────────
const TIPOS_DOCUMENTO = {
  FacturaElectronica:     { tipo: 'Factura',         factor:  1 },
  NotaCreditoElectronica: { tipo: 'Nota de Crédito', factor: -1 },
}

function getText(el, tag) {
  const found = el.getElementsByTagNameNS('*', tag)[0]
  return found ? found.textContent.trim() : ''
}

function getAll(el, tag) {
  return Array.from(el.getElementsByTagNameNS('*', tag))
}

function num(str) {
  const v = parseFloat(str || '0')
  return isNaN(v) ? 0 : v
}

function parsearXML(texto, nombreArchivo) {
  const parser = new DOMParser()
  const doc    = parser.parseFromString(texto, 'application/xml')

  const raiz = doc.documentElement.localName

  if (raiz === 'MensajeHacienda') {
    return { tipo: 'mensaje', archivo: nombreArchivo }
  }
  if (!TIPOS_DOCUMENTO[raiz]) {
    return { tipo: 'desconocido', archivo: nombreArchivo }
  }

  const { tipo: tipoComprobante, factor } = TIPOS_DOCUMENTO[raiz]

  // ── Datos de identificación ─────────────────────────────────────────────
  const clave             = getText(doc, 'Clave')
  const numeroConsecutivo = getText(doc, 'NumeroConsecutivo')
  const fechaEmision      = getText(doc, 'FechaEmision').substring(0, 10)
  const emisorEl          = doc.getElementsByTagNameNS('*', 'Emisor')[0]
  const emisorNombre      = emisorEl ? getText(emisorEl, 'Nombre') : ''
  const emisorCedula      = emisorEl
    ? emisorEl.getElementsByTagNameNS('*', 'Numero')[0]?.textContent.trim() ?? ''
    : ''

  // ── Moneda y tipo de cambio ─────────────────────────────────────────────
  const monedaOriginal = getText(doc, 'CodigoMoneda') || 'CRC'
  const tipoCambio     = num(getText(doc, 'TipoCambio')) || 1
  const tc             = monedaOriginal === 'USD' ? tipoCambio : 1

  // ── ResumenFactura ──────────────────────────────────────────────────────
  const resumen = doc.getElementsByTagNameNS('*', 'ResumenFactura')[0]
  const getR    = (tag) => resumen ? getText(resumen, tag) : '0'

  const gravadoOrig    = num(getR('TotalGravado'))
  const exentoOrig     = num(getR('TotalExento'))
  const exoneradoOrig  = num(getR('TotalExonerado'))
  const noSujetoOrig   = num(getR('TotalNoSujeto'))
  const descuentosOrig = num(getR('TotalDescuentos'))
  const ventaNetaOrig  = num(getR('TotalVentaNeta'))
  const impuestoOrig   = num(getR('TotalImpuesto'))
  const totalOrig      = num(getR('TotalComprobante'))

  // Convertir a CRC con 2 decimales y aplicar factor
  const r2 = (v) => Math.round(v * 100) / 100
  const gravadoCRC    = r2(gravadoOrig    * tc * factor)
  const exentoCRC     = r2(exentoOrig     * tc * factor)
  const exoneradoCRC  = r2(exoneradoOrig  * tc * factor)
  const noSujetoCRC   = r2(noSujetoOrig   * tc * factor)
  const descuentosCRC = r2(descuentosOrig * tc * factor)
  const subtotalCRC   = r2(ventaNetaOrig  * tc * factor)
  const impuestoCRC   = r2(impuestoOrig   * tc * factor)
  const totalCRC      = r2(totalOrig      * tc * factor)

  // ── Desglose real por tasa IVA ──────────────────────────────────────────
  const subtotalPorTasa = {}
  getAll(doc, 'LineaDetalle').forEach(linea => {
    const codigoTarifa = linea.getElementsByTagNameNS('*', 'CodigoTarifaIVA')[0]?.textContent.trim()
    if (!codigoTarifa) return
    const montoLinea = num(getText(linea, 'SubTotal')) || num(getText(linea, 'MontoTotalLinea'))
    subtotalPorTasa[codigoTarifa] = (subtotalPorTasa[codigoTarifa] || 0) + montoLinea
  })

  const desgloseNodos = resumen
    ? getAll(resumen, 'TotalDesgloseImpuesto')
    : getAll(doc, 'TotalDesgloseImpuesto')

  const desgloseIva = desgloseNodos.map(nodo => {
    const codigoTarifa = nodo.getElementsByTagNameNS('*', 'CodigoTarifaIVA')[0]?.textContent.trim() ?? ''
    const impuestoNodo = num(getText(nodo, 'TotalMontoImpuesto'))
    const subtotalNodo = subtotalPorTasa[codigoTarifa] ?? 0
    return {
      tasa:         codigoTarifa,
      label:        TASA_LABEL[codigoTarifa] ?? codigoTarifa,
      subtotal_crc: r2(subtotalNodo * tc * factor),
      impuesto_crc: r2(impuestoNodo * tc * factor),
    }
  })

  // ── Etiquetas de tasas (texto resumen) ──────────────────────────────────
  const tasasSet = new Set()
  if (desgloseIva.length > 0) {
    desgloseIva.forEach(d => tasasSet.add(d.label))
  } else {
    getAll(doc, 'LineaDetalle').forEach(linea => {
      const ct = linea.getElementsByTagNameNS('*', 'CodigoTarifaIVA')[0]?.textContent.trim()
      if (ct) tasasSet.add(TASA_LABEL[ct] ?? ct)
    })
  }
  const tasasIVA = tasasSet.size ? [...tasasSet].join(', ') : '—'

  // ── Detalle sugerido: descripción de las líneas del XML ─────────────────
  // Ayuda al cliente a saber de qué es la factura para poder categorizarla
  // (ej: "comida", "gasolina"). Queda como punto de partida editable.
  const detalleItems = getAll(doc, 'LineaDetalle')
    .map(linea => getText(linea, 'Detalle'))
    .filter(Boolean)
  const detalleSugerido = detalleItems.length
    ? [...new Set(detalleItems)].slice(0, 3).join(' · ')
    : ''

  return {
    tipo:            'factura',
    archivo:         nombreArchivo,
    tipoComprobante,
    datos: {
      clave,
      numero_consecutivo: numeroConsecutivo,
      emisor_nombre:      emisorNombre,
      emisor_cedula:      emisorCedula,
      fecha_emision:      fechaEmision,
      moneda_original:    monedaOriginal,
      tipo_cambio:        tipoCambio,
      subtotal_crc:       subtotalCRC,
      descuentos_crc:     descuentosCRC,
      impuesto_crc:       impuestoCRC,
      total_crc:          totalCRC,
      gravado_crc:        gravadoCRC,
      exento_crc:         exentoCRC,
      exonerado_crc:      exoneradoCRC,
      no_sujeto_crc:      noSujetoCRC,
      tasas_iva:          tasasIVA,
      tipo_comprobante:   tipoComprobante,
      desglose_iva:       desgloseIva,
      xml_original:       texto,
      detalle:            detalleSugerido,
    }
  }
}

const fmt = (n) => Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CargarXML({ entidad }) {
  const queryClient      = useQueryClient()
  const inputRef         = useRef()
  const [preview, setPreview]     = useState([])
  const [omitidos, setOmitidos]   = useState([])
  const [toast, setToast]         = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function procesarArchivos(archivos) {
    const resultados = []
    const rechazados = []

    for (const archivo of archivos) {
      if (!archivo.name.toLowerCase().endsWith('.xml')) {
        rechazados.push({ archivo: archivo.name, motivo: 'No es un archivo XML.' })
        continue
      }
      const texto     = await archivo.text()
      const resultado = parsearXML(texto, archivo.name)

      if (resultado.tipo === 'mensaje') {
        rechazados.push({ archivo: archivo.name, motivo: 'Es un MensajeHacienda, no una factura. Subí el XML de la factura correspondiente.' })
      } else if (resultado.tipo === 'desconocido') {
        rechazados.push({ archivo: archivo.name, motivo: 'Formato de XML no reconocido.' })
      } else {
        resultados.push(resultado)
      }
    }

    setPreview(prev => {
      const claves = new Set(prev.map(r => r.datos.clave))
      const nuevos  = resultados.filter(r => !claves.has(r.datos.clave))
      return [...prev, ...nuevos]
    })
    setOmitidos(prev => [...prev, ...rechazados])
  }

  function onInputChange(e) {
    procesarArchivos(Array.from(e.target.files))
    e.target.value = ''
  }

  function onDrop(e) {
    e.preventDefault()
    procesarArchivos(Array.from(e.dataTransfer.files))
  }

  function quitarDePreview(clave) {
    setPreview(prev => prev.filter(r => r.datos.clave !== clave))
  }

  function actualizarDetallePreview(clave, detalle) {
    setPreview(prev => prev.map(r =>
      r.datos.clave === clave ? { ...r, datos: { ...r.datos, detalle } } : r
    ))
  }

  async function guardarTodos() {
    if (!preview.length) return
    setGuardando(true)
    let guardados  = 0
    let duplicados = 0
    let errores    = 0

    for (const item of preview) {
      try {
        await crearComprobante({ ...item.datos, entidad })
        guardados++
      } catch (err) {
        if (err.response?.status === 409) duplicados++
        else errores++
      }
    }

    queryClient.invalidateQueries(['comprobantes', entidad])
    setPreview([])
    setGuardando(false)

    const partes = []
    if (guardados)  partes.push(`${guardados} guardado${guardados > 1 ? 's' : ''}`)
    if (duplicados) partes.push(`${duplicados} ya existía${duplicados > 1 ? 'n' : ''}`)
    if (errores)    partes.push(`${errores} con error`)
    setToast({ mensaje: partes.join(' · '), tipo: guardados > 0 ? 'exito' : 'error' })
  }

  function limpiarTodo() {
    setPreview([])
    setOmitidos([])
  }

  return (
    <div className="space-y-6">

      {/* Zona drag & drop */}
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current.click()}
        className="border-2 border-dashed border-blue-300 bg-blue-50 rounded-xl p-10 text-center cursor-pointer hover:bg-blue-100 transition-colors"
      >
        <p className="text-blue-700 font-medium text-sm">Arrastrá los archivos XML aquí o hacé clic para seleccionar</p>
        <p className="text-blue-500 text-xs mt-1">Facturas electrónicas y notas de crédito · Podés subir varios a la vez</p>
        <input ref={inputRef} type="file" accept=".xml" multiple className="hidden" onChange={onInputChange} />
      </div>

      {/* Archivos omitidos */}
      {omitidos.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-2">
          <p className="text-yellow-800 font-medium text-sm">⚠️ {omitidos.length} archivo{omitidos.length > 1 ? 's' : ''} omitido{omitidos.length > 1 ? 's' : ''}:</p>
          {omitidos.map((o, i) => (
            <p key={i} className="text-yellow-700 text-xs">
              <span className="font-medium">{o.archivo}</span> — {o.motivo}
            </p>
          ))}
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-700 font-medium text-sm">
              {preview.length} comprobante{preview.length > 1 ? 's' : ''} listo{preview.length > 1 ? 's' : ''} para guardar
            </p>
            <div className="flex gap-3">
              <button onClick={limpiarTodo} className="text-sm text-gray-500 hover:text-gray-700 underline">
                Limpiar todo
              </button>
              <button
                onClick={guardarTodos}
                disabled={guardando}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : `Guardar ${preview.length > 1 ? 'todos' : ''}`}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-3 py-3 text-left">Archivo</th>
                  <th className="px-3 py-3 text-left">Tipo</th>
                  <th className="px-3 py-3 text-left">Emisor</th>
                  <th className="px-3 py-3 text-left">Fecha</th>
                  <th className="px-3 py-3 text-left">Moneda</th>
                  <th className="px-3 py-3 text-right">Subtotal ₡</th>
                  <th className="px-3 py-3 text-right">Desc. ₡</th>
                  <th className="px-3 py-3 text-left">Tasa(s)</th>
                  <th className="px-3 py-3 text-right">IVA ₡</th>
                  <th className="px-3 py-3 text-right">Total ₡</th>
                  <th className="px-3 py-3 text-left">Detalle</th>
                  <th className="px-3 py-3 text-center">Quitar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map(item => (
                  <tr key={item.datos.clave} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[120px] truncate" title={item.archivo}>{item.archivo}</td>
                    <td className="px-3 py-2">
                      {item.tipoComprobante === 'Nota de Crédito'
                        ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">NC</span>
                        : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">FE</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-gray-800 font-medium">{item.datos.emisor_nombre}</td>
                    <td className="px-3 py-2 text-gray-600">{item.datos.fecha_emision.split('-').reverse().join('-')}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.datos.moneda_original === 'USD' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {item.datos.moneda_original}
                        {item.datos.moneda_original === 'USD' && <span className="ml-1 text-gray-400">×{item.datos.tipo_cambio}</span>}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right ${item.datos.subtotal_crc < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      ₡{fmt(item.datos.subtotal_crc)}
                    </td>
                    <td className={`px-3 py-2 text-right ${item.datos.descuentos_crc < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {item.datos.descuentos_crc !== 0 ? `₡${fmt(item.datos.descuentos_crc)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {(item.datos.desglose_iva ?? []).length > 0
                        ? (item.datos.desglose_iva ?? []).map(d => d.label).join(', ')
                        : item.datos.tasas_iva
                      }
                    </td>
                    <td className={`px-3 py-2 text-right ${item.datos.impuesto_crc < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {/* Desglose por tasa si hay varias */}
                      {item.datos.desglose_iva.length > 1
                        ? item.datos.desglose_iva.map((d, i) => (
                            <span key={i} className="block whitespace-nowrap text-xs">
                              {d.label}: ₡{fmt(d.impuesto_crc)}
                            </span>
                          ))
                        : `₡${fmt(item.datos.impuesto_crc)}`
                      }
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${item.datos.total_crc < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      ₡{fmt(item.datos.total_crc)}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-40 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={item.datos.detalle ?? ''}
                        onChange={e => actualizarDetallePreview(item.datos.clave, e.target.value)}
                        placeholder="comida, gasolina..."
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => quitarDePreview(item.datos.clave)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && <Toast mensaje={toast.mensaje} tipo={toast.tipo} onClose={() => setToast(null)} />}
    </div>
  )
}