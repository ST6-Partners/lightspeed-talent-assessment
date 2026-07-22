-- Generic DB-backed file storage for uploads (work sample files).
-- The app runs on Railway where Replit object storage is not available, so
-- uploaded files are stored here as base64 text and served via /api/uploaded/:key.

CREATE TABLE IF NOT EXISTS "uploaded_files" (
  "key" text PRIMARY KEY,
  "filename" text,
  "mime_type" text,
  "data" text NOT NULL,
  "created_at" timestamptz DEFAULT now()
);
