export type FocusBoundaryOptions = {
  active: boolean;
  initialFocus?: string;
};

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function focusBoundary(node: HTMLElement, initialOptions: FocusBoundaryOptions) {
  let options = initialOptions;
  let active = false;
  let restoreTarget: HTMLElement | null = null;

  function focusableElements() {
    return Array.from(node.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
      if (element.hidden || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function focusInitial() {
    const preferred = options.initialFocus
      ? node.querySelector<HTMLElement>(options.initialFocus)
      : null;
    const target = preferred && focusableElements().includes(preferred)
      ? preferred
      : focusableElements()[0] ?? node;
    target.focus();
  }

  function handleFocusIn(event: FocusEvent) {
    if (!active || node.contains(event.target as Node)) return;
    focusInitial();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!active || event.key !== 'Tab') return;
    const focusable = focusableElements();

    if (focusable.length === 0) {
      event.preventDefault();
      node.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  function activate() {
    if (active) return;
    active = true;
    restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.addEventListener('focusin', handleFocusIn);
    node.addEventListener('keydown', handleKeydown);
    queueMicrotask(() => {
      if (active && node.isConnected) focusInitial();
    });
  }

  function deactivate() {
    if (!active) return;
    active = false;
    document.removeEventListener('focusin', handleFocusIn);
    node.removeEventListener('keydown', handleKeydown);
    const target = restoreTarget;
    restoreTarget = null;
    queueMicrotask(() => {
      if (target?.isConnected) {
        target.focus();
        return;
      }
      const heading = document.querySelector<HTMLElement>('h1, [role="heading"][aria-level="1"]');
      if (!heading) return;
      const hadTabindex = heading.hasAttribute('tabindex');
      if (!hadTabindex) heading.setAttribute('tabindex', '-1');
      heading.focus();
      if (!hadTabindex) heading.removeAttribute('tabindex');
    });
  }

  if (options.active) activate();

  return {
    update(nextOptions: FocusBoundaryOptions) {
      options = nextOptions;
      if (options.active) activate();
      else deactivate();
    },
    destroy() {
      deactivate();
    },
  };
}
