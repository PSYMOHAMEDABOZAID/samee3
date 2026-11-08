const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
test('widget module uses a sandboxed remote window and protects host', () => {
 const text = fs.readFileSync(path.join(__dirname, '../widgets-window.cjs'), 'utf8');
 assert.match(text, /sandbox: true/); assert.match(text, /nodeIntegration: false/);
 assert.match(text, /samee3.vercel.app/); assert.match(text, /will-navigate/);
});
