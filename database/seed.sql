-- ============================================
-- SEED: Datos de prueba
-- ============================================

-- Proveedores de ejemplo
INSERT INTO proveedores (nombre, telefono, contacto, moneda, plazo_dias) VALUES
    ('Distribuidora Nacional S.A.',  '2222-1111', 'Carlos Méndez - carlos@distnac.com',  'CRC', 30),
    ('Importaciones del Pacífico',   '2233-4455', 'Ana Rodríguez - ana@impacific.com',   'USD', 15),
    ('Suministros Globales CR',      '8844-9900', 'Luis Vargas',                          'CRC', 45),
    ('Tech Solutions Inc.',          '6060-1234', 'soporte@techsolutions.com',            'USD',  0),
    ('Papelería y Más',              '2255-8877', 'María Solís',                          'CRC',  8);

-- Facturas (fecha_vencimiento y saldo_pendiente los calcula el trigger automáticamente)
INSERT INTO facturas (proveedor_id, numero_factura, fecha_factura, fecha_vencimiento, monto_original, saldo_pendiente, estado) VALUES
    (
        (SELECT id FROM proveedores WHERE nombre = 'Distribuidora Nacional S.A.'),
        'FAC-2025-001', '2026-02-10', '2026-03-12', 850000.00, 850000.00, 'vencida'
    ),
    (
        (SELECT id FROM proveedores WHERE nombre = 'Importaciones del Pacífico'),
        'FAC-2025-002', '2026-03-01', '2026-03-16', 1250.00, 1250.00, 'pendiente'
    ),
    (
        (SELECT id FROM proveedores WHERE nombre = 'Suministros Globales CR'),
        'FAC-2025-003', '2026-02-20', '2026-04-06', 320000.00, 120000.00, 'parcial'
    ),
    (
        (SELECT id FROM proveedores WHERE nombre = 'Tech Solutions Inc.'),
        'FAC-2025-004', '2026-03-10', '2026-03-10', 890.00, 0.00, 'pagada'
    ),
    (
        (SELECT id FROM proveedores WHERE nombre = 'Papelería y Más'),
        'FAC-2025-005', '2026-03-12', '2026-03-20', 45000.00, 45000.00, 'pendiente'
    );

-- Pagos registrados
INSERT INTO pagos (factura_id, fecha_pago, monto_pagado, numero_comprobante, notas) VALUES
    (
        (SELECT id FROM facturas WHERE numero_factura = 'FAC-2025-003'),
        '2026-03-05', 200000.00, 'TRF-20260305-001', 'Abono parcial acordado con proveedor'
    ),
    (
        (SELECT id FROM facturas WHERE numero_factura = 'FAC-2025-004'),
        '2026-03-10', 890.00, 'TRF-20260310-002', 'Pago total'
    );