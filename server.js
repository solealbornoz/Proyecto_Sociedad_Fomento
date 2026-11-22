const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@libsql/client');

const port = Number(process.env.PORT) || 3000;
const urlDb = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (Boolean(urlDb) !== Boolean(authToken)) throw new Error('Configurá TURSO_DATABASE_URL y TURSO_AUTH_TOKEN juntos.');
if (!urlDb && process.env.VERCEL) throw new Error('Configurá TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en Vercel.');
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!urlDb) fs.mkdirSync(dataDir, { recursive: true });
const db = createClient(urlDb ? {url: urlDb, authToken} : {url: `file:${path.join(dataDir, 'talleres.sqlite')}`});
const schema = [
  'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, comentario TEXT NOT NULL, rating INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), taller TEXT NOT NULL, fecha TEXT NOT NULL, horario TEXT NOT NULL, UNIQUE(user_id, taller, fecha, horario))',
  'CREATE TABLE IF NOT EXISTS cart (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), taller TEXT NOT NULL, fecha TEXT NOT NULL, horario TEXT NOT NULL, UNIQUE(user_id, taller, fecha, horario))'
];
let ready;
function iniciarDb() {
  if (!ready) ready = db.batch(schema, 'write').catch(error => { ready = undefined; throw error; });
  return ready;
}
const ejecutar = (sql, args = []) => db.execute({sql, args});
const uno = async (sql, args = []) => (await ejecutar(sql, args)).rows[0];
const todos = async (sql, args = []) => (await ejecutar(sql, args)).rows;
const actividades = require('./actividades');
const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const catalogo = {};
for (const actividad of actividades) {
  actividad.categorias = actividad.categorias.map(([categoria, dia, horario], index) => {
    const id = `${actividad.id}-${index + 1}`;
    catalogo[id] = {nombre: actividad.nombre, icono: actividad.icono, categoria, dia, horario, precio: actividad.precio};
    return {id, categoria, dia, diaNombre: dias[dia], horario};
  });
}
// Las inscripciones anteriores siguen visibles y pueden cancelarse o quitarse.
Object.assign(catalogo, {
  fotografia: {nombre:'Fotografía Creativa (anterior)', categoria:'Taller anterior', precio:15000, legado:true},
  ceramica: {nombre:'Cerámica Artesanal (anterior)', categoria:'Taller anterior', precio:18000, legado:true},
  velas: {nombre:'Velas Aromáticas (anterior)', categoria:'Taller anterior', precio:12000, legado:true}
});
function fechaBarrio() {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Argentina/Buenos_Aires', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
}
function turnoValido(d) {
  const item = catalogo[d.taller];
  const date = typeof d.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? new Date(d.fecha + 'T12:00:00Z') : null;
  if (!item || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== d.fecha) return false;
  const today = new Date(fechaBarrio() + 'T12:00:00Z');
  const diff = (date - today) / 86400000;
  if (diff < 0 || diff >= 7) return false;
  return item.legado ? ['10:00','14:00','17:00'].includes(d.horario) : date.getUTCDay() === item.dia && d.horario === item.horario;
}
function detalle(item) { return {...item, ...(catalogo[item.taller] || {nombre:'Actividad anterior', categoria:'', precio:0, legado:true})}; }
async function obtenerCarrito(userId) {
  return (await todos('SELECT id, taller, fecha, horario FROM cart WHERE user_id = ? ORDER BY id', [userId])).map(detalle);
}
function send(res, status, body) { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(body)); }
async function session(req) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('session='))?.slice(8);
  return token && await uno('SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token = ? AND expires > ?', [token, Date.now()]);
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 10000) throw new Error('Datos demasiado extensos'); }
  return JSON.parse(raw || '{}');
}
const handler = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/index' && url.searchParams.has('path')) url.pathname = '/api/' + url.searchParams.get('path');
    if (url.pathname.startsWith('/api/')) {
      await iniciarDb();
      const user = await session(req);
      if (url.pathname === '/api/actividades' && req.method === 'GET') return send(res, 200, {actividades, hoy:fechaBarrio()});
      if (url.pathname === '/api/session' && req.method === 'GET') return send(res, 200, { user: user || null });
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('session='))?.slice(8);
        if (token) await ejecutar('DELETE FROM sessions WHERE token = ?', [token]);
        res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return send(res, 200, {ok:true});
      }
      if (['/api/register', '/api/login'].includes(url.pathname) && req.method === 'POST') {
        const data = await body(req); const email = String(data.email || '').trim().toLowerCase(); const password = String(data.password || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128) return send(res, 400, {error:'Ingresá un email válido y una contraseña de entre 8 y 128 caracteres.'});
        let account = await uno('SELECT * FROM users WHERE email = ?', [email]);
        if (url.pathname === '/api/register') {
          if (account) return send(res, 409, {error:'Ya existe una cuenta con ese email.'});
          const salt = crypto.randomBytes(16).toString('hex'); const hash = crypto.scryptSync(password, salt, 64).toString('hex');
          try { await ejecutar('INSERT INTO users (email, salt, hash) VALUES (?, ?, ?)', [email, salt, hash]); } catch (error) { if (String(error.message).includes('UNIQUE constraint')) return send(res, 409, {error:'Ya existe una cuenta con ese email.'}); throw error; }
          account = await uno('SELECT * FROM users WHERE email = ?', [email]);
        } else if (!account || !crypto.timingSafeEqual(Buffer.from(account.hash, 'hex'), crypto.scryptSync(password, account.salt, 64))) return send(res, 401, {error:'Email o contraseña incorrectos.'});
        const token = crypto.randomBytes(32).toString('hex'); const age = data.recordar ? 30 * 86400 : 86400;
        await ejecutar('DELETE FROM sessions WHERE expires <= ?', [Date.now()]);
        await ejecutar('INSERT INTO sessions VALUES (?, ?, ?)', [token, account.id, Date.now() + age * 1000]);
        res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
        return send(res, 200, {user:{email:account.email}});
      }
      if (url.pathname === '/api/reviews' && req.method === 'GET') return send(res, 200, await todos('SELECT * FROM reviews ORDER BY id DESC'));
      if (url.pathname === '/api/reviews' && req.method === 'POST') {
        const d = await body(req); const nombre = String(d.nombre || '').trim(); const comentario = String(d.comentario || '').trim(); const rating = Number(d.rating);
        if (!nombre || nombre.length > 80 || !comentario || comentario.length > 500 || !Number.isInteger(rating) || rating < 1 || rating > 5) return send(res, 400, {error:'Revisá el nombre, comentario y calificación.'});
        await ejecutar('INSERT INTO reviews (nombre, comentario, rating) VALUES (?, ?, ?)', [nombre, comentario, rating]); return send(res, 201, {ok:true});
      }
      if ((url.pathname === '/api/cart' || url.pathname.startsWith('/api/cart/')) && !user) return send(res, 401, {error:'Iniciá sesión para usar el carrito.'});
      if (url.pathname === '/api/cart' && req.method === 'GET') {
        const items = await obtenerCarrito(user.id);
        return send(res, 200, {items, total: items.reduce((total, item) => total + item.precio, 0)});
      }
      if (url.pathname === '/api/cart' && req.method === 'POST') {
        const d = await body(req);
        if (!turnoValido(d)) return send(res, 400, {error:'Seleccioná un turno disponible.'});
        if (await uno('SELECT id FROM bookings WHERE user_id = ? AND taller = ? AND fecha = ? AND horario = ?', [user.id, d.taller, d.fecha, d.horario])) return send(res, 409, {error:'Ya tenés reservado ese turno.'});
        try { await ejecutar('INSERT INTO cart (user_id, taller, fecha, horario) VALUES (?, ?, ?, ?)', [user.id, d.taller, d.fecha, d.horario]); }
        catch (e) { if (e.message.includes('UNIQUE constraint')) return send(res, 409, {error:'Ese turno ya está en tu carrito.'}); throw e; }
        return send(res, 201, {ok:true});
      }
      if (/^\/api\/cart\/\d+$/.test(url.pathname) && req.method === 'DELETE') {
        const result = await ejecutar('DELETE FROM cart WHERE id = ? AND user_id = ?', [Number(url.pathname.split('/').pop()), user.id]);
        return send(res, result.rowsAffected ? 200 : 404, result.rowsAffected ? {ok:true} : {error:'Elemento no encontrado.'});
      }
      if (url.pathname === '/api/cart/checkout' && req.method === 'POST') {
        const tx = await db.transaction('write');
        try {
          const rows = (await tx.execute({sql:'SELECT id, taller, fecha, horario FROM cart WHERE user_id = ? ORDER BY id', args:[user.id]})).rows;
          const items = rows.map(detalle);
          if (!items.length) { await tx.rollback(); return send(res, 400, {error:'Tu carrito está vacío.'}); }
          if (items.some(item => !turnoValido(item))) { await tx.rollback(); return send(res, 400, {error:'Hay turnos vencidos en el carrito. Eliminalos antes de confirmar.'}); }
          for (const item of items) await tx.execute({sql:'INSERT INTO bookings (user_id, taller, fecha, horario) VALUES (?, ?, ?, ?)', args:[user.id, item.taller, item.fecha, item.horario]});
          await tx.execute({sql:'DELETE FROM cart WHERE user_id = ?', args:[user.id]});
          await tx.commit();
          return send(res, 200, {ok:true, cantidad:items.length, total:items.reduce((total, item) => total + item.precio, 0)});
        } catch (e) {
          await tx.rollback();
          if (String(e.message).includes('UNIQUE constraint')) return send(res, 409, {error:'Uno de los turnos ya está reservado. Eliminalo del carrito para continuar.'});
          throw e;
        }
      }
      if (url.pathname === '/api/bookings' && !user) return send(res, 401, {error:'Iniciá sesión para gestionar tus turnos.'});
      if (url.pathname === '/api/bookings' && req.method === 'GET') return send(res, 200, (await todos('SELECT id, taller, fecha, horario FROM bookings WHERE user_id = ? ORDER BY fecha, horario', [user.id])).map(detalle));
      if (url.pathname === '/api/bookings' && req.method === 'POST') {
        const d = await body(req);
        if (!turnoValido(d)) return send(res, 400, {error:'Seleccioná una actividad disponible.'});
        try { await ejecutar('INSERT INTO bookings (user_id, taller, fecha, horario) VALUES (?, ?, ?, ?)', [user.id, d.taller, d.fecha, d.horario]); } catch (e) { if (e.code?.startsWith('SQLITE_CONSTRAINT') || e.message.includes('UNIQUE constraint')) return send(res, 409, {error:'Ya agendaste ese turno.'}); throw e; }
        return send(res, 201, {ok:true});
      }
      if (/^\/api\/bookings\/\d+$/.test(url.pathname) && req.method === 'DELETE') {
        if (!user) return send(res, 401, {error:'Iniciá sesión.'});
        const result = await ejecutar('DELETE FROM bookings WHERE id = ? AND user_id = ?', [Number(url.pathname.split('/').pop()), user.id]);
        return send(res, result.rowsAffected ? 200 : 404, result.rowsAffected ? {ok:true} : {error:'Turno no encontrado.'});
      }
      return send(res, 404, {error:'Recurso no encontrado.'});
    }
    // Rutas literales permiten que Vercel incluya los archivos en el paquete.
    const files = {
      '/': {content: () => fs.readFileSync(path.join(__dirname, 'index.html')), type: 'text/html'},
      '/index.html': {content: () => fs.readFileSync(path.join(__dirname, 'index.html')), type: 'text/html'},
      '/login.html': {content: () => fs.readFileSync(path.join(__dirname, 'login.html')), type: 'text/html'},
      '/dashboard.html': {content: () => fs.readFileSync(path.join(__dirname, 'dashboard.html')), type: 'text/html'},
      '/styles.css': {content: () => fs.readFileSync(path.join(__dirname, 'styles.css')), type: 'text/css'},
      '/barrio.css': {content: () => fs.readFileSync(path.join(__dirname, 'barrio.css')), type: 'text/css'},
      '/script.js': {content: () => fs.readFileSync(path.join(__dirname, 'script.js')), type: 'text/javascript'}
    };
    const file = files[url.pathname];
    if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); return res.end('No encontrado'); }
    const content = file.content();
    res.writeHead(200, {'Content-Type': `${file.type}; charset=utf-8`, 'Content-Length': content.length});
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) { console.error(error); send(res, 400, {error:'No se pudo procesar la solicitud.'}); }
};
module.exports = handler;
if (!process.env.VERCEL) { iniciarDb().then(() => http.createServer(handler).listen(port, '0.0.0.0', () => console.log(`Sociedad de Fomento disponible en http://localhost:${port}`))).catch(error => { console.error('No se pudo conectar a la base de datos:', error.message); process.exitCode = 1; }); }
