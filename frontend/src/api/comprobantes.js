import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export const crearComprobante  = (datos)  => axios.post(`${API}/api/comprobantes/`, datos)

export const getComprobantes   = (params) => axios.get(`${API}/api/comprobantes/`, { params })

export const eliminarComprobante = (id)   => axios.delete(`${API}/api/comprobantes/${id}`)