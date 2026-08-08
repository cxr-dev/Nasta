let body: HTMLElement | null | undefined;

/**
 * Moves a node to `document.body` (SSR-safe).
 *
 * This escapes any transformed ancestor (which would otherwise act as a
 * containing block for `position: fixed` descendants), so overlays/popovers
 * position against the viewport regardless of where they are mounted.
 *
 * Svelte runs actions synchronously just before inserting the element into
 * the DOM, so the initial move is deferred with `queueMicrotask` — by the
 * time it runs, the node is connected. A node is only portaled while
 * `enabled` is truthy; toggling it moves the node back to its original
 * location. Cleanup removes the node from the body — the same node the
 * application's tear-down path would detach anyway.
 */
export function portal(node: HTMLElement, enabled = true) {
  // Server render: nothing to attach to. The node is already created in the
  // document at its static location, so leave it there.
  if (typeof document === 'undefined') return;

  body ??= document.body ?? null;
  let originalParent: Node | null = null;

  function apply() {
    if (!body) return;
    if (enabled && node.isConnected) {
      if (node.parentNode !== body) {
        originalParent = node.parentNode;
        body.appendChild(node);
      }
    } else if (!enabled && originalParent && node.parentNode === body) {
      originalParent.appendChild(node);
    }
  }

  if (node.isConnected) {
    apply();
  } else {
    // Defer until Svelte has inserted the node into the DOM.
    queueMicrotask(apply);
  }

  return {
    update(next: boolean) {
      enabled = next;
      apply();
    },
    destroy() {
      if (node.parentNode === body) {
        node.remove();
      }
    },
  };
}