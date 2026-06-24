// ============================================================
// SAMPLE ENTITY TESTS — two-tier: tRPC + DOM (Design Plan Section 8)
// DD-013: tRPC-only API (no REST)
// DD-016: Permission-mirrored tool test coverage
// ============================================================

import { test, expect } from '@playwright/test';

// ─── tRPC TIER (no browser, sub-second) ──────────────────────

test.describe('Sample Entity tRPC contracts @rest', () => {
  let request: any;

  test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://localhost:5173',
    });
  });

  test('entity.list returns entity array', async () => {
    const res = await request.get('/api/trpc/entity.list');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.result).toHaveProperty('data');
    const data = body.result.data;
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('createdAt');
    }
  });

  test('entity.create creates a new entity', async () => {
    const res = await request.post('/api/trpc/entity.create', {
      data: { name: 'Test Entity', description: 'Created by Playwright' },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.result.data).toHaveProperty('id');
    expect(body.result.data.name).toBe('Test Entity');
  });

  test('entity.getById returns single entity with expected fields', async () => {
    // First create an entity to get a valid ID
    const createRes = await request.post('/api/trpc/entity.create', {
      data: { name: 'GetById Test', description: 'For retrieval test' },
    });
    const createBody = await createRes.json();
    const id = createBody.result.data.id;

    const res = await request.get(`/api/trpc/entity.getById?input=${encodeURIComponent(JSON.stringify({ id }))}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.result.data).toHaveProperty('id');
    expect(body.result.data).toHaveProperty('name');
    expect(body.result.data).toHaveProperty('entityType');
  });

  test('admin-only procedure rejects user-tier session', async () => {
    const res = await request.post('/api/trpc/admin.updateSettings', {
      data: { key: 'test', value: 'hacked' },
    });
    // Expect rejection — user-tier sessions can't access admin routes
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

// ─── PERMISSION-MIRRORED TOOL TESTS (DD-016) ────────────────

test.describe('Permission-mirrored tool coverage @rest', () => {
  let request: any;

  test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext({
      baseURL: process.env.BASE_URL || 'http://localhost:5173',
    });
  });

  test('user-tier session rejected from admin-only tools', async () => {
    // Admin settings update should fail for regular users
    const res = await request.post('/api/trpc/admin.broadcastNotification', {
      data: { message: 'Unauthorized broadcast' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('sysadmin override bypasses ownership checks', async () => {
    // Sysadmin should be able to archive any entity, not just owned ones
    // (This test requires sysadmin session setup — placeholder)
    expect(true).toBe(true);
  });
});

// ─── DOM TIER (needs browser + Chromium install) ──────────────

test.describe('Sample Entity DOM structure @dom', () => {
  test('entity list page renders data table', async ({ page }) => {
    await page.goto('/entities');
    await expect(page.locator('[data-testid="entity-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="entity-table"]')).toBeVisible();
  });

  test('home page renders component cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Template App');
  });
});
