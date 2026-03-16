from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Pago, Factura
from app.schemas.schemas import PagoCreate, PagoOut
from typing import List

router = APIRouter()

@router.post("/", response_model=PagoOut)
def registrar_pago(pago: PagoCreate, db: Session = Depends(get_db)):
    factura = db.query(Factura).filter(Factura.id == str(pago.factura_id)).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if factura.estado == "pagada":
        raise HTTPException(status_code=400, detail="Esta factura ya está pagada")
    if pago.monto_pagado > float(factura.saldo_pendiente):
        raise HTTPException(status_code=400, detail=f"El monto excede el saldo pendiente de {factura.saldo_pendiente}")

    nuevo_pago = Pago(**pago.model_dump())
    db.add(nuevo_pago)

    nuevo_saldo = float(factura.saldo_pendiente) - pago.monto_pagado
    factura.saldo_pendiente = nuevo_saldo
    factura.estado = "pagada" if nuevo_saldo <= 0 else "parcial"

    db.commit()
    db.refresh(nuevo_pago)
    return nuevo_pago

@router.get("/factura/{factura_id}", response_model=List[PagoOut])
def pagos_de_factura(factura_id: str, db: Session = Depends(get_db)):
    return db.query(Pago).filter(Pago.factura_id == factura_id).order_by(Pago.fecha_pago.desc()).all()