import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    console.log('(a) Playwright Chromium launch: SUCCESS');
    
    const context = await browser.newContext();
    
    // Attempt to restore session if available (logic based on system prompt)
    // "whether session variables/files are available as booleans"
    const sessionFileExists = fs.existsSync('.auth/user.json');
    console.log('(c) Session file (.auth/user.json) exists:', sessionFileExists);
    
    if (sessionFileExists) {
        try {
            await context.addCookies(JSON.parse(fs.readFileSync('.auth/user.json')).cookies);
            console.log('(c) Attempted to restore session from .auth/user.json');
        } catch (e) {
            console.log('(c) Failed to restore session:', e.message);
        }
    }

    const page = await context.newPage();
    try {
      const response = await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
      console.log('(b) Reachable: SUCCESS');
      console.log('(b) Final URL:', page.url());
      console.log('(b) Title:', await page.title());
      console.log('(b) Status:', response?.status());
      
      // (c) Authenticated state check (heuristic)
      const content = await page.content();
      const isAuthenticated = content.includes('Sign Out') || content.includes('Logout') || !content.includes('Sign In');
      console.log('(c) Page appears authenticated (heuristic):', isAuthenticated);
      
    } catch (e) {
      console.log('(b) Reachable: FAILED -', e.message);
    }

  } catch (e) {
    console.log('(a) Playwright Chromium launch: FAILED -', e.message);
  } finally {
    if (browser) await browser.close();
  }
}

run();
