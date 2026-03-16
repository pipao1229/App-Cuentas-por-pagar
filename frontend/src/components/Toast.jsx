import { useEffect } from 'react'

export default function Toast({ mensaje, tipo = 'exito', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  const colores = {
    exito: 'bg-green-500',
    error: 'bg-red-500',
  }

  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg text-white text-sm font-medium shadow-lg ${colores[tipo]}`}>
      {mensaje}
    </div>
  )
}