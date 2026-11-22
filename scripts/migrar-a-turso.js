const { DatabaseSync } = require('node:sqlite');
const { createClient } = require('@libsql/client');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env;
  if (!url || !authToken || !url.startsWith('libsql://')) throw new Error('Configurá TURSO_DATABASE_URL y TURSO_AUTH_TOKEN de la base de Turso en .env.');
  const source = process.env.MIGRATION_SQLITE_PATH || path.join(__dirname, '..', 'data', 'talleres.sqlite');
  if (!fs.existsSync(source)) throw new Error('No se encontró la base local; verificá MIGRATION_SQLITE_PATH.');
  const local = new DatabaseSync(source, {readOnly:true});
  const remote = createClient({url, authToken});
  const tables = {
    users: {columns:['id','email','salt','hash'], schema:'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL)'},
    reviews: {columns:['id','nombre','comentario','rating'], schema:'CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, comentario TEXT NOT NULL, rating INTEGER NOT NULL)'},
    bookings: {columns:['id','user_id','taller','fecha','horario'], schema:'CREATE TABLE IF NOT EXISTS bookings (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), taller TEXT NOT NULL, fecha TEXT NOT NULL, horario TEXT NOT NULL, UNIQUE(user_id, taller, fecha, horario))'},
    cart: {columns:['id','user_id','taller','fecha','horario'], schema:'CREATE TABLE IF NOT EXISTS cart (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), taller TEXT NOT NULL, fecha TEXT NOT NULL, horario TEXT NOT NULL, UNIQUE(user_id, taller, fecha, horario))'}
  };
  const tx = await remote.transaction('write');
  try {
    for (const {schema} of Object.values(tables)) await tx.execute(schema);
    await tx.execute('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL)');
    for (const table of [...Object.keys(tables),'sessions']) {
      const count = (await tx.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n;
      if (Number(count) !== 0) throw new Error('La base Turso no está vacía. No se modificaron datos; elegí una base vacía para la migración.');
    }
    const counts = {};
    for (const [table, {columns}] of Object.entries(tables)) {
      const rows = local.prepare(`SELECT ${columns.join(',')} FROM ${table}`).all();
      const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
      for (const row of rows) await tx.execute({sql, args:columns.map(col => row[col])});
      counts[table] = rows.length;
    }
    await tx.commit();
    console.log('Migración terminada. Registros por tabla:', counts);
    console.log('Las sesiones no se copiaron; cada usuario debe iniciar sesión nuevamente.');
  } catch (error) { await tx.rollback(); throw error; }
  finally { local.close(); remote.close(); }
}
main().catch(error => { console.error('No se pudo completar la migración:', error.message); process.exitCode = 1; });
