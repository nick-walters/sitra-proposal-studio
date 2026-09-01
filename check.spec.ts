import { test, expect } from '@playwright/test';
import fs from 'fs';

test('check app', async ({ page }) => {
  const response = await page.goto('http://localhost:8080');
  console.log('(b) Reachable: SUCCESS');
  console.log('(b) Final URL:', page.url());
  console.log('(b) Title:', await page.title());
  console.log('(b) Status:', response?.status());
  
  const content = await page.content();
  const isAuthenticated = content.includes('Sign Out') || content.includes('Logout') || !content.includes('Sign In');
  console.log('(c) Page appears authenticated (heuristic):', isAuthenticated);
});
