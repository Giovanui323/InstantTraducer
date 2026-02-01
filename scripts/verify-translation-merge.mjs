import assert from 'node:assert/strict';
import { mergeProjectData } from '../electron/translationMerge.js';

const existing = {
  fileName: 'Libro.pdf',
  lastPage: 10,
  totalPages: 100,
  translations: { '1': 't1', '2': 't2' },
  annotations: { '2': { note: 'x' } }
};

const merged1 = mergeProjectData(existing, { lastPage: 11, originalFilePath: '/tmp/libro.pdf' });
assert.equal(merged1.lastPage, 11);
assert.equal(merged1.originalFilePath, '/tmp/libro.pdf');
assert.equal(merged1.translations['1'], 't1');
assert.equal(merged1.translations['2'], 't2');

const merged2 = mergeProjectData(existing, { translations: { '3': 't3' } });
assert.equal(merged2.translations['1'], 't1');
assert.equal(merged2.translations['2'], 't2');
assert.equal(merged2.translations['3'], 't3');

const merged3 = mergeProjectData(existing, { translations: {} });
assert.equal(merged3.translations['1'], 't1');
assert.equal(merged3.translations['2'], 't2');

console.log('verify-translation-merge: ok');

