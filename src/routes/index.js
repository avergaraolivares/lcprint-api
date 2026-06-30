const express  = require('express')
const router   = express.Router()
const { auth, soloAdmin }     = require('../middleware/auth')
const { upload, uploadExcel } = require('../config/upload')

const authCtrl     = require('../controllers/authController')
const catCtrl      = require('../controllers/categoriaController')
const prodCtrl     = require('../controllers/productoController')
const contCtrl     = require('../controllers/contenidoController')
const contactCtrl  = require('../controllers/contactoController')
const userCtrl     = require('../controllers/usuarioController')
const disenioCtrl  = require('../controllers/disenioController')
const exportCtrl   = require('../controllers/exportController')

// ── Visitas / Dashboard ───────────────────────────────────────
const visitaCtrl = require('../controllers/visitaController')
router.post('/visita',             visitaCtrl.registrarVisita)
router.get ('/admin/estadisticas', auth, visitaCtrl.getEstadisticas)

// ── Auth ──────────────────────────────────────────────────────
router.post('/auth/login',    authCtrl.login)
router.get ('/auth/me',       auth, authCtrl.me)
router.put ('/auth/password', auth, authCtrl.cambiarPassword)

// ── Categorías (públicas) ─────────────────────────────────────
router.get('/categorias',     catCtrl.listar)
router.get('/categorias/:id', catCtrl.obtener)

// ── Categorías (admin) ────────────────────────────────────────
router.post  ('/admin/categorias',              auth, soloAdmin, catCtrl.crear)
router.put   ('/admin/categorias/:id',          auth, soloAdmin, catCtrl.actualizar)
router.post  ('/admin/categorias/:id/imagen-card',    auth, soloAdmin, upload.single('imagen'), catCtrl.actualizarImagenCard)
router.delete('/admin/categorias/:id/imagen-card',    auth, soloAdmin, catCtrl.eliminarImagenCard)
router.delete('/admin/categorias/:id',               auth, soloAdmin, catCtrl.eliminar)

// ── Productos (públicos) ──────────────────────────────────────
router.get('/productos',      prodCtrl.listar)
router.get('/productos/:id',  prodCtrl.obtener)

// ── Productos (admin) ─────────────────────────────────────────
router.post  ('/admin/productos/importar',             auth, uploadExcel.single('archivo'), prodCtrl.importarExcel)
router.post  ('/admin/productos/importar-descripciones', auth, uploadExcel.single('archivo'), prodCtrl.importarDescripciones)
router.get   ('/admin/productos/exportar',             auth, exportCtrl.exportarProductos)
router.get   ('/admin/productos',                     auth, prodCtrl.listarAdmin)
router.get   ('/admin/productos/:id',                 auth, prodCtrl.obtenerAdmin)
router.post  ('/admin/productos',                     auth, upload.single('imagen'), prodCtrl.crear)
router.put   ('/admin/productos/:id',                 auth, upload.single('imagen'), prodCtrl.actualizar)
router.delete('/admin/productos/:id',                 auth, soloAdmin, prodCtrl.eliminar)
router.post  ('/admin/productos/:id/imagenes',        auth, upload.single('imagen'), prodCtrl.agregarImagen)
router.delete('/admin/productos/:id/imagenes/:imgId', auth, prodCtrl.eliminarImagen)

// ── Configuración empresa ─────────────────────────────────────
router.get('/configuracion',       contCtrl.getConfig)
router.put('/admin/configuracion', auth, soloAdmin, upload.single('logo'), contCtrl.updateConfig)

// ── Logos de confianza (Webpay Plus + Garantía) ────────────────
router.get('/logos-confianza',       contCtrl.getLogosConfianza)
router.put('/admin/logos-confianza', auth, soloAdmin, upload.any(), contCtrl.updateLogosConfianza)

// ── Banners slider ────────────────────────────────────────────
const bannerCtrl = require('../controllers/bannerController')
router.get   ('/banners',           bannerCtrl.listar)
router.get   ('/admin/banners',     auth, bannerCtrl.listarAdmin)
router.post  ('/admin/banners',     auth, soloAdmin, upload.single('imagen'), bannerCtrl.crear)
router.put   ('/admin/banners/:id', auth, soloAdmin, upload.single('imagen'), bannerCtrl.actualizar)
router.delete('/admin/banners/:id', auth, soloAdmin, bannerCtrl.eliminar)

// ── Spotlight productos ───────────────────────────────────────
const spotlightCtrl = require('../controllers/spotlightController')
router.get('/spotlight-productos',        spotlightCtrl.getSpotlightProductos)
router.post('/admin/spotlight-productos', auth, soloAdmin, spotlightCtrl.setSpotlightProductos)

// ── Contenido inicio ──────────────────────────────────────────
router.get('/contenido/inicio',           contCtrl.getInicio)
router.get('/contenido/inicio/spotlight', contCtrl.getSpotlight)
router.put('/admin/contenido/inicio', auth, upload.fields([
  { name: 'banner',             maxCount: 1 },
  { name: 'spotlight_imagen',   maxCount: 1 },
  { name: 'spotlight_banner',   maxCount: 1 },
  { name: 'spotlight2_imagen',  maxCount: 1 },
  { name: 'spotlight2_banner',  maxCount: 1 },
  { name: 'spotlight3_imagen',  maxCount: 1 },
  { name: 'spotlight3_banner',  maxCount: 1 },
]), contCtrl.updateInicio)

// ── Contenido nosotros ────────────────────────────────────────
router.get('/contenido/nosotros',       contCtrl.getNosotros)
router.put('/admin/contenido/nosotros', auth, upload.single('imagen'), contCtrl.updateNosotros)

// ── Contacto ──────────────────────────────────────────────────
router.post('/contacto',                  contactCtrl.enviarContacto)
router.get ('/admin/contactos',           auth, soloAdmin, contactCtrl.listarContactos)
router.put ('/admin/contactos/:id/leido', auth, soloAdmin, contactCtrl.marcarLeido)
router.delete('/admin/contactos/:id',    auth, soloAdmin, contactCtrl.eliminarContacto)

// ── Catálogo PDF ──────────────────────────────────────────────
router.post('/catalogo/pdf', contactCtrl.generarCatalogoPDF)

// ── Clientes destacados ───────────────────────────────────────
const clienteCtrl = require('../controllers/clienteController')
router.get   ('/clientes',            clienteCtrl.listar)
router.post  ('/admin/clientes',      auth, upload.single('imagen'), clienteCtrl.crear)
router.put   ('/admin/clientes/:id',  auth, upload.single('imagen'), clienteCtrl.actualizar)
router.delete('/admin/clientes/:id',  auth, soloAdmin, clienteCtrl.eliminar)

// ── Usuarios (solo admin) ─────────────────────────────────────
router.get   ('/admin/usuarios',     auth, soloAdmin, userCtrl.listar)
router.post  ('/admin/usuarios',     auth, soloAdmin, userCtrl.crear)
router.put   ('/admin/usuarios/:id', auth, soloAdmin, userCtrl.actualizar)
router.delete('/admin/usuarios/:id', auth, soloAdmin, userCtrl.eliminar)

// ── Diseño (público para aplicar estilos, admin para editar) ──
router.get('/diseno',        disenioCtrl.getDisenio)
router.put('/admin/diseno',  auth, soloAdmin, disenioCtrl.updateDisenio)

module.exports = router