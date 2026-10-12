#!/usr/bin/env node
const path = require('node:path');
const {spawn} = require('node:child_process');

const electron = require.resolve('electron/cli.js');
const project = process.argv[2] || process.cwd();
const child = spawn(process.execPath, [electron, path.resolve(__dirname, '..'), '--project', path.resolve(project)], {
  stdio: 'inherit',
  windowsHide: false,
});
child.on('exit', (code, signal) => process.exitCode = signal ? 1 : (code ?? 0));
