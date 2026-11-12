import { useCallback, useEffect, useRef, useState } from 'react';
import { ParseClient } from '../../lib/vasp/parse-client';
import type { ParseRequest, ParseResultMap } from '../../lib/vasp/parseJob';

/** Files above this are refused with a message (the text has to fit in the browser's memory). */
export const MAX_FILE_BYTES = 400 * 1024 * 1024;

/** Runs parse and mesh jobs in a worker, with busy, progress and error state for the view. */
export function useParser() {
  const client = useRef<ParseClient | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      client.current?.dispose();
      client.current = null;
    },
    [],
  );
  const run = useCallback(async <K extends ParseRequest['kind']>(req: Extract<ParseRequest, { kind: K }>) => {
    client.current ??= new ParseClient();
    setBusy(true);
    setProgress(0);
    setError('');
    try {
      return (await client.current.run(req, setProgress)) as ParseResultMap[K];
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file could not be read.');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy, progress, error, setError };
}

/** Read a File as text after the size check; returns null and an explanation when it is too large. */
export async function readFileText(f: File): Promise<{ text: string } | { error: string }> {
  if (f.size > MAX_FILE_BYTES)
    return {
      error: `This file is ${(f.size / 1e6).toFixed(0)} MB; the limit is ${MAX_FILE_BYTES / 1e6} MB.`,
    };
  return { text: await f.text() };
}
