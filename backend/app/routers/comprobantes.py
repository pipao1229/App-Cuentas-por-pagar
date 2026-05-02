from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Comprobante
from app.schemas.schemas import ComprobanteCreate, ComprobanteOut
from typing import List, Optional
from datetime import date

router = APIRouter()


@router.post("/", response_model=ComprobanteOut, status_code=201)
def crear_comprobante(datos: ComprobanteCreate, db: Session = Depends(get_db)):
    # Evitar duplicados por clave + entidad
    existente = db.query(Comprobante).filter(
        Comprobante.clave == datos.clave,
        Comprobante.entidad == datos.entidad
    ).first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail=f"Este comprobante ya fue cargado anteriormente (clave: {datos.clave[:20]}...)."
        )

    nuevo = Comprobante(**datos.model_dump())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.get("/", response_model=List[ComprobanteOut])
def listar_comprobantes(
    entidad:      str            = Query(...),
    fecha_desde:  Optional[date] = Query(None),
    fecha_hasta:  Optional[date] = Query(None),
    db: Session = Depends(get_db)
):
    q = db.query(Comprobante).filter(Comprobante.entidad == entidad)
    if fecha_desde:
        q = q.filter(Comprobante.fecha_emision >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Comprobante.fecha_emision <= fecha_hasta)
    return q.order_by(Comprobante.fecha_emision.desc()).all()


@router.delete("/{comprobante_id}")
def eliminar_comprobante(comprobante_id: str, db: Session = Depends(get_db)):
    c = db.query(Comprobante).filter(Comprobante.id == comprobante_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado.")
    db.delete(c)
    db.commit()
    return {"ok": True}