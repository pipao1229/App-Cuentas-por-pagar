from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Pago, Factura
from app.schemas.schemas import PagoCreate, PagoOut, PagoUpdate
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

@router.put("/{pago_id}", response_model=PagoOut)
def actualizar_pago(pago_id: str, datos: PagoUpdate, db: Session = Depends(get_db)):
    pago = db.query(Pago).filter(Pago.id == pago_id).first()
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    factura = db.query(Factura).filter(Factura.id == pago.factura_id).first()
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    cambios = datos.model_dump(exclude_unset=True)

    # Si cambia el monto, hay que recalcular el saldo y el estado de la factura
    if "monto_pagado" in cambios:
        nuevo_monto = cambios["monto_pagado"]
        if nuevo_monto <= 0:
            raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")

        diferencia  = nuevo_monto - float(pago.monto_pagado)
        nuevo_saldo = float(factura.saldo_pendiente) - diferencia

        if nuevo_saldo < 0:
            raise HTTPException(status_code=400, detail="El nuevo monto excede el saldo pendiente de la factura")
        if nuevo_saldo > float(factura.monto_original):
            raise HTTPException(status_code=400, detail="El nuevo monto deja un saldo mayor al monto original de la factura")

        factura.saldo_pendiente = nuevo_saldo
        factura.estado = "pagada" if nuevo_saldo <= 0 else "parcial"
        pago.monto_pagado = nuevo_monto

    if "fecha_pago" in cambios:
        pago.fecha_pago = cambios["fecha_pago"]
    if "numero_comprobante" in cambios:
        pago.numero_comprobante = cambios["numero_comprobante"]
    if "notas" in cambios:
        pago.notas = cambios["notas"]

    db.commit()
    db.refresh(pago)
    return pago