import { useState } from 'react'
import CargarXML from './CargarXML'
import GenerarReporte from './GenerarReporte'

const ENTIDADES = [
  { key: 'empresa',    label: 'Empresa'    },
  { key: 'ferreteria', label: 'Ferretería' },
  { key: 'daniel',     label: 'Daniel'     },
]

const MODULOS = [
  { key: 'cargar',  label: '⬆ Cargar XML'      },
  { key: 'reporte', label: '📊 Generar Reporte' },
]

export default function Comprobantes() {
  const [entidad, setEntidad] = useState('empresa')
  const [modulo, setModulo]   = useState('cargar')

  return (
    <div className="space-y-6">

      {/* Título */}
      <h1 className="text-2xl font-semibold text-gray-800">Comprobantes Electrónicos</h1>

      {/* Tab selector de entidad */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {ENTIDADES.map(e => (
          <button
            key={e.key}
            onClick={() => setEntidad(e.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              entidad === e.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      {/* Sub-tab selector de módulo */}
      <div className="flex gap-4 border-b border-gray-200">
        {MODULOS.map(m => (
          <button
            key={m.key}
            onClick={() => setModulo(m.key)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              modulo === m.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {modulo === 'cargar'  && <CargarXML      entidad={entidad} key={`cargar-${entidad}`}  />}
      {modulo === 'reporte' && <GenerarReporte entidad={entidad} key={`reporte-${entidad}`} />}
    </div>
  )
}