import type { Page } from '@playwright/test';

export type TouchEventType = 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel';

export async function emitTouch(
  page: Page,
  selector: string,
  type: TouchEventType,
  x: number,
  y: number,
): Promise<void> {
  await page.locator(selector).evaluate((element, input) => {
    const event = new Event(input.type, { bubbles: true, cancelable: true });
    const touch = { identifier: 41, clientX: input.x, clientY: input.y, target: element };
    Object.defineProperty(event, 'touches', {
      value: input.type === 'touchend' || input.type === 'touchcancel' ? [] : [touch],
    });
    Object.defineProperty(event, 'changedTouches', { value: [touch] });
    element.dispatchEvent(event);
  }, { type, x, y });
}

export async function readOffset(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41);
}
