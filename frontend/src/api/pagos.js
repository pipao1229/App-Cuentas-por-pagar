import api from './client'

export const registrarPago = (data) => api.post('/api/pagos/', data)
export const getPagosPorFactura = (facturaId) => api.get(`/api/pagos/factura/${facturaId}`)
export const actualizarPago = (id, datos) => api.put(`/api/pagos/${id}`, datos)