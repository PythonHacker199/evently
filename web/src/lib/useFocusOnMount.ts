import { useEffect, useRef } from 'react';

/** Move focus to a newly shown panel so keyboard and screen-reader users land on it. */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
