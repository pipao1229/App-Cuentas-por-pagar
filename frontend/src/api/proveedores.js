import api from './client'

export const getProveedores = () => api.get('/api/proveedores/')
export const crearProveedor = (data) => api.post('/api/proveedores/', data)
export const actualizarProveedor = (id, data) => api.patch(`/api/proveedores/${id}`, data)