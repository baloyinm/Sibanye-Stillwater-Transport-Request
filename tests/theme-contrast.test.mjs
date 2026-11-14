// ui/theme-contrast-test 1.0.0 on public/app.css: every text colour on every background, light and dark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { declarations, failingPairs, makeResolver, ruleBody, textOnBackgrounds } from './vendor/theme-contrast-test.ts';
const CSS = readFileSync(new URL('../public/app.css', import.meta.url), 'utf8');
const LIGHT = declarations(ruleBody(CSS, ':root'));
const DARK = declarations(ruleBody(CSS, ':root', CSS.indexOf('@media')));
const PAIRS = [...textOnBackgrounds(['--fg', '--mut', '--bad', '--ok', '--warn', '--pri'], ['--bg', '--card']), { name: 'primary button', fg: '--prifg', bg: '--pri' }];
test('light theme passes', () => assert.deepEqual(failingPairs(makeResolver(LIGHT), PAIRS), []));
test('dark theme passes', () => assert.deepEqual(failingPairs(makeResolver({ ...LIGHT, ...DARK }), PAIRS), []));
