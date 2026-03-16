from sqlalchemy import Column, String, Integer, Numeric, Date, Boolean, Text, TIMESTAMP, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid

class Proveedor(Base):
    __tablename__ = "proveedores"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre     = Column(String(150), nullable=False)
    telefono   = Column(String(20))
    contacto   = Column(String(150))
    moneda     = Column(String(3), nullable=False, default="CRC")
    plazo_dias = Column(Integer, nullable=False, default=0)
    activo     = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    facturas   = relationship("Factura", back_populates="proveedor")


class Factura(Base):
    __tablename__ = "facturas"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    proveedor_id      = Column(UUID(as_uuid=True), ForeignKey("proveedores.id"), nullable=False)
    numero_factura    = Column(String(50), nullable=False)
    fecha_factura     = Column(Date, nullable=False)
    fecha_vencimiento = Column(Date, nullable=False)
    monto_original    = Column(Numeric(15, 2), nullable=False)
    saldo_pendiente   = Column(Numeric(15, 2), nullable=False)
    estado            = Column(String(10), nullable=False, default="pendiente")
    notas             = Column(Text)
    created_at        = Column(TIMESTAMP(timezone=True), server_default=func.now())

    proveedor = relationship("Proveedor", back_populates="facturas")
    pagos     = relationship("Pago", back_populates="factura")


class Pago(Base):
    __tablename__ = "pagos"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    factura_id         = Column(UUID(as_uuid=True), ForeignKey("facturas.id"), nullable=False)
    fecha_pago         = Column(Date, nullable=False)
    monto_pagado       = Column(Numeric(15, 2), nullable=False)
    numero_comprobante = Column(String(100))
    notas              = Column(Text)
    created_at         = Column(TIMESTAMP(timezone=True), server_default=func.now())

    factura = relationship("Factura", back_populates="pagos")