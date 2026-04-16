# Cuentas por Pagar
 
Sistema web para gestión de cuentas por pagar. Permite registrar proveedores, facturas y pagos, con seguimiento automático de estados y vencimientos.
 
## Stack
 
| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite + Tailwind CSS v3 |
| Backend | Python + FastAPI + SQLAlchemy |
| Base de datos | PostgreSQL (Supabase) |
| Hosting frontend | Vercel |
| Hosting backend | Railway |
 
## URLs de producción
 
- **App:** https://app-cuentas-por-pagar.vercel.app
- **API:** https://app-cuentas-por-pagar-production.up.railway.app
 
## Estructura del proyecto
 
```
cuentas-por-pagar/
├── backend/
│   ├── app/
│   │   ├── main.py             # Punto de entrada, CORS
│   │   ├── database.py         # Conexión a PostgreSQL
│   │   ├── routers/
│   │   │   ├── proveedores.py  # CRUD proveedores
│   │   │   ├── facturas.py     # CRUD facturas + dashboard
│   │   │   └── pagos.py        # Registro de pagos
│   │   ├── models/
│   │   │   └── models.py       # Modelos SQLAlchemy
│   │   └── schemas/
│   │       └── schemas.py      # Schemas Pydantic
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/                # Llamadas al backend (axios)
│   │   ├── components/         # Navbar, Modal, Toast, EstadoBadge
│   │   ├── pages/              # Dashboard, Proveedores, Facturas, Pagos
│   │   └── utils/
│   │       └── fecha.js        # Formateo de fechas dd-mm-yyyy
│   └── package.json
└── database/
    ├── schema.sql              # Estructura de tablas
    └── seed.sql                # Datos de prueba
```
 
## Correr localmente
 
### Backend
 
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
```
 
Crea el archivo `backend/.env`:
```
DATABASE_URL=postgresql://...  # tu URL de Supabase
```
 
```bash
uvicorn app.main:app --reload
```
 
La API estará disponible en `http://localhost:8000`.
 
### Frontend
 
```bash
cd frontend
npm install
npm run dev
```
 
La app estará disponible en `http://localhost:5173`.
 
## Variables de entorno
 
| Archivo | Variable | Descripción |
|---------|----------|-------------|
| `backend/.env` | `DATABASE_URL` | URL de conexión a Supabase |
| Vercel (Settings) | `VITE_API_URL` | URL del backend en Railway |
 
## Funcionalidades
 
- Registro y gestión de proveedores (nombre, teléfono, moneda, plazo de pago)
- Registro de facturas con cálculo automático de fecha de vencimiento
- Registro de pagos parciales o totales por factura
- Estados automáticos: `pendiente`, `parcial`, `pagada`, `vencida`
- Dashboard con resumen de facturas pendientes, próximas a vencer y vencidas
- Exportación de facturas a PDF
- Filtros por estado y proveedor
 
## Deploy
 
Cualquier push a `main` redespliega automáticamente tanto Vercel (frontend) como Railway (backend).
 
```bash
git add .
git commit -m "descripción del cambio"
git push
```
