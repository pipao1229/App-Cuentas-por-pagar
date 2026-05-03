from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.routers import proveedores, facturas, pagos, comprobantes
from app.auth import verify_token

app = FastAPI(
    title="Cuentas por Pagar API",
    description="API para gestión de cuentas por pagar",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="https://.*\\.vercel\\.app|http://localhost:5173",
    allow_credentials=True,          # cambia a True para que pasen los headers
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(proveedores.router,  prefix="/api/proveedores",  tags=["Proveedores"],  dependencies=[Depends(verify_token)])
app.include_router(facturas.router,     prefix="/api/facturas",     tags=["Facturas"],     dependencies=[Depends(verify_token)])
app.include_router(pagos.router,        prefix="/api/pagos",        tags=["Pagos"],        dependencies=[Depends(verify_token)])
app.include_router(comprobantes.router, prefix="/api/comprobantes", tags=["Comprobantes"], dependencies=[Depends(verify_token)])

@app.get("/")
def root():
    return {"status": "ok", "mensaje": "API de Cuentas por Pagar funcionando"}