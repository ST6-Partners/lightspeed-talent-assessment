-- Seed Core Data master lists from AI-Engagement-Departments-and-Titles.xlsx (uploaded by Jade).
-- Idempotent: each row inserts only if a row with the same name doesn't already exist.
-- Titles are department-agnostic per the source sheet (department left null).

INSERT INTO "departments" ("name") SELECT 'Engineering' WHERE NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'Engineering');
INSERT INTO "departments" ("name") SELECT 'Product' WHERE NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'Product');
INSERT INTO "departments" ("name") SELECT 'Design' WHERE NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'Design');
INSERT INTO "departments" ("name") SELECT 'Marketing' WHERE NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'Marketing');
INSERT INTO "departments" ("name") SELECT 'Sales' WHERE NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'Sales');
INSERT INTO "departments" ("name") SELECT 'Customer Success' WHERE NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'Customer Success');
INSERT INTO "departments" ("name") SELECT 'People / HR' WHERE NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'People / HR');
INSERT INTO "departments" ("name") SELECT 'Finance / G&A' WHERE NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'Finance / G&A');
INSERT INTO "departments" ("name") SELECT 'Analytics' WHERE NOT EXISTS (SELECT 1 FROM "departments" WHERE "name" = 'Analytics');

INSERT INTO "titles" ("name","level") SELECT 'Software Engineer I','L2' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Software Engineer I');
INSERT INTO "titles" ("name","level") SELECT 'Software Engineer II','L3' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Software Engineer II');
INSERT INTO "titles" ("name","level") SELECT 'Senior Software Engineer','L4' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Senior Software Engineer');
INSERT INTO "titles" ("name","level") SELECT 'Staff Engineer','L5' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Staff Engineer');
INSERT INTO "titles" ("name","level") SELECT 'Engineering Manager','M1' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Engineering Manager');
INSERT INTO "titles" ("name","level") SELECT 'Product Manager','L4' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Product Manager');
INSERT INTO "titles" ("name","level") SELECT 'Senior Product Manager','L5' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Senior Product Manager');
INSERT INTO "titles" ("name","level") SELECT 'Product Designer','L3' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Product Designer');
INSERT INTO "titles" ("name","level") SELECT 'Designer','L3' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Designer');
INSERT INTO "titles" ("name","level") SELECT 'Data Scientist','L4' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Data Scientist');
INSERT INTO "titles" ("name","level") SELECT 'Senior Analyst','L4' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Senior Analyst');
INSERT INTO "titles" ("name","level") SELECT 'Analyst','L3' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Analyst');
INSERT INTO "titles" ("name","level") SELECT 'Account Executive','L3' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Account Executive');
INSERT INTO "titles" ("name","level") SELECT 'Support Specialist','L2' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Support Specialist');
INSERT INTO "titles" ("name","level") SELECT 'Support Lead','L3' WHERE NOT EXISTS (SELECT 1 FROM "titles" WHERE "name" = 'Support Lead');
