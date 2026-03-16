-- ============================================
-- SCHEMA: Cuentas por Pagar
-- ============================================

-- Extensión para UUIDs automáticos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLA: proveedores
-- ============================================
CREATE TABLE proveedores (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre        VARCHAR(150) NOT NULL,
    telefono      VARCHAR(20),
    contacto      VARCHAR(150),
    moneda        CHAR(3) NOT NULL DEFAULT 'CRC' CHECK (moneda IN ('CRC', 'USD')),
    plazo_dias    SMALLINT NOT NULL DEFAULT 0 CHECK (plazo_dias >= 0),
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLA: facturas
-- ============================================
CREATE TABLE facturas (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proveedor_id      UUID NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
    numero_factura    VARCHAR(50) NOT NULL,
    fecha_factura     DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    monto_original    NUMERIC(15, 2) NOT NULL CHECK (monto_original > 0),
    saldo_pendiente   NUMERIC(15, 2) NOT NULL CHECK (saldo_pendiente >= 0),
    estado            VARCHAR(10) NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'parcial', 'pagada', 'vencida')),
    notas             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT saldo_no_mayor_que_monto
        CHECK (saldo_pendiente <= monto_original)
);

-- ============================================
-- TABLA: pagos
-- ============================================
CREATE TABLE pagos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    factura_id          UUID NOT NULL REFERENCES facturas(id) ON DELETE RESTRICT,
    fecha_pago          DATE NOT NULL,
    monto_pagado        NUMERIC(15, 2) NOT NULL CHECK (monto_pagado > 0),
    numero_comprobante  VARCHAR(100),
    notas               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- FUNCIÓN: calcular fecha de vencimiento
-- Se llama automáticamente al insertar una factura
-- ============================================
CREATE OR REPLACE FUNCTION calcular_fecha_vencimiento()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_vencimiento := NEW.fecha_factura + 
        (SELECT plazo_dias FROM proveedores WHERE id = NEW.proveedor_id);
    NEW.saldo_pendiente   := NEW.monto_original;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fecha_vencimiento
    BEFORE INSERT ON facturas
    FOR EACH ROW
    EXECUTE FUNCTION calcular_fecha_vencimiento();

-- ============================================
-- FUNCIÓN: actualizar saldo al registrar un pago
-- ============================================
CREATE OR REPLACE FUNCTION actualizar_saldo_factura()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE facturas
    SET
        saldo_pendiente = saldo_pendiente - NEW.monto_pagado,
        estado = CASE
            WHEN (saldo_pendiente - NEW.monto_pagado) <= 0 THEN 'pagada'
            ELSE 'parcial'
        END
    WHERE id = NEW.factura_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_actualizar_saldo
    AFTER INSERT ON pagos
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_saldo_factura();

-- ============================================
-- FUNCIÓN: marcar facturas vencidas
-- Se ejecuta manualmente o con un cron job
-- ============================================
CREATE OR REPLACE FUNCTION marcar_facturas_vencidas()
RETURNS void AS $$
BEGIN
    UPDATE facturas
    SET estado = 'vencida'
    WHERE estado IN ('pendiente', 'parcial')
        AND fecha_vencimiento < CURRENT_DATE
        AND saldo_pendiente > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ÍNDICES para mejorar velocidad de consultas
-- ============================================
CREATE INDEX idx_facturas_proveedor  ON facturas(proveedor_id);
CREATE INDEX idx_facturas_estado     ON facturas(estado);
CREATE INDEX idx_facturas_vencimiento ON facturas(fecha_vencimiento);
CREATE INDEX idx_pagos_factura       ON pagos(factura_id);