import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProveedores, crearProveedor, actualizarProveedor, eliminarProveedor } from '../api/proveedores'
import Modal from '../components/Modal'
import Toast from '../components/Toast'

const MONEDAS = ['CRC', 'USD']
const PLAZOS = [0, 8, 15, 30, 45, 60]
const formVacio = { nombre: '', telefono: '', contacto: '', moneda: 'CRC', plazo_dias: 30 }

function validarForm(form) {
  if (!form.nombre.trim()) return 'El nombre es obligatorio.'
  if (form.telefono && !/^\d{4}-\d{4}$/.test(form.telefono))
    return 'El teléfono debe tener el formato ####-####.'
  return null
}

export default function Proveedores() {
  const queryClient = useQueryClient()
  const [mostrarModal, setMostrarModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(formVacio)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [confirmEliminar, setConfirmEliminar] = useState(null)

  const { data: proveedores = [], isLoading } = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => getProveedores().then(r => r.data)
  })

  const cerrarToast = useCallback(() => setToast(null), [])

  const crear = useMutation({
    mutationFn: crearProveedor,
    onSuccess: () => {
      queryClient.invalidateQueries(['proveedores'])
      setMostrarModal(false)
      setForm(formVacio)
      setError('')
      setToast({ mensaje: 'Proveedor creado correctamente.', tipo: 'exito' })
    },
    onError: () => setError('Error al guardar el proveedor.')
  })

  const actualizar = useMutation({
    mutationFn: ({ id, datos }) => actualizarProveedor(id, datos),
    onSuccess: () => {
      queryClient.invalidateQueries(['proveedores'])
      setMostrarModal(false)
      setForm(formVacio)
      setError('')
      setToast({ mensaje: 'Proveedor actualizado correctamente.', tipo: 'exito' })
    },
    onError: () => setError('Error al actualizar el proveedor.')
  })

  const eliminar = useMutation({
    mutationFn: eliminarProveedor,
    onSuccess: () => {
      queryClient.invalidateQueries(['proveedores'])
      setConfirmEliminar(null)
      setToast({ mensaje: 'Proveedor eliminado.', tipo: 'exito' })
    },
    onError: () => setToast({ mensaje: 'No se puede eliminar — tiene facturas asociadas.', tipo: 'error' })
  })

  function abrirNuevo() {
    setForm(formVacio)
    setEditando(null)
    setError('')
    setMostrarModal(true)
  }

  function abrirEditar(p) {
    setForm({ nombre: p.nombre, telefono: p.telefono ?? '', contacto: p.contacto ?? '', moneda: p.moneda, plazo_dias: p.plazo_dias })
    setEditando(p.id)
    setError('')
    setMostrarModal(true)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const err = validarForm(form)
    if (err) return setError(err)
    if (editando) {
      actualizar.mutate({ id: editando, datos: form })
    } else {
      crear.mutate(form)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Proveedores</h1>
        <button onClick={abrirNuevo} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          + Nuevo proveedor
        </button>
      </div>

      {/* Modal nuevo/editar */}
      {mostrarModal && (
        <Modal titulo={editando ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={() => setMostrarModal(false)}>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.telefono}
                onChange={e => setForm({ ...form, telefono: e.target.value })}
                placeholder="2222-3333"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contacto / correo</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.contacto}
                onChange={e => setForm({ ...form, contacto: e.target.value })}
                placeholder="nombre@correo.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Moneda</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.moneda}
                onChange={e => setForm({ ...form, moneda: e.target.value })}
              >
                {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plazo de pago</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.plazo_dias}
                onChange={e => setForm({ ...form, plazo_dias: Number(e.target.value) })}
              >
                {PLAZOS.map(p => <option key={p} value={p}>{p === 0 ? 'Inmediato (0 días)' : `${p} días`}</option>)}
              </select>
            </div>
            <div className="col-span-2 flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setMostrarModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button type="submit" disabled={crear.isPending || actualizar.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {crear.isPending || actualizar.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal confirmación eliminar */}
      {confirmEliminar && (
        <Modal titulo="Eliminar proveedor" onClose={() => setConfirmEliminar(null)}>
          <p className="text-gray-700 text-sm mb-6">
            ¿Seguro que deseas eliminar a <span className="font-semibold">{confirmEliminar.nombre}</span>? Esta acción no se puede deshacer.
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

      {isLoading ? (
        <p className="text-gray-500 text-sm">Cargando proveedores...</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left">Teléfono</th>
                <th className="px-4 py-3 text-left">Contacto</th>
                <th className="px-4 py-3 text-center">Moneda</th>
                <th className="px-4 py-3 text-center">Plazo</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {proveedores.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{p.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{p.telefono ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.contacto ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.moneda === 'USD' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                      {p.moneda}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {p.plazo_dias === 0 ? 'Inmediato' : `${p.plazo_dias} días`}
                  </td>
                  <td className="px-4 py-3 text-center flex gap-3 justify-center">
                    <button onClick={() => abrirEditar(p)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                      Editar
                    </button>
                    <button onClick={() => setConfirmEliminar(p)} className="text-red-500 hover:text-red-700 text-xs font-medium">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}