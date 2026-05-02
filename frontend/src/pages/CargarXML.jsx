import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { crearComprobante } from '../api/comprobantes'
import Toast from '../components/Toast'

// ── Mapa de CodigoTarifaIVA → etiqueta legible ─────────────────────────────
const TASA_LABEL = {
  '01': '1%',
  '02': '2%',
  '03': '4%',
  '04': '0% Exento',
  '05': '0% Exonerado',
  '06': '0% No sujeto',
  '07': '1% Canasta básica',
  '08': '13%',
  '09': '4% Reducida',
  '10': '0% No sujeto',   // combustibles y similares
}

function getText(doc, tag) {
  const el = doc.getElementsByTagNameNS('*', tag)[0]
  return el ? el.textContent.trim() : ''
}

function getAll(doc, tag) {
  return Array.from(doc.getElementsByTagNameNS('*', tag))
}

function parsearXML(texto, nombreArchivo) {
  const parser = new DOMParser()
  const doc    = parser.parseFromString(texto, 'application/xml')

  // Detectar tipo de documento
  const raiz = doc.documentElement.localName
  if (raiz === 'MensajeHacienda') {
    return { tipo: 'mensaje', archivo: nombreArchivo }
  }
  if (raiz !== 'FacturaElectronica') {
    return { tipo: 'desconocido', archivo: nombreArchivo }
  }

  // Datos principales
  const clave              = getText(doc, 'Clave')
  const numeroConsecutivo  = getText(doc, 'NumeroConsecutivo')
  const fechaEmision       = getText(doc, 'FechaEmision').substring(0, 10) // YYYY-MM-DD
  const emisorNombre       = getText(doc, 'Nombre')   // primer <Nombre> = Emisor
  const emisorCedula       = (() => {
    // Identificacion > Numero dentro de Emisor
    const emisorEl = doc.getElementsByTagNameNS('*', 'Emisor')[0]
    return emisorEl ? emisorEl.getElementsByTagNameNS('*', 'Numero')[0]?.textContent.trim() : ''
  })()

  // Moneda y tipo de cambio
  const monedaOriginal = getText(doc, 'CodigoMoneda') || 'CRC'
  const tipoCambio     = parseFloat(getText(doc, 'TipoCambio') || '1') || 1

  // Totales del resumen (en moneda original)
  const subtotalOrig    = parseFloat(getText(doc, 'TotalVentaNeta')   || '0')
  const descuentosOrig  = parseFloat(getText(doc, 'TotalDescuentos')  || '0')
  const impuestoOrig    = parseFloat(getText(doc, 'TotalImpuesto')    || '0')
  const totalOrig       = parseFloat(getText(doc, 'TotalComprobante') || '0')

  // Convertir a CRC
  const tc              = monedaOriginal === 'USD' ? tipoCambio : 1
  const subtotalCRC     = subtotalOrig   * tc
  const descuentosCRC   = descuentosOrig * tc
  const impuestoCRC     = impuestoOrig   * tc
  const totalCRC        = totalOrig      * tc

  // Tasas IVA — puede haber varias líneas con distintas tarifas
  const lineas   = getAll(doc, 'LineaDetalle')
  const tasasSet = new Set()
  lineas.forEach(linea => {
    const codigoTarifa = linea.getElementsByTagNameNS('*', 'CodigoTarifaIVA')[0]?.textContent.trim()
    if (codigoTarifa) tasasSet.add(TASA_LABEL[codigoTarifa] ?? `${codigoTarifa}`)
  })
  // También revisar TotalDesgloseImpuesto por si no hay líneas
  getAll(doc, 'TotalDesgloseImpuesto').forEach(td => {
    const ct = td.getElementsByTagNameNS('*', 'CodigoTarifaIVA')[0]?.textContent.trim()
    if (ct) tasasSet.add(TASA_LABEL[ct] ?? ct)
  })
  const tasasIVA = tasasSet.size ? [...tasasSet].join(', ') : '—'

  return {
    tipo: 'factura',
    archivo: nombreArchivo,
    datos: {
      clave,
      numero_consecutivo: numeroConsecutivo,
      emisor_nombre:      emisorNombre,
      emisor_cedula:      emisorCedula,
      fecha_emision:      fechaEmision,
      moneda_original:    monedaOriginal,
      tipo_cambio:        tipoCambio,
      subtotal_crc:       Math.round(subtotalCRC   * 100) / 100,
      descuentos_crc:     Math.round(descuentosCRC * 100) / 100,
      impuesto_crc:       Math.round(impuestoCRC   * 100) / 100,
      total_crc:          Math.round(totalCRC      * 100) / 100,
      tasas_iva:          tasasIVA,
    }
  }
}

const fmt = (n) => Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CargarXML({ entidad }) {
  const queryClient    = useQueryClient()
  const inputRef       = useRef()
  const [preview, setPreview]   = useState([])   // facturas parseadas listas para guardar
  const [omitidos, setOmitidos] = useState([])   // archivos omitidos con motivo
  const [toast, setToast]       = useState(null)
  const [guardando, setGuardando] = useState(false)

  // ── Procesar archivos seleccionados ─────────────────────────────────────
  async function procesarArchivos(archivos) {
    const resultados  = []
    const rechazados  = []

    for (const archivo of archivos) {
      if (!archivo.name.toLowerCase().endsWith('.xml')) {
        rechazados.push({ archivo: archivo.name, motivo: 'No es un archivo XML.' })
        continue
      }
      const texto    = await archivo.text()
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
      // Evitar duplicados en preview por clave
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

  // ── Guardar en backend ───────────────────────────────────────────────────
  async function guardarTodos() {
    if (!preview.length) return
    setGuardando(true)
    let guardados = 0
    let duplicados = 0
    let errores = 0

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
        <p className="text-blue-500 text-xs mt-1">Podés subir varios a la vez</p>
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

      {/* Preview de facturas listas para guardar */}
      {preview.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-gray-700 font-medium text-sm">
              {preview.length} factura{preview.length > 1 ? 's' : ''} lista{preview.length > 1 ? 's' : ''} para guardar
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
                {guardando ? 'Guardando...' : `Guardar ${preview.length > 1 ? 'todas' : ''}`}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-3 py-3 text-left">Archivo</th>
                  <th className="px-3 py-3 text-left">Emisor</th>
                  <th className="px-3 py-3 text-left">Fecha</th>
                  <th className="px-3 py-3 text-left">Moneda</th>
                  <th className="px-3 py-3 text-right">Subtotal ₡</th>
                  <th className="px-3 py-3 text-right">IVA ₡</th>
                  <th className="px-3 py-3 text-right">Total ₡</th>
                  <th className="px-3 py-3 text-left">Tasa(s) IVA</th>
                  <th className="px-3 py-3 text-center">Quitar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map(item => (
                  <tr key={item.datos.clave} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[120px] truncate" title={item.archivo}>{item.archivo}</td>
                    <td className="px-3 py-2 text-gray-800 font-medium">{item.datos.emisor_nombre}</td>
                    <td className="px-3 py-2 text-gray-600">{item.datos.fecha_emision}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.datos.moneda_original === 'USD' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {item.datos.moneda_original}
                        {item.datos.moneda_original === 'USD' && <span className="ml-1 text-gray-400">×{item.datos.tipo_cambio}</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">₡{fmt(item.datos.subtotal_crc)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">₡{fmt(item.datos.impuesto_crc)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">₡{fmt(item.datos.total_crc)}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{item.datos.tasas_iva}</td>
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