import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const browser = await chromium.launch({ headless: true });
  
  const device = devices['Galaxy S24'];
  const context = await browser.newContext({
    ...device,
  });
  
  const page = await context.newPage();
  
  console.log('Navigating to http://localhost:5174...');
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
  
  await page.waitForTimeout(2000);
  
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  
  const viewport = page.viewportSize();
  console.log(`Viewport: ${viewport.width}x${viewport.height}`);
  
  await page.screenshot({ 
    path: path.join(screenshotDir, 'mobile-home.png'),
    fullPage: true 
  });
  console.log('Screenshot saved: mobile-home.png');
  
  const navTrigger = await page.$('.diagram-shell__nav-trigger');
  if (navTrigger) {
    await navTrigger.click();
    await page.waitForTimeout(500);
    await page.screenshot({ 
      path: path.join(screenshotDir, 'mobile-nav-open.png'),
      fullPage: true 
    });
    console.log('Screenshot saved: mobile-nav-open.png');
  }
  
  const elements = await page.evaluate(() => {
    const issues = [];
    
    const checkOverlap = (elements) => {
      const rects = [];
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          rects.push({ el, rect });
        }
      });
      
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const r1 = rects[i].rect;
          const r2 = rects[j].rect;
          
          if (!(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom)) {
            const overlapX = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left);
            const overlapY = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
            
            if (overlapX > 5 && overlapY > 5) {
              issues.push({
                type: 'overlap',
                element1: rects[i].el.className,
                element2: rects[j].el.className,
                overlap: { x: overlapX, y: overlapY }
              });
            }
          }
        }
      }
    };
    
    const checkCentering = () => {
      const issues = [];
      const centerElements = document.querySelectorAll('[class*="center"], [style*="center"]');
      
      centerElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const parent = el.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          const expectedLeft = (parentRect.width - rect.width) / 2;
          const actualLeft = rect.left - parentRect.left;
          
          if (Math.abs(expectedLeft - actualLeft) > 5) {
            issues.push({
              type: 'not-centered',
              element: el.className,
              expectedLeft: expectedLeft.toFixed(2),
              actualLeft: actualLeft.toFixed(2)
            });
          }
        }
      });
      
      return issues;
    };
    
    const checkProportions = () => {
      const issues = [];
      const cards = document.querySelectorAll('.conversation-node, .ant-card, .ant-btn');
      
      cards.forEach(el => {
        const rect = el.getBoundingClientRect();
        const ratio = rect.width / rect.height;
        
        if (rect.width > 50 && rect.height > 20) {
          if (ratio > 5 || ratio < 0.2) {
            issues.push({
              type: 'unusual-proportion',
              element: el.className,
              width: rect.width,
              height: rect.height,
              ratio: ratio.toFixed(2)
            });
          }
        }
      });
      
      return issues;
    };
    
    const checkSpacing = () => {
      const issues = [];
      const containers = document.querySelectorAll('.diagram-shell, .conversation-canvas, .message-composer');
      
      containers.forEach(container => {
        const children = container.children;
        for (let i = 0; i < children.length - 1; i++) {
          const rect1 = children[i].getBoundingClientRect();
          const rect2 = children[i + 1].getBoundingClientRect();
          
          const gap = rect2.top - rect1.bottom;
          
          if (gap < -5) {
            issues.push({
              type: 'negative-gap',
              parent: container.className,
              gap: gap.toFixed(2)
            });
          } else if (gap > 100) {
            issues.push({
              type: 'large-gap',
              parent: container.className,
              gap: gap.toFixed(2)
            });
          }
        }
      });
      
      return issues;
    };
    
    const checkOverflow = () => {
      const issues = [];
      const elements = document.querySelectorAll('*');
      
      elements.forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.overflowX === 'hidden' || style.overflowY === 'hidden') {
          if (el.scrollWidth > el.clientWidth + 5 || el.scrollHeight > el.clientHeight + 5) {
            issues.push({
              type: 'overflow-hidden',
              element: el.className || el.tagName,
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight
            });
          }
        }
      });
      
      return issues.slice(0, 10);
    };
    
    const checkTextTruncation = () => {
      const issues = [];
      const textElements = document.querySelectorAll('.ant-typography, .ant-btn, label');
      
      textElements.forEach(el => {
        if (el.scrollWidth > el.clientWidth + 2) {
          issues.push({
            type: 'text-truncated',
            element: el.className,
            text: el.textContent?.substring(0, 30),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth
          });
        }
      });
      
      return issues;
    };
    
    const checkTouchTargets = () => {
      const issues = [];
      const interactiveElements = document.querySelectorAll('button, a, input, [role="button"], .ant-btn');
      
      interactiveElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (rect.width < 44 || rect.height < 44) {
            issues.push({
              type: 'small-touch-target',
              element: el.className,
              width: rect.width,
              height: rect.height,
              text: el.textContent?.substring(0, 20)
            });
          }
        }
      });
      
      return issues;
    };
    
    const visibleButtons = Array.from(document.querySelectorAll('.ant-btn')).filter(btn => {
      const rect = btn.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    
    checkOverlap(visibleButtons);
    
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      centeringIssues: checkCentering(),
      proportionIssues: checkProportions(),
      spacingIssues: checkSpacing(),
      overflowIssues: checkOverflow(),
      overlapIssues: issues,
      textTruncationIssues: checkTextTruncation(),
      touchTargetIssues: checkTouchTargets()
    };
  });
  
  console.log('\n=== UI Analysis Results ===');
  console.log('Viewport:', elements.viewport);
  console.log('\nCentering Issues:', elements.centeringIssues.length);
  elements.centeringIssues.forEach(issue => console.log('  -', issue));
  
  console.log('\nProportion Issues:', elements.proportionIssues.length);
  elements.proportionIssues.slice(0, 5).forEach(issue => console.log('  -', issue));
  
  console.log('\nSpacing Issues:', elements.spacingIssues.length);
  elements.spacingIssues.forEach(issue => console.log('  -', issue));
  
  console.log('\nOverflow Issues:', elements.overflowIssues.length);
  elements.overflowIssues.forEach(issue => console.log('  -', issue));
  
  console.log('\nOverlap Issues:', elements.overlapIssues.length);
  elements.overlapIssues.forEach(issue => console.log('  -', issue));
  
  console.log('\nText Truncation Issues:', elements.textTruncationIssues.length);
  elements.textTruncationIssues.slice(0, 5).forEach(issue => console.log('  -', issue));
  
  console.log('\nTouch Target Issues:', elements.touchTargetIssues.length);
  elements.touchTargetIssues.forEach(issue => console.log('  -', issue));
  
  fs.writeFileSync(
    path.join(screenshotDir, 'ui-analysis.json'),
    JSON.stringify(elements, null, 2)
  );
  console.log('\nAnalysis saved to ui-analysis.json');
  
  await browser.close();
})();
