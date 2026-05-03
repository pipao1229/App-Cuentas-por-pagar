# Cuentas por Pagar
Sistema web para gestión de cuentas por pagar y comprobantes electrónicos de Hacienda Costa Rica. Permite registrar proveedores, facturas y pagos con seguimiento automático de estados y vencimientos, además de cargar y generar reportes a partir de XMLs de factura electrónica v4.4.

## Stack
| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite + Tailwind CSS v3 |
| Backend | Python + FastAPI + SQLAlchemy |
| Base de datos | PostgreSQL (Supabase) |
| Hosting frontend | Vercel |
| Hosting backend | Render |

## Estructura del proyecto
cuentas-por-pagar/
├── backend/
│   ├── app/
│   │   ├── main.py               # Punto de entrada, CORS
│   │   ├── auth.py               # Verificación de JWT con Supabase (ES256)
│   │   ├── database.py           # Conexión a PostgreSQL
│   │   ├── routers/
│   │   │   ├── proveedores.py    # CRUD proveedores
│   │   │   ├── facturas.py       # CRUD facturas + dashboard
│   │   │   ├── pagos.py          # Registro de pagos
│   │   │   └── comprobantes.py   # Carga y consulta de comprobantes XML
│   │   ├── models/
│   │   │   └── models.py         # Modelos SQLAlchemy
│   │   └── schemas/
│   │       └── schemas.py        # Schemas Pydantic
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/                  # Llamadas al backend (axios + interceptor JWT)
│   │   ├── components/           # Navbar, Modal, Toast, EstadoBadge
│   │   ├── context/              # AuthContext, AuthProvider, useAuth
│   │   ├── lib/
│   │   │   └── supabase.js       # Cliente de Supabase
│   │   ├── pages/                # Dashboard, Proveedores, Facturas, Comprobantes, Login
│   │   │   ├── CargarXML.jsx     # Carga y parseo de XMLs de Hacienda
│   │   │   └── GenerarReporte.jsx # Filtros, resumen por tasa IVA, exportación Excel
│   │   └── utils/
│   │       └── fecha.js          # Formateo de fechas dd-mm-yyyy
│   └── package.json
└── database/
├── schema.sql                # Estructura de tablas
└── seed.sql                  # Datos de prueba

## Funcionalidades

### Cuentas por pagar
- Registro y gestión de proveedores (nombre, teléfono, moneda, plazo de pago)
- Registro de facturas con cálculo automático de fecha de vencimiento
- Registro de pagos parciales o totales por factura
- Estados automáticos: `pendiente`, `pagada`, `vencida`
- Dashboard con resumen de facturas pendientes, próximas a vencer y vencidas
- Totales pendiente y vencido agrupados por moneda (₡ y $)
- Exportación de facturas a PDF y Excel
- Filtros por estado y proveedor

### Comprobantes electrónicos
- Carga de XMLs de FacturaElectronica v4.4 de Hacienda Costa Rica
- Soporte para múltiples archivos simultáneos (drag & drop o selector)
- Detección y aviso de MensajeHacienda (archivos no válidos para carga)
- Prevención de duplicados por clave de comprobante
- Conversión automática de USD a CRC usando el tipo de cambio del XML
- Datos separados por entidad: **Empresa** y **Ferretería**
- Resumen de comprobantes agrupado por tasa de IVA (13%, 8%, 4%, 2%, 1%, 0% Exento, 0% Exonerado, 0% No sujeto)
- Filtro por rango de fechas
- Exportación a Excel con dos hojas: detalle de comprobantes + resumen por tasa IVA
- Eliminación de comprobantes cargados por error

### Seguridad
- Autenticación con Supabase Auth (email + contraseña)
- Tokens JWT verificados en el backend con algoritmo ES256
- Todas las rutas del frontend protegidas — redirige a login si no hay sesión activa
- Token enviado automáticamente en cada request al backend via interceptor de axios
- Row Level Security (RLS) activado en todas las tablas de la base de datos

## Deploy
Cualquier push a `main` redespliega automáticamente tanto Vercel (frontend) como Render (backend).

```bash
git add .
git commit -m "descripción del cambio"
git push
```
