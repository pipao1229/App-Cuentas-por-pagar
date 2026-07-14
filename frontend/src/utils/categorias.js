// ── Categorización de comprobantes ──────────────────────────────────────
// Palabras clave que se buscan en el nombre del emisor
// Si el texto no coincide con ninguna, el comprobante queda sin categoría
// para que el cliente la asigne manualmente desde el selector

export const CATEGORIAS = [
    {
        nombre: 'Combustible',
        claves: ['gasolina', 'diesel', 'diésel', 'combustible', 'super 95', 'super plus',
                'gasoil', 'servicentro', 'estacion de servicio', 'estación de servicio', 'recope'],
    },
    {
        nombre: 'Alimentación',
        claves: ['restaurante', 'soda ', 'comida', 'almuerzo', 'desayuno', 'cena',
                'cafeteria', 'cafetería', 'panaderia', 'panadería', 'pizza', 'menu ejecutivo', 'menú ejecutivo'],
    },
    {
        nombre: 'Repuestos y mantenimiento',
        claves: ['repuesto', 'taller', 'mantenimiento', 'llanta', 'aceite', 'filtro',
                'mecanico', 'mecánico', 'lubricante', 'bateria', 'batería', 'frenos'],
    },
    {
        nombre: 'Materiales y ferretería',
        claves: ['ferreteria', 'ferretería', 'tornillo', 'cemento', 'pintura', 'herramienta',
                'material de construccion', 'material de construcción', 'clavo', 'varilla', 'block'],
    },
    {
        nombre: 'Servicios públicos',
        claves: ['electricidad', 'energia electrica', 'energía eléctrica', 'agua potable',
                'telefono', 'teléfono', 'internet', 'ice ', ' a y a ', 'kolbi', 'claro', 'liberty'],
    },
    {
        nombre: 'Transporte',
        claves: ['taxi', 'uber', 'transporte', 'flete', 'peaje', 'parqueo', 'estacionamiento'],
    },
    {
        nombre: 'Papelería y oficina',
        claves: ['papeleria', 'papelería', 'oficina', 'impresora', 'tinta', 'toner', 'tóner', 'fotocopia'],
    },
    ]

    // Categorías seleccionables manualmente (incluye "Otros" como comodín, que
    // no participa en la detección automática, solo se puede elegir a mano)
    export const NOMBRES_CATEGORIAS = [...CATEGORIAS.map(c => c.nombre), 'Otros']

    // Devuelve el nombre de la categoría detectada, o '' si no hay coincidencia
    export function categorizarComprobante(emisorNombre, detalleItems = []) {
    const texto = [emisorNombre, ...detalleItems].join(' ').toLowerCase()
    const encontrada = CATEGORIAS.find(cat => cat.claves.some(clave => texto.includes(clave)))
    return encontrada ? encontrada.nombre : ''
    }