const db                                          = require('../config/db')
const { upload }                                  = require('../config/upload')
const { processProductImage, deleteProductImages } = require('../services/imageService')
const XLSX                                        = require('xlsx')

// ── Público ───────────────────────────────────────────────────
const listar = async (req, res) => {
  try {
    const { categoria, buscar, destacado, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit
    const params = []
    let where    = 'WHERE p.activo = 1'

    if (categoria) {
      where += ` AND (
        c.slug = ?
        OR c.parent_id = (SELECT id FROM categorias WHERE slug = ? LIMIT 1)
      )`
      params.push(categoria, categoria)
    }
    if (destacado) { where += ' AND p.destacado = 1' }
    if (buscar) {
      where += ' AND (p.nombre LIKE ? OR p.descripcion_corta LIKE ? OR p.codigo LIKE ?)'
      params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`)
    }

    const [total] = await db.query(
      `SELECT COUNT(*) as total FROM productos p
       JOIN categorias c ON p.categoria_id = c.id ${where}`, params
    )

    const [rows] = await db.query(
      `SELECT p.id, p.codigo, p.nombre, p.descripcion_corta, p.precio, p.mostrar_precio_web,
              p.imagen_principal, p.imagen_original, p.imagen_medium, p.imagen_thumb,
              p.destacado,
              c.id as categoria_id, c.nombre as categoria_nombre, c.slug as categoria_slug,
              c.parent_id
       FROM productos p
       JOIN categorias c ON p.categoria_id = c.id
       ${where}
       ORDER BY p.nombre ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    )

    // Ocultar precio en la web cuando el producto no lo permite
    rows.forEach(r => {
      if (!r.mostrar_precio_web) r.precio = null
      delete r.mostrar_precio_web
    })

    res.json({
      data:        rows,
      total:       total[0].total,
      page:        Number(page),
      total_pages: Math.ceil(total[0].total / limit),
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al obtener productos' })
  }
}

const obtener = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, c.nombre as categoria_nombre, c.slug as categoria_slug
       FROM productos p
       JOIN categorias c ON p.categoria_id = c.id
       WHERE p.id = ? AND p.activo = 1`, [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Producto no encontrado' })

    const producto = rows[0]
    if (!producto.mostrar_precio_web) producto.precio = null
    delete producto.mostrar_precio_web
    if (producto.caracteristicas && typeof producto.caracteristicas === 'string') {
      producto.caracteristicas = JSON.parse(producto.caracteristicas)
    }
    const [imagenes] = await db.query(
      'SELECT * FROM producto_imagenes WHERE producto_id = ? ORDER BY orden', [producto.id]
    )
    producto.imagenes = imagenes
    res.json(producto)
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener producto' })
  }
}

// ── Admin ─────────────────────────────────────────────────────
const listarAdmin = async (req, res) => {
  try {
    const { categoria, buscar, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit
    const params = []
    let where    = 'WHERE 1=1'

    if (categoria) { where += ' AND c.slug = ?'; params.push(categoria) }
    if (buscar) {
      where += ' AND (p.nombre LIKE ? OR p.codigo LIKE ?)'
      params.push(`%${buscar}%`, `%${buscar}%`)
    }

    const [total] = await db.query(
      `SELECT COUNT(*) as total FROM productos p
       JOIN categorias c ON p.categoria_id = c.id ${where}`, params
    )
    const [rows] = await db.query(
      `SELECT p.id, p.codigo, p.nombre, p.precio, p.mostrar_precio_web,
              p.imagen_principal, p.imagen_thumb,
              p.destacado, p.activo, p.created_at,
              c.nombre as categoria_nombre
       FROM productos p
       JOIN categorias c ON p.categoria_id = c.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    )

    // Ocultar precio en la web cuando el producto no lo permite
    rows.forEach(r => {
      if (!r.mostrar_precio_web) r.precio = null
      delete r.mostrar_precio_web
    })

    res.json({
      data:        rows,
      total:       total[0].total,
      page:        Number(page),
      total_pages: Math.ceil(total[0].total / limit),
    })
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener productos' })
  }
}

