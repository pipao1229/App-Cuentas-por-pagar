from pydantic import BaseModel, condecimal
from typing import Optional, List
from datetime import date, datetime
from uuid import UUID

# ── Proveedores ──────────────────────────────
class ProveedorBase(BaseModel):
    nombre:     str
    telefono:   Optional[str] = None
    contacto:   Optional[str] = None
    moneda:     str = "CRC"
    plazo_dias: int = 0

class ProveedorCreate(ProveedorBase):
    pass

class ProveedorUpdate(BaseModel):
    nombre:     Optional[str] = None
    telefono:   Optional[str] = None
    contacto:   Optional[str] = None
    moneda:     Optional[str] = None
    plazo_dias: Optional[int] = None
    activo:     Optional[bool] = None

class ProveedorOut(ProveedorBase):
    id:        UUID
    activo:    bool
    created_at: datetime

    class Config:
        from_attributes = True

# ── Facturas ─────────────────────────────────
class FacturaBase(BaseModel):
    proveedor_id:   UUID
    numero_factura: str
    fecha_factura:  date
    monto_original: float
    notas:          Optional[str] = None

class FacturaCreate(FacturaBase):
    pass

class FacturaOut(BaseModel):
    id:                UUID
    proveedor_id:      UUID
    numero_factura:    str
    fecha_factura:     date
    fecha_vencimiento: date
    monto_original:    float
    saldo_pendiente:   float
    estado:            str
    notas:             Optional[str]
    created_at:        datetime
    proveedor:         ProveedorOut

    class Config:
        from_attributes = True

# ── Pagos ─────────────────────────────────────
class PagoBase(BaseModel):
    factura_id:         UUID
    fecha_pago:         date
    monto_pagado:       float
    numero_comprobante: Optional[str] = None
    notas:              Optional[str] = None

class PagoCreate(PagoBase):
    pass

class PagoOut(PagoBase):
    id:        UUID
    created_at: datetime

    class Config:
        from_attributes = True

# ── Comprobantes ──────────────────────────────
class ComprobanteCreate(BaseModel):
    entidad:            str                  # 'empresa' | 'ferreteria'
    clave:              str
    numero_consecutivo: str
    emisor_nombre:      str
    emisor_cedula:      str
    fecha_emision:      date
    moneda_original:    str
    tipo_cambio:        float
    subtotal_crc:       float
    descuentos_crc:     float = 0
    impuesto_crc:       float = 0
    total_crc:          float
    tasas_iva:          str

class ComprobanteOut(ComprobanteCreate):
    id:        UUID
    created_at: datetime

    class Config:
        from_attributes = True