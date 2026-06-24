import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './db/schema/index.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/template_app',
});

export const db = drizzle(pool, { schema });
export { pool };
export type DrizzleClient = typeof db;
