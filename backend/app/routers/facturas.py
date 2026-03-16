from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.models import Factura, Proveedor
from app.schemas.schemas import FacturaCreate, FacturaOut
from typing import List, Optional
from datetime import date

router = APIRouter()

@router.get("/", response_model=List[FacturaOut])
def listar_facturas(
    proveedor_id: Optional[str] = Query(None),
    estado:       Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Factura).options(joinedload(Factura.proveedor))
    if proveedor_id:
        query = query.filter(Factura.proveedor_id == proveedor_id)
    if estado:
        query = query.filter(Factura.estado == estado)
    return query.order_by(Factura.fecha_vencimiento.asc()).all()

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

    pendientes = db.query(Factura).filter(Factura.estado.in_(["pendiente", "parcial"])).count()
    vencidas   = db.query(Factura).filter(Factura.estado == "vencida").count()
    proximas   = db.query(Factura).filter(
        Factura.estado.in_(["pendiente", "parcial"]),
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
    factura = db.query(Factura).options(joinedload(Factura.proveedor)).filter(Factura.id == id).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return factura

@router.delete("/{factura_id}")
def eliminar_factura(factura_id: str, db: Session = Depends(get_db)):
    factura = db.query(Factura).filter(Factura.id == factura_id).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    # Eliminar pagos asociados primero
    from app.models.models import Pago
    db.query(Pago).filter(Pago.factura_id == factura_id).delete()
    db.delete(factura)
    db.commit()
    return {"ok": True}