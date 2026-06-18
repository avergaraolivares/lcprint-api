require('dotenv').config()
const fs = require('fs')
const path = require('path')
const cloudinary = require('cloudinary').v2
const mysql = require('mysql2/promise')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

const UPLOAD_PATH = process.env.UPLOAD_PATH || './uploads'

async function subirImagen(localUrl) {
  if (!localUrl || localUrl.startsWith('http')) return localUrl
  const filepath = path.join(UPLOAD_PATH, localUrl.replace('/uploads/', ''))
  if (!fs.existsSync(filepath)) return localUrl
  try {
    const result = await cloudinary.uploader.upload(filepath, {
      folder: 'lcprint',
      resource_type: 'image',
    })
    console.log(`✓ ${localUrl} → ${result.secure_url}`)
    return result.secure_url
  } catch (e) {
    console.error(`✗ Error subiendo ${localUrl}:`, e.message)
    return localUrl
  }
}

async function main() {
  console.log('Migrando imágenes de productos...')
  const [productos] = await db.query('SELECT id, imagen_principal, imagen_original, imagen_medium, imagen_thumb FROM productos')
  
  for (const p of productos) {
    const principal = await subirImagen(p.imagen_principal)
    const original  = await subirImagen(p.imagen_original)
    const medium    = await subirImagen(p.imagen_medium)
    const thumb     = await subirImagen(p.imagen_thumb)
    
    await db.query(
      'UPDATE productos SET imagen_principal=?, imagen_original=?, imagen_medium=?, imagen_thumb=? WHERE id=?',
      [principal, original, medium, thumb, p.id]
    )
  }

  console.log('\nMigrando logo empresa...')
  const [config] = await db.query('SELECT logo FROM configuracion_empresa WHERE id=1')
  if (config[0]?.logo) {
    const logo = await subirImagen(config[0].logo)
    await db.query('UPDATE configuracion_empresa SET logo=? WHERE id=1', [logo])
  }

  console.log('\nMigrando imagen banner inicio...')
  const [inicio] = await db.query('SELECT banner_imagen FROM contenido_inicio WHERE id=1')
  if (inicio[0]?.banner_imagen) {
    const banner = await subirImagen(inicio[0].banner_imagen)
    await db.query('UPDATE contenido_inicio SET banner_imagen=? WHERE id=1', [banner])
  }

  console.log('\n✅ Migración completada')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })