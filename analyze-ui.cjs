const playwrightPath = 'X:/Users/Misak/AppData/Roaming/npm/node_modules/playwright';
const { chromium, devices } = require(playwrightPath);
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const device = devices['Galaxy S24'];
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();
  
  console.log('Navigating to http://localhost:5174...');
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  const viewport = page.viewportSize();
  console.log(`Viewport: ${viewport.width}x${viewport.height}`);
  
  const analysis = await page.evaluate(() => {
    const checkOverlaps = () => {
      const overlaps = [];
      const visibleElements = Array.from(document.querySelectorAll('.ant-btn, .ant-card, .conversation-node, .diagram-shell__nav, .message-composer')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      
      for (let i = 0; i < visibleElements.length; i++) {
        for (let j = i + 1; j < visibleElements.length; j++) {
          const r1 = visibleElements[i].getBoundingClientRect();
          const r2 = visibleElements[j].getBoundingClientRect();
          
          const overlapX = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left);
          const overlapY = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
          
          if (overlapX > 3 && overlapY > 3) {
            overlaps.push({
              element1: visibleElements[i].className || visibleElements[i].tagName,
              element2: visibleElements[j].className || visibleElements[j].tagName,
              overlapArea: Math.round(overlapX * overlapY),
              overlapX: Math.round(overlapX),
              overlapY: Math.round(overlapY)
            });
          }
        }
      }
      return overlaps;
    };
    
    const checkTouchTargets = () => {
      const smallTargets = [];
      const interactive = document.querySelectorAll('button, a, input, .ant-btn, [role="button"]');
      
      interactive.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (rect.width < 44 || rect.height < 44) {
            smallTargets.push({
              element: el.className || el.tagName,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              text: el.textContent?.trim().substring(0, 30) || ''
            });
          }
        }
      });
      return smallTargets;
    };
    
    const checkTextOverflow = () => {
      const overflowed = [];
      const textElements = document.querySelectorAll('.ant-typography, .ant-btn, label, span, p');
      
      textElements.forEach(el => {
        if (el.scrollWidth > el.clientWidth + 2) {
          overflowed.push({
            element: el.className || el.tagName,
            text: el.textContent?.trim().substring(0, 50) || '',
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth
          });
        }
      });
      return overflowed;
    };
    
    const checkCentering = () => {
      const notCentered = [];
      const candidates = document.querySelectorAll('.conversation-canvas__composer-shell, .conversation-node, .ant-modal-content');
      
      candidates.forEach(el => {
        const rect = el.getBoundingClientRect();
        const parent = el.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          const expectedLeft = (parentRect.width - rect.width) / 2;
          const actualLeft = rect.left - parentRect.left;
          
          if (Math.abs(expectedLeft - actualLeft) > 3) {
            notCentered.push({
              element: el.className,
              expectedLeft: Math.round(expectedLeft),
              actualLeft: Math.round(actualLeft),
              diff: Math.round(Math.abs(expectedLeft - actualLeft))
            });
          }
        }
      });
      return notCentered;
    };
    
    const checkSpacing = () => {
      const spacingIssues = [];
      const containers = document.querySelectorAll('.diagram-shell, .conversation-canvas, .message-composer, .ant-space');
      
      containers.forEach(container => {
        const children = Array.from(container.children).filter(c => {
          const rect = c.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        
        for (let i = 0; i < children.length - 1; i++) {
          const r1 = children[i].getBoundingClientRect();
          const r2 = children[i + 1].getBoundingClientRect();
          
          const verticalGap = r2.top - r1.bottom;
          const horizontalGap = r2.left - r1.right;
          
          if (verticalGap < -2) {
            spacingIssues.push({
              type: 'negative-vertical-gap',
              container: container.className,
              gap: Math.round(verticalGap),
              element1: children[i].className,
              element2: children[i + 1].className
            });
          } else if (verticalGap > 80) {
            spacingIssues.push({
              type: 'large-vertical-gap',
              container: container.className,
              gap: Math.round(verticalGap)
            });
          }
        }
      });
      return spacingIssues;
    };
    
    const checkProportions = () => {
      const proportionIssues = [];
      const elements = document.querySelectorAll('.conversation-node, .ant-card, .ant-btn');
      
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 30 && rect.height > 15) {
          const ratio = rect.width / rect.height;
          if (ratio > 6 || ratio < 0.15) {
            proportionIssues.push({
              element: el.className,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              ratio: ratio.toFixed(2)
            });
          }
        }
      });
      return proportionIssues;
    };
    
    const getLayoutInfo = () => {
      const nav = document.querySelector('.diagram-shell__nav');
      const composerShell = document.querySelector('.conversation-canvas__composer-shell');
      const composer = document.querySelector('.message-composer');
      const canvas = document.querySelector('.conversation-canvas');
      
      return {
        nav: nav ? {
          exists: true,
          width: nav.getBoundingClientRect().width,
          height: nav.getBoundingClientRect().height,
          top: nav.getBoundingClientRect().top,
          left: nav.getBoundingClientRect().left
        } : { exists: false },
        composerShell: composerShell ? {
          exists: true,
          className: composerShell.className,
          width: composerShell.getBoundingClientRect().width,
          height: composerShell.getBoundingClientRect().height,
          bottom: composerShell.getBoundingClientRect().bottom,
          left: composerShell.getBoundingClientRect().left,
          offsetLeft: composerShell.offsetLeft,
          computedLeft: window.getComputedStyle(composerShell).left,
          computedTransform: window.getComputedStyle(composerShell).transform,
          computedMarginLeft: window.getComputedStyle(composerShell).marginLeft,
          computedBorderLeft: window.getComputedStyle(composerShell).borderLeftWidth,
          parentClassName: composerShell.parentElement?.className,
          parentPaddingLeft: composerShell.parentElement ? window.getComputedStyle(composerShell.parentElement).paddingLeft : null,
          parentBoundingClientRect: composerShell.parentElement ? {
            left: composerShell.parentElement.getBoundingClientRect().left,
            width: composerShell.parentElement.getBoundingClientRect().width
          } : null,
          grandParentClassName: composerShell.parentElement?.parentElement?.className,
          grandParentPaddingLeft: composerShell.parentElement?.parentElement ? window.getComputedStyle(composerShell.parentElement.parentElement).paddingLeft : null,
          grandParentMarginLeft: composerShell.parentElement?.parentElement ? window.getComputedStyle(composerShell.parentElement.parentElement).marginLeft : null,
          grandParentBoundingClientRect: composerShell.parentElement?.parentElement ? {
            left: composerShell.parentElement.parentElement.getBoundingClientRect().left,
            width: composerShell.parentElement.parentElement.getBoundingClientRect().width
          } : null,
          greatGrandParentClassName: composerShell.parentElement?.parentElement?.parentElement?.className,
          greatGrandParentPadding: composerShell.parentElement?.parentElement?.parentElement ? window.getComputedStyle(composerShell.parentElement.parentElement.parentElement).padding : null,
          greatGrandParentBoundingClientRect: composerShell.parentElement?.parentElement?.parentElement ? {
            left: composerShell.parentElement.parentElement.parentElement.getBoundingClientRect().left,
            width: composerShell.parentElement.parentElement.parentElement.getBoundingClientRect().width
          } : null,
          greatGreatGrandParentClassName: composerShell.parentElement?.parentElement?.parentElement?.parentElement?.className,
          greatGreatGrandParentPadding: composerShell.parentElement?.parentElement?.parentElement?.parentElement ? window.getComputedStyle(composerShell.parentElement.parentElement.parentElement.parentElement).padding : null,
          greatGreatGrandParentBoundingClientRect: composerShell.parentElement?.parentElement?.parentElement?.parentElement ? {
            left: composerShell.parentElement.parentElement.parentElement.parentElement.getBoundingClientRect().left,
            width: composerShell.parentElement.parentElement.parentElement.parentElement.getBoundingClientRect().width
          } : null,
          rootParentClassName: composerShell.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.className,
          rootParentPadding: composerShell.parentElement?.parentElement?.parentElement?.parentElement?.parentElement ? window.getComputedStyle(composerShell.parentElement.parentElement.parentElement.parentElement.parentElement).padding : null,
          rootParentBoundingClientRect: composerShell.parentElement?.parentElement?.parentElement?.parentElement?.parentElement ? {
            left: composerShell.parentElement.parentElement.parentElement.parentElement.parentElement.getBoundingClientRect().left,
            width: composerShell.parentElement.parentElement.parentElement.parentElement.parentElement.getBoundingClientRect().width
          } : null
        } : { exists: false },
        composer: composer ? {
          exists: true,
          className: composer.className,
          width: composer.getBoundingClientRect().width,
          height: composer.getBoundingClientRect().height,
          bottom: composer.getBoundingClientRect().bottom,
          left: composer.getBoundingClientRect().left
        } : { exists: false },
        canvas: canvas ? {
          exists: true,
          width: canvas.getBoundingClientRect().width,
          height: canvas.getBoundingClientRect().height
        } : { exists: false }
      };
    };
    
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      layout: getLayoutInfo(),
      overlaps: checkOverlaps(),
      touchTargets: checkTouchTargets(),
      textOverflow: checkTextOverflow(),
      centering: checkCentering(),
      spacing: checkSpacing(),
      proportions: checkProportions()
    };
  });
  
  console.log('\n========================================');
  console.log('       UI ANALYSIS REPORT');
  console.log('========================================\n');
  
  console.log('Viewport:', analysis.viewport);
  console.log('\nLayout Info:', JSON.stringify(analysis.layout, null, 2));
  
  console.log('\n--- OVERLAP ISSUES ---');
  if (analysis.overlaps.length === 0) {
    console.log('No overlaps detected');
  } else {
    analysis.overlaps.forEach(o => {
      console.log(`  [!] ${o.element1?.substring(0, 50)} overlaps ${o.element2?.substring(0, 50)}`);
      console.log(`      Overlap area: ${o.overlapArea}px² (${o.overlapX}x${o.overlapY})`);
    });
  }
  
  console.log('\n--- TOUCH TARGET ISSUES ---');
  if (analysis.touchTargets.length === 0) {
    console.log('All touch targets meet minimum size (44px)');
  } else {
    analysis.touchTargets.forEach(t => {
      console.log(`  [!] "${t.text}" - ${t.width}x${t.height}px (min: 44x44)`);
    });
  }
  
  console.log('\n--- TEXT OVERFLOW ISSUES ---');
  if (analysis.textOverflow.length === 0) {
    console.log('No text overflow detected');
  } else {
    analysis.textOverflow.slice(0, 5).forEach(t => {
      console.log(`  [!] "${t.text}..." - overflow: ${t.scrollWidth - t.clientWidth}px`);
    });
  }
  
  console.log('\n--- CENTERING ISSUES ---');
  if (analysis.centering.length === 0) {
    console.log('All checked elements are properly centered');
  } else {
    analysis.centering.forEach(c => {
      console.log(`  [!] ${c.element?.substring(0, 50)}`);
      console.log(`      Expected left: ${c.expectedLeft}px, Actual: ${c.actualLeft}px, Diff: ${c.diff}px`);
    });
  }
  
  console.log('\n--- SPACING ISSUES ---');
  if (analysis.spacing.length === 0) {
    console.log('No spacing issues detected');
  } else {
    analysis.spacing.forEach(s => {
      console.log(`  [!] ${s.type}: ${s.gap}px in ${s.container?.substring(0, 30)}`);
    });
  }
  
  console.log('\n--- PROPORTION ISSUES ---');
  if (analysis.proportions.length === 0) {
    console.log('All proportions are reasonable');
  } else {
    analysis.proportions.forEach(p => {
      console.log(`  [!] ${p.element?.substring(0, 50)} - ${p.width}x${p.height}px (ratio: ${p.ratio})`);
    });
  }
  
  console.log('\n========================================');
  console.log('           SUMMARY');
  console.log('========================================');
  console.log(`Overlaps: ${analysis.overlaps.length}`);
  console.log(`Touch Target Issues: ${analysis.touchTargets.length}`);
  console.log(`Text Overflow Issues: ${analysis.textOverflow.length}`);
  console.log(`Centering Issues: ${analysis.centering.length}`);
  console.log(`Spacing Issues: ${analysis.spacing.length}`);
  console.log(`Proportion Issues: ${analysis.proportions.length}`);
  console.log('========================================\n');
  
  fs.writeFileSync('screenshots/ui-analysis.json', JSON.stringify(analysis, null, 2));
  console.log('Detailed analysis saved to screenshots/ui-analysis.json');
  
  await browser.close();
})();