const obtenerAdmin = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, c.nombre as categoria_nombre
       FROM productos p
       JOIN categorias c ON p.categoria_id = c.id
       WHERE p.id = ?`, [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Producto no encontrado' })

    const producto = rows[0]
    if (!producto.mostrar_precio_web) producto.precio = null
    delete producto.mostrar_precio_web
    if (producto.caracteristicas && typeof producto.caracteristicas === 'string') {
      producto.caracteristicas = JSON.parse(producto.caracteristicas)
    }
    const [imagenes] = await db.query(
      'SELECT * FROM producto_imagenes WHERE producto_id = ? ORDER BY orden', [producto.id]
    )
    producto.imagenes = imagenes
    res.json(producto)
  } catch (e) {
    res.status(500).json({ message: 'Error al obtener producto' })
  }
}

const crear = async (req, res) => {
  try {
    const { codigo, nombre, categoria_id, descripcion_corta, descripcion,
            caracteristicas, precio, destacado = 0, orden = 0,
            mostrar_precio_web = 0 } = req.body
    if (!codigo || !nombre || !categoria_id)
      return res.status(400).json({ message: 'Código, nombre y categoría son requeridos' })

    const [exist] = await db.query('SELECT id FROM productos WHERE codigo = ?', [codigo])
    if (exist.length) return res.status(400).json({ message: 'El código ya existe' })

    let imagenes = {}
    if (req.file) imagenes = await processProductImage(req.file.buffer)

    const caract = caracteristicas ? JSON.stringify(
      typeof caracteristicas === 'string' ? JSON.parse(caracteristicas) : caracteristicas
    ) : null

    const [r] = await db.query(
      `INSERT INTO productos (codigo, nombre, categoria_id, descripcion_corta, descripcion,
        caracteristicas, precio, mostrar_precio_web, imagen_principal, imagen_original, imagen_medium, imagen_thumb,
        destacado, orden) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [codigo, nombre, categoria_id, descripcion_corta || null, descripcion || null,
       caract, precio || null, Number(mostrar_precio_web) ? 1 : 0,
       imagenes.imagen_principal || null, imagenes.imagen_original || null,
       imagenes.imagen_medium    || null, imagenes.imagen_thumb    || null,
       destacado, orden]
    )

    const [nuevo] = await db.query('SELECT * FROM productos WHERE id = ?', [r.insertId])
    res.status(201).json(nuevo[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al crear producto' })
  }
}

const actualizar = async (req, res) => {
  try {
    const { id } = req.params
    const [exist] = await db.query('SELECT * FROM productos WHERE id = ?', [id])
    if (!exist.length) return res.status(404).json({ message: 'Producto no encontrado' })

    const prod = exist[0]
    const { codigo, nombre, categoria_id, descripcion_corta, descripcion,
            caracteristicas, precio, destacado, activo, orden,
            mostrar_precio_web } = req.body

    let imagenes = {
      imagen_principal: prod.imagen_principal,
      imagen_original:  prod.imagen_original,
      imagen_medium:    prod.imagen_medium,
      imagen_thumb:     prod.imagen_thumb,
    }

    if (req.file) {
      deleteProductImages(prod)
      imagenes = await processProductImage(req.file.buffer)
    }

    const caract = caracteristicas ? JSON.stringify(
      typeof caracteristicas === 'string' ? JSON.parse(caracteristicas) : caracteristicas
    ) : prod.caracteristicas

    await db.query(
      `UPDATE productos SET codigo=?, nombre=?, categoria_id=?, descripcion_corta=?,
        descripcion=?, caracteristicas=?, precio=?, mostrar_precio_web=?,
        imagen_principal=?, imagen_original=?, imagen_medium=?, imagen_thumb=?,
        destacado=?, activo=?, orden=?
       WHERE id=?`,
      [codigo ?? prod.codigo, nombre ?? prod.nombre,
       categoria_id ?? prod.categoria_id,
       descripcion_corta ?? prod.descripcion_corta,
       descripcion ?? prod.descripcion, caract,
       precio ?? prod.precio,
       mostrar_precio_web !== undefined ? (Number(mostrar_precio_web) ? 1 : 0) : prod.mostrar_precio_web,
       imagenes.imagen_principal, imagenes.imagen_original,
       imagenes.imagen_medium,    imagenes.imagen_thumb,
       destacado ?? prod.destacado, activo ?? prod.activo,
       orden ?? prod.orden, id]
    )

    const [updated] = await db.query('SELECT * FROM productos WHERE id = ?', [id])
    res.json(updated[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al actualizar producto' })
  }
}

const eliminar = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM productos WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ message: 'Producto no encontrado' })

    deleteProductImages(rows[0])

    await db.query('DELETE FROM productos WHERE id = ?', [req.params.id])
    res.json({ message: 'Producto eliminado correctamente' })
  } catch (e) {
    res.status(500).json({ message: 'Error al eliminar producto' })
  }
}

