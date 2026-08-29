// serve.js - A static file server for driving the game in a real browser
// during development. The game itself needs no server: it runs by opening
// index.html from a folder, which DESIGN.md 21 marks non-negotiable. This
// exists only so an automated browser can load the page over http, because
// browser automation cannot drive a file:// page reliably.
//
// Usage: node serve.js [port]

'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var root = __dirname;
var port = Number(process.argv[2]) || 8123;

var TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
};

http.createServer(function (req, res) {
    var rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    var file = path.join(root, rel);
    // Never serve anything outside the project folder.
    if (file.indexOf(root) !== 0) { res.writeHead(403); res.end('Forbidden'); return; }
    fs.readFile(file, function (err, body) {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(body);
    });
}).listen(port, function () {
    console.log('Accessible Football on http://localhost:' + port + '/');
});
