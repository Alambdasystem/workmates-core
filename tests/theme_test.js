const fs=require('node:fs'),assert=require('node:assert/strict'),css=fs.readFileSync('static/styles.css','utf8'),html=fs.readFileSync('static/index.html','utf8');
for(const name of ['.workspace','.meeting-view','.call-file-float','.login-shell','dialog','.canvas'])assert(css.includes('[data-dashboard-theme=dark] '+name),'Dark theme missing '+name);
assert((html.match(/data-theme-toggle/g)||[]).length>=4,'Theme controls needed on login, workspace and both call views');console.log('Global theme coverage passed: login, chat, calls, files and dialogs.');
