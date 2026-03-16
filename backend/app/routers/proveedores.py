from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Proveedor
from app.schemas.schemas import ProveedorCreate, ProveedorUpdate, ProveedorOut
from typing import List

router = APIRouter()

@router.get("/", response_model=List[ProveedorOut])
def listar_proveedores(db: Session = Depends(get_db)):
    return db.query(Proveedor).filter(Proveedor.activo == True).all()

@router.post("/", response_model=ProveedorOut)
def crear_proveedor(proveedor: ProveedorCreate, db: Session = Depends(get_db)):
    nuevo = Proveedor(**proveedor.model_dump())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo

@router.get("/{id}", response_model=ProveedorOut)
def obtener_proveedor(id: str, db: Session = Depends(get_db)):
    proveedor = db.query(Proveedor).filter(Proveedor.id == id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return proveedor

@router.patch("/{id}", response_model=ProveedorOut)
def actualizar_proveedor(id: str, datos: ProveedorUpdate, db: Session = Depends(get_db)):
    proveedor = db.query(Proveedor).filter(Proveedor.id == id).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(proveedor, campo, valor)
    db.commit()
    db.refresh(proveedor)
    return proveedor