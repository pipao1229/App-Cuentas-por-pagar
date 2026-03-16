import api from './client'

export const registrarPago = (data) => api.post('/api/pagos/', data)
export const getPagosPorFactura = (facturaId) => api.get(`/api/pagos/factura/${facturaId}`)