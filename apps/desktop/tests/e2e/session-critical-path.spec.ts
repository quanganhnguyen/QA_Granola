/**
 * E2E tests for critical session flows.
 * These tests run against the built Electron app using Playwright.
 *
 * To run: npm run test:e2e
 * Requires: npm run build first, and ANTHROPIC_API_KEY in environment.
 */
import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const APP_PATH = path.join(__dirname, '../../dist/electron/main.js');

async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const userDataDir = path.join(os.tmpdir(), `qa-nola-e2e-${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const app = await electron.launch({
    args: [APP_PATH],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      QA_NOLA_USER_DATA: userDataDir,
    },
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

test.describe('Critical Session Flows (P2)', () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    ({ app, page } = await launchApp());
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('P2-1: clicking Record starts a new session', async () => {
    await page.click('button:has-text("Record")');
    await expect(page.locator('.session-state-badge.recording, .session-state-badge:has-text("live")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.status-dot.recording')).toBeVisible();
  });

  test('P2-2: clicking Stop transitions session to stopped', async () => {
    await page.click('button:has-text("Record")');
    await page.waitForSelector('.btn-record.stop');
    await page.click('button:has-text("Stop")');
    await expect(page.locator('.btn-record.start')).toBeVisible({ timeout: 5000 });
  });

  test('P2-3: clicking Record again resumes same session', async () => {
    await page.click('button:has-text("Record")');
    await page.waitForSelector('.btn-record.stop');
    await page.click('button:has-text("Stop")');
    await page.waitForSelector('.btn-record.start');

    const sessionTitleBefore = await page.locator('.session-toolbar-title').textContent();
    await page.click('button:has-text("Resume")');
    const sessionTitleAfter = await page.locator('.session-toolbar-title').textContent();

    expect(sessionTitleAfter).toBe(sessionTitleBefore);
  });

  test('P2-4: New Session button starts fresh context', async () => {
    await page.click('button:has-text("Record")');
    await page.waitForSelector('.btn-record.stop');
    await page.click('button:has-text("Stop")');

    const sessionCountBefore = await page.locator('.session-item').count();
    await page.click('.btn-new-session');
    const sessionCountAfter = await page.locator('.session-item').count();
    expect(sessionCountAfter).toBeGreaterThan(sessionCountBefore);
  });

  test('Notes panel opens and accepts input', async () => {
    await page.click('button:has-text("Record")');
    await page.waitForSelector('.btn-record.stop');
    await page.click('button:has-text("Notes")');
    await expect(page.locator('.notes-textarea')).toBeVisible();
    await page.fill('.notes-textarea', '## Test Notes\n- Item 1');
    const value = await page.inputValue('.notes-textarea');
    expect(value).toContain('Test Notes');
  });

  test('Merge button appears after stopping recording', async () => {
    await page.click('button:has-text("Record")');
    await page.waitForSelector('.btn-record.stop');
    await page.click('button:has-text("Stop")');
    await expect(page.locator('.btn-merge')).toBeVisible({ timeout: 5000 });
  });
});
