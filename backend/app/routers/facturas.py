from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.models import Factura, Proveedor
from app.schemas.schemas import FacturaCreate, FacturaOut
from typing import List, Optional
from datetime import date

router = APIRouter()

def calcular_estado(factura: Factura, hoy: date) -> str:
    if factura.estado == "pagada":
        return "pagada"
    if factura.saldo_pendiente <= 0:
        return "pagada"
    if factura.fecha_vencimiento < hoy:
        return "vencida"
    return "pendiente"

def actualizar_estado(factura: Factura, db: Session, hoy: date):
    nuevo_estado = calcular_estado(factura, hoy)
    if factura.estado != nuevo_estado:
        factura.estado = nuevo_estado
        db.commit()

@router.get("/", response_model=List[FacturaOut])
def listar_facturas(
    proveedor_id: Optional[str] = Query(None),
    estado:       Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    hoy = date.today()
    query = db.query(Factura).options(joinedload(Factura.proveedor))
    if proveedor_id:
        query = query.filter(Factura.proveedor_id == proveedor_id)

    # Ordenar por fecha_factura ASC, luego numero_factura ASC
    facturas = query.order_by(Factura.fecha_factura.asc(), Factura.numero_factura.asc()).all()

    # Actualizar estado de cada factura si cambió
    for f in facturas:
        actualizar_estado(f, db, hoy)

    # Filtro "por_pagar" agrupa pendiente + vencida
    if estado == "por_pagar":
        facturas = [f for f in facturas if f.estado in ("pendiente", "vencida")]
    elif estado:
        facturas = [f for f in facturas if f.estado == estado]

    return facturas

@router.post("/", response_model=FacturaOut)
def crear_factura(factura: FacturaCreate, db: Session = Depends(get_db)):
    proveedor = db.query(Proveedor).filter(Proveedor.id == str(factura.proveedor_id)).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    from datetime import timedelta
    fecha_vencimiento = factura.fecha_factura + timedelta(days=proveedor.plazo_dias)

    nueva = Factura(
        **factura.model_dump(),
        fecha_vencimiento=fecha_vencimiento,
        saldo_pendiente=factura.monto_original,
        estado="pendiente"
    )
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    nueva = db.query(Factura).options(joinedload(Factura.proveedor)).filter(Factura.id == nueva.id).first()
    return nueva

@router.get("/dashboard", response_model=dict)
def resumen_dashboard(db: Session = Depends(get_db)):
    hoy = date.today()
    proximos_dias = 7

    todas = db.query(Factura).filter(Factura.estado != "pagada").all()
    for f in todas:
        actualizar_estado(f, db, hoy)

    pendientes = db.query(Factura).filter(Factura.estado == "pendiente").count()
    vencidas   = db.query(Factura).filter(Factura.estado == "vencida").count()
    proximas   = db.query(Factura).filter(
        Factura.estado == "pendiente",
        Factura.fecha_vencimiento <= date.fromordinal(hoy.toordinal() + proximos_dias),
        Factura.fecha_vencimiento >= hoy
    ).count()

    return {
        "pendientes": pendientes,
        "vencidas":   vencidas,
        "proximas_a_vencer": proximas
    }

@router.get("/{id}", response_model=FacturaOut)
def obtener_factura(id: str, db: Session = Depends(get_db)):
    hoy = date.today()
    factura = db.query(Factura).options(joinedload(Factura.proveedor)).filter(Factura.id == id).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    actualizar_estado(factura, db, hoy)
    return factura

@router.put("/{factura_id}", response_model=FacturaOut)
def actualizar_factura(factura_id: str, datos: FacturaCreate, db: Session = Depends(get_db)):
    factura = db.query(Factura).options(joinedload(Factura.proveedor)).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    proveedor = db.query(Proveedor).filter(Proveedor.id == str(datos.proveedor_id)).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    from datetime import timedelta
    fecha_vencimiento = datos.fecha_factura + timedelta(days=proveedor.plazo_dias)

    from decimal import Decimal
    diferencia = Decimal(str(datos.monto_original)) - factura.monto_original
    nuevo_saldo = factura.saldo_pendiente + diferencia
    if nuevo_saldo < 0:
        nuevo_saldo = 0

    factura.proveedor_id    = datos.proveedor_id
    factura.numero_factura  = datos.numero_factura
    factura.fecha_factura   = datos.fecha_factura
    factura.fecha_vencimiento = fecha_vencimiento
    factura.monto_original  = datos.monto_original
    factura.saldo_pendiente = nuevo_saldo

    db.commit()
    db.refresh(factura)
    factura = db.query(Factura).options(joinedload(Factura.proveedor)).filter(Factura.id == factura_id).first()
    actualizar_estado(factura, db, date.today())
    return factura


@router.delete("/{factura_id}")
def eliminar_factura(factura_id: str, db: Session = Depends(get_db)):
    factura = db.query(Factura).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    from app.models.models import Pago
    db.query(Pago).filter(Pago.factura_id == factura_id).delete()
    db.delete(factura)
    db.commit()
    return {"ok": True}