const colores = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  parcial:   'bg-blue-100 text-blue-800',
  pagada:    'bg-green-100 text-green-800',
  vencida:   'bg-red-100 text-red-800',
}

export default function EstadoBadge({ estado }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colores[estado] ?? 'bg-gray-100 text-gray-800'}`}>
      {estado}
    </span>
  )
}