import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './server/src/db/schema/index.ts',
  out: './server/drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/template_app',
  },
});
