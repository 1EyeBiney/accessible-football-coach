// run.js - Runs every test file in this folder and prints a plain text report.
// Usage: node test/run.js
//
// A test file is any file in test/ whose name ends in _test.js. It exports a
// single function that takes an assertion helper and calls it. There is no
// framework and there are no dependencies, the same way the rest of the
// project has none.

'use strict';

var fs = require('fs');
var path = require('path');

var dir = __dirname;
var files = fs.readdirSync(dir).filter(function (f) { return /_test\.js$/.test(f); }).sort();

var passed = 0, failed = 0, failures = [];

function makeT(file) {
    return {
        ok: function (cond, msg) {
            if (cond) { passed++; return; }
            failed++; failures.push(file + ': ' + msg);
        },
        eq: function (a, b, msg) {
            if (a === b) { passed++; return; }
            failed++; failures.push(file + ': ' + msg + ' (got ' + JSON.stringify(a) + ', wanted ' + JSON.stringify(b) + ')');
        },
        near: function (a, b, tol, msg) {
            if (Math.abs(a - b) <= tol) { passed++; return; }
            failed++; failures.push(file + ': ' + msg + ' (got ' + a + ', wanted within ' + tol + ' of ' + b + ')');
        }
    };
}

var i;
for (i = 0; i < files.length; i++) {
    var fn = require(path.join(dir, files[i]));
    var t = makeT(files[i]);
    try {
        fn(t);
    } catch (err) {
        failed++;
        failures.push(files[i] + ' threw: ' + (err && err.stack ? err.stack : err));
    }
}

console.log('Accessible Football tests. ' + files.length + ' files, ' + (passed + failed) + ' checks.');
if (failed) {
    console.log(failed + ' failed:');
    for (i = 0; i < failures.length; i++) console.log('  ' + failures[i]);
    process.exit(1);
}
console.log('All ' + passed + ' checks passed.');