const agregarImagen = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Imagen requerida' })
    const imgs = await processProductImage(req.file.buffer)
    const [r] = await db.query(
      'INSERT INTO producto_imagenes (producto_id, url, orden) VALUES (?,?,?)',
      [req.params.id, imgs.imagen_original, req.body.orden || 0]
    )
    res.status(201).json({ id: r.insertId, url: imgs.imagen_original, producto_id: req.params.id })
  } catch (e) {
    res.status(500).json({ message: 'Error al subir imagen' })
  }
}

const eliminarImagen = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM producto_imagenes WHERE id = ?', [req.params.imgId])
    if (!rows.length) return res.status(404).json({ message: 'Imagen no encontrada' })
    const url = rows[0].url
    if (url && url.includes('cloudinary.com')) {
      const publicId = url.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '')
      const cloudinary = require('../config/cloudinary')
      await cloudinary.uploader.destroy(publicId)
    }
    await db.query('DELETE FROM producto_imagenes WHERE id = ?', [req.params.imgId])
    res.json({ message: 'Imagen eliminada' })
  } catch (e) {
    res.status(500).json({ message: 'Error al eliminar imagen' })
  }
}

const importarExcel = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Archivo requerido' })

    const wb   = XLSX.read(req.file.buffer, { type: 'buffer' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

    if (!rows.length) return res.status(400).json({ message: 'El archivo está vacío' })

    let creados  = 0
    let omitidos = 0
    let errores  = []

    for (const row of rows) {
      try {
        const codigo    = String(row['Sku']          || row['SKU']    || '').trim()
        const titulo    = String(row['Titulo']       || row['Nombre'] || '').trim()
        const categoria = String(row['Subcategoria'] || row['Categoria'] || '').trim()
        const precio    = row['Precio'] && Number(row['Precio']) > 0
                          ? `$${Number(row['Precio']).toLocaleString('es-CL')}`
                          : (String(row['Precio'] || 'Consultar').trim() || 'Consultar')
        const orden          = Number(row['Orden']) || 0
        const descCorta      = String(row['Descripcion_Corta']    || row['Descripción Corta']    || '').trim()
        const descCompleta   = String(row['Descripcion_Completa'] || row['Descripción Completa'] || '').trim()
        const caracteristicas = String(row['Caracteristicas'] || row['Características (JSON)'] || '').trim()

        if (!codigo) { omitidos++; continue }

        const [exist] = await db.query('SELECT id FROM productos WHERE codigo = ?', [codigo])
        if (exist.length) {
          if (descCorta || descCompleta || caracteristicas) {
            const updates = {}
            if (descCorta)    updates.descripcion_corta = descCorta
            if (descCompleta) updates.descripcion        = descCompleta
            if (caracteristicas) {
              try { JSON.parse(caracteristicas); updates.caracteristicas = caracteristicas } catch {}
            }
            if (Object.keys(updates).length > 0) {
              const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ')
              await db.query(`UPDATE productos SET ${fields} WHERE id = ?`, [...Object.values(updates), exist[0].id])
            }
          }
          omitidos++
          continue
        }

        if (!titulo) { omitidos++; continue }

        let catId = null
        if (categoria) {
          const slug = categoria.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')

          const [catRows] = await db.query('SELECT id FROM categorias WHERE slug = ?', [slug])
          if (catRows.length) {
            catId = catRows[0].id
          } else {
            const [r] = await db.query(
              'INSERT INTO categorias (nombre, slug, descripcion) VALUES (?,?,?)',
              [categoria, slug, `Categoría ${categoria}`]
            )
            catId = r.insertId
          }
        }

        if (!catId) { omitidos++; continue }

        let caracJson = null
        if (caracteristicas) {
          try { JSON.parse(caracteristicas); caracJson = caracteristicas } catch {}
        }

        await db.query(
          `INSERT INTO productos (codigo, nombre, categoria_id, precio, orden, activo, descripcion_corta, descripcion, caracteristicas)
           VALUES (?,?,?,?,?,1,?,?,?)`,
          [codigo, titulo, catId, precio, orden, descCorta || null, descCompleta || null, caracJson]
        )
        creados++
      } catch (e) {
        errores.push(`${row['Sku'] || row['SKU'] || '?'}: ${e.message}`)
      }
    }

    res.json({ message: 'Importación completada', creados, omitidos, errores: errores.slice(0, 10) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al procesar el archivo' })
  }
}

const importarDescripciones = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Archivo requerido' })
  try {
    const XLSX   = require('xlsx')
    const wb     = XLSX.read(req.file.buffer, { type: 'buffer' })
    const ws     = wb.Sheets[wb.SheetNames[0]]
    const rows   = XLSX.utils.sheet_to_json(ws, { defval: '' })

    let actualizados = 0
    let omitidos     = 0
    const errores    = []

    for (const row of rows) {
      const sku           = String(row['SKU'] || row['Sku'] || row['sku'] || '').trim()
      const descCorta     = String(row['Descripción Corta']    || row['Descripcion_Corta']    || row['descripcion_corta']    || '').trim()
      const descCompleta  = String(row['Descripción Completa'] || row['Descripcion_Completa'] || row['descripcion_completa'] || '').trim()
      const caracteristicas = String(row['Características (JSON)'] || row['Caracteristicas'] || row['caracteristicas'] || '').trim()

      if (!sku) { omitidos++; continue }

      const [exist] = await db.query('SELECT id FROM productos WHERE codigo = ?', [sku])
      if (!exist.length) {
        errores.push(`SKU no encontrado: ${sku}`)
        omitidos++
        continue
      }

      const updates = {}
      if (descCorta)    updates.descripcion_corta = descCorta
      if (descCompleta) updates.descripcion        = descCompleta
      if (caracteristicas) {
        try {
          JSON.parse(caracteristicas)
          updates.caracteristicas = caracteristicas
        } catch {
          errores.push(`JSON inválido en SKU ${sku} — se omitió características`)
        }
      }

      if (Object.keys(updates).length > 0) {
        const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ')
        const vals   = [...Object.values(updates), exist[0].id]
        await db.query(`UPDATE productos SET ${fields} WHERE id = ?`, vals)
        actualizados++
      } else {
        omitidos++
      }
    }

    res.json({ actualizados, omitidos, errores })
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: 'Error al procesar el archivo' })
  }
}

module.exports = {
  listar, obtener,
  listarAdmin, obtenerAdmin,
  crear, actualizar, eliminar,
  agregarImagen, eliminarImagen,
  importarExcel, importarDescripciones,
}