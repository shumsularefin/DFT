import { describe, expect, it } from 'vitest';
import { lintQuestions } from './lint-questions.mjs';

describe('lint-questions', () => {
  it('passes on the repository and reports coverage for every module', () => {
    const { problems, coverage } = lintQuestions('.');
    expect(problems).toEqual([]);
    expect(coverage.map((r: { module: number }) => r.module)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
