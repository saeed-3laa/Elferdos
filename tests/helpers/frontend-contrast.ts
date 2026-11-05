import type { Page } from "@playwright/test";

export async function measureFrontendContrast(page: Page) {
  return page.evaluate(() => {
    type Color = [number, number, number, number];
    function color(value: string): Color {
      const numbers = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0, numbers[3] ?? 1];
    }
    function blend(foreground: Color, background: Color): Color {
      const alpha = foreground[3];
      return [foreground[0] * alpha + background[0] * (1 - alpha), foreground[1] * alpha + background[1] * (1 - alpha), foreground[2] * alpha + background[2] * (1 - alpha), 1];
    }
    function background(element: Element | null): Color {
      return element ? blend(color(getComputedStyle(element).backgroundColor), background(element.parentElement)) : [255, 255, 255, 1];
    }
    function luminance(rgb: Color) {
      const linear = rgb.slice(0, 3).map(value => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; });
      return linear[0]! * .2126 + linear[1]! * .7152 + linear[2]! * .0722;
    }
    function ratio(foreground: Color, bg: Color) {
      const a = luminance(blend(foreground, bg)), b = luminance(bg);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    }
    function visible(element: Element) {
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
      }
      return element.getClientRects().length > 0 && !element.closest(":disabled");
    }
    const text: { text: string; selector: string; foreground: string; background: Color; ratio: number; minimum: number }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, element = node.parentElement;
      if (!element || !node.textContent?.trim() || !visible(element) || element.closest("script,style,svg,option")) continue;
      const style = getComputedStyle(element), bg = background(element);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.6667 && Number(style.fontWeight) >= 700);
      text.push({ text: node.textContent.trim().slice(0, 90), selector: `${element.tagName}.${element.className}`, foreground: style.color, background: bg, ratio: ratio(color(style.color), bg), minimum: large ? 3 : 4.5 });
    }
    for (const element of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[placeholder],textarea[placeholder]")) {
      if (!visible(element) || element.value) continue;
      const style = getComputedStyle(element, "::placeholder"), bg = background(element), foreground = color(style.color);
      foreground[3] *= Number(style.opacity);
      text.push({ text: element.placeholder, selector: `${element.tagName}::placeholder`, foreground: style.color, background: bg, ratio: ratio(foreground, bg), minimum: 4.5 });
    }
    const controls = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:not([type=hidden]),select,textarea")].filter(visible).map(element => {
      const style = getComputedStyle(element), bg = background(element);
      // Native checkbox/radio rendering is controlled by the browser. Text
      // inputs without a border inside a stepper use the group's boundary.
      const boundary = element.closest(".quantity-stepper") ?? element;
      const border = getComputedStyle(boundary);
      return { label: element.getAttribute("aria-label") ?? element.getAttribute("name") ?? element.tagName,
        native: element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type),
        border: border.borderTopColor, borderWidth: parseFloat(border.borderTopWidth),
        borderRatio: Math.min(ratio(color(border.borderTopColor), background(boundary)), ratio(color(border.borderTopColor), background(boundary.parentElement))),
        focused: element.matches(":focus-visible"), outline: style.outlineColor, outlineWidth: parseFloat(style.outlineWidth),
        outlineRatio: Math.min(ratio(color(style.outlineColor), bg), ratio(color(style.outlineColor), background(element.parentElement))),
      };
    });
    return { text, controls };
  });
}
