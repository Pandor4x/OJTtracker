const { Client } = require('pg');

// Config via env or defaults (match server.js)
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || 'yourpassword';
const host = process.env.PGHOST || 'localhost';
const port = process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432;
const dbName = process.env.PGDATABASE || 'ojt_tracker';

async function main(){
  const client = new Client({ user, password, host, port, database: 'postgres' });
  try{
    await client.connect();
    const r = await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[dbName]);
    if(r.rows.length>0){
      console.log(`Database '${dbName}' already exists.`);
    } else {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database '${dbName}' created.`);
    }
  }catch(err){
    console.error('Error creating database:', err.message || err);
  }finally{
    await client.end();
  }
}

main();
