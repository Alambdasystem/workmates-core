const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
assert(fs.existsSync('static/call_audio.js'),'Shared audio diagnostics must exist');const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('static/call_audio.js','utf8'),c);
assert.equal(c.callAudioLevel(new Uint8Array([128,128,128,128])),0);
assert(c.callAudioLevel(new Uint8Array([0,255,0,255]))>.9);
assert.equal(c.callAudioHealth({bytes:1200,energy:.4,playing:true}),'playing');
assert.equal(c.callAudioHealth({bytes:1200,energy:.4,playing:false}),'speaker-blocked');
assert.equal(c.callAudioHealth({bytes:0,energy:0,playing:false}),'waiting');
console.log('Audio diagnostics passed: silence, sound level, received media and speaker-blocked distinction.');
