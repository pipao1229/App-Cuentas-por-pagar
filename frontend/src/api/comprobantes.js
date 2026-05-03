import api from './client'

export const crearComprobante    = (datos) => api.post('/api/comprobantes/', datos)
export const getComprobantes     = (params) => api.get('/api/comprobantes/', { params })
export const eliminarComprobante = (id)    => api.delete(`/api/comprobantes/${id}`)