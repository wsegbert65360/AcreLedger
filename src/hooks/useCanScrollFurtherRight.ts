import { useCallback, useEffect, useState } from 'react';

/**
 * True when a horizontal scroller has more content past the right edge.
 * The callback ref resubscribes if the row mounts after the first render.
 * Descendants are observed because the scrollport's own box often stays the
 * same when the tabs inside it change width.
 */
export function useCanScrollFurtherRight() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const ref = useCallback((element: HTMLDivElement | null) => {
    setNode(element);
  }, []);

  useEffect(() => {
    if (!node) return;

    const update = () => {
      setCanScrollRight(node.scrollWidth - node.clientWidth - node.scrollLeft > 1);
    };

    update();
    node.addEventListener('scroll', update, { passive: true });

    let observer: ResizeObserver | undefined;
    const observe = () => {
      if (!observer) return;
      observer.disconnect();
      observer.observe(node);
      Array.from(node.children).forEach((child) => observer?.observe(child));
    };

    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(update);
      observe();
    } else {
      window.addEventListener('resize', update);
    }

    const mutation = typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
          observe();
          update();
        })
      : undefined;
    mutation?.observe(node, { childList: true, subtree: true, characterData: true });

    return () => {
      node.removeEventListener('scroll', update);
      observer?.disconnect();
      mutation?.disconnect();
      if (!observer) window.removeEventListener('resize', update);
    };
  }, [node]);

  return { ref, canScrollRight };
}
