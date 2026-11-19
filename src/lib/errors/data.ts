import raw from '../../data/errors.json';
import type { ErrorEntry } from './match';

export const ERROR_CATEGORIES: Record<string, string> = raw.categories;
export const ERRORS: ErrorEntry[] = raw.entries as ErrorEntry[];
