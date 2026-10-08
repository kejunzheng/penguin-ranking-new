import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeepSwe, parseFrontierCode } from '../scripts/lib/coding-benchmarks.mjs';

test('DeepSWE ranks pass@1, preserves the winning harness, and ignores invalid scores', () => {
  const parsed = parseDeepSwe({ generated_at: '2026-09-22T06:27:15Z', rows: [
    { model: 'A', pass_at_1: 0.4, pass_at_4: 1, harness: 'mini-swe-agent', reasoning_effort: 'high' },
    { model: 'A', pass_at_1: 0.6, harness: 'mini-swe-agent', reasoning_effort: 'max' },
    { model: 'B', pass_at_1: 0.8, harness: 'mini-swe-agent' },
    { model: 'Invalid', pass_at_1: null },
  ] });
  assert.equal(parsed.dataDate, '2026-09-22');
  assert.deepEqual(parsed.rows.map(row => [row.raw, row.rank]), [['B', 1], ['A', 2]]);
  assert.match(parsed.rows[1].config, /mini-swe-agent；max/);
  assert.throws(() => parseDeepSwe({ rows: [{ model: 'A', pass_at_1: null }] }));
});

test('FrontierCode uses v1.1 Main post-flag score and the best effort per model', () => {
  const parsed = parseFrontierCode({ v1: { models: ['Wrong revision'] }, v1_1: {
    models: ['A', 'B', 'Missing'], efforts: { A: ['high', 'max'], B: ['none'] }, harness: { A: 'claude-code' },
    data: { A: { high: { main: { new_score: 0.3, score_preflag: 0.99, correct: 1 }, extended: { new_score: 1 } }, max: { main: { new_score: 0.5 } } }, B: { none: { main: { new_score: 0.6 } } } },
  } }, '2026-10-07');
  assert.deepEqual(parsed.rows.map(row => [row.raw, row.rank]), [['B', 1], ['A', 2]]);
  assert.match(parsed.rows[1].config, /Main.*claude-code；max/);
  assert.equal(parsed.dataDate, '2026-10-07');
  assert.throws(() => parseFrontierCode({ v1: {} }));
});
