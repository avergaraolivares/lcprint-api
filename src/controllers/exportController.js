const db      = require('../config/db')
const ExcelJS = require('exceljs')

// Exporta todos los productos a un archivo Excel descargable
const exportarProductos = async (req, res) => {
  try {
    const [productos] = await db.query(`
      SELECT p.codigo, p.nombre, p.descripcion_corta, p.precio,
             c.nombre as categoria_nombre,
             cp.nombre as categoria_padre_nombre,
             p.destacado, p.activo, p.orden
      FROM productos p
      JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN categorias cp ON c.parent_id = cp.id
      ORDER BY COALESCE(cp.nombre, c.nombre), c.nombre, p.nombre
    `)

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'LC Print SpA'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Productos')

    sheet.columns = [
      { header: 'Sku',          key: 'codigo',     width: 20 },
      { header: 'Titulo',       key: 'nombre',     width: 45 },
      { header: 'Categoria',    key: 'categoria',  width: 28 },
      { header: 'Subcategoria', key: 'subcategoria', width: 28 },
      { header: 'Precio',       key: 'precio',     width: 15 },
      { header: 'Descripcion',  key: 'descripcion', width: 40 },
      { header: 'Destacado',    key: 'destacado',  width: 12 },
      { header: 'Activo',       key: 'activo',     width: 10 },
      { header: 'Orden',        key: 'orden',      width: 10 },
    ]

    // Estilo del encabezado
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00AEEF' } }
    sheet.getRow(1).alignment = { vertical: 'middle' }
    sheet.getRow(1).height = 22

    productos.forEach(p => {
      // Si la categoría tiene padre, la categoría real es el padre y la subcategoría es c.nombre.
      // Si no tiene padre, es una categoría principal sin subcategoría.
      const tieneSubcategoria = !!p.categoria_padre_nombre
      sheet.addRow({
        codigo:       p.codigo,
        nombre:       p.nombre,
        categoria:    tieneSubcategoria ? p.categoria_padre_nombre : p.categoria_nombre,
        subcategoria: tieneSubcategoria ? p.categoria_nombre : '',
        precio:       p.precio || '',
        descripcion:  p.descripcion_corta || '',
        destacado:    p.destacado ? 'Sí' : 'No',
        activo:       p.activo ? 'Sí' : 'No',
        orden:        p.orden,
      })
    })

    // Bordes sutiles en todas las celdas con datos
    sheet.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E5E5' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
        }
      })
    })

    sheet.autoFilter = { from: 'A1', to: 'I1' }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="productos-lcprint-${Date.now()}.xlsx"`)

    await workbook.xlsx.write(res)
    res.end()
  } catch (e) {
    console.error('Export error:', e)
    res.status(500).json({ message: 'Error al exportar productos' })
  }
}

module.exports = { exportarProductos }
