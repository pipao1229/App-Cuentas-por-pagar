import api from './client'

export const getFacturas = (params) => api.get('/api/facturas/', { params })
export const crearFactura = (data) => api.post('/api/facturas/', data)
export const getDashboard = () => api.get('/api/facturas/dashboard')
export const getFactura = (id) => api.get(`/api/facturas/${id}`)
export const eliminarFactura = (id) => api.delete(`/api/facturas/${id}`)