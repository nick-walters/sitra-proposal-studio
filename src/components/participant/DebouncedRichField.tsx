import { useCallback } from 'react';
import { LazyRichField, type LazyRichFieldProps } from '@/components/participant/LazyRichField';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';

/**
 * LazyRichField that writes on an 800 ms pause instead of on every keystroke.
 *
 * The editor still emits `onChange` per keystroke; only the persistence call
 * is debounced. Pending text is flushed when the field unmounts its editor
 * (blur), when the component unmounts (navigation away) and on `pagehide`.
 */
export function DebouncedRichField({
  onChange,
  onBlur,
  delay = 800,
  ...rest
}: LazyRichFieldProps & { delay?: number }) {
  const { push, flush } = useDebouncedSave<string>(onChange, delay);

  const handleBlur = useCallback(() => {
    flush();
    onBlur?.();
  }, [flush, onBlur]);

  return <LazyRichField {...rest} onChange={push} onBlur={handleBlur} />;
}

export default DebouncedRichField;
