const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
assert(fs.existsSync('static/dashboard.js'),'Dashboard implementation missing');
const source=fs.readFileSync('static/dashboard.js','utf8');const c={};vm.createContext(c);vm.runInContext(source.slice(0,source.indexOf('// UI bindings')),c);
const rooms=[{id:'old',name:'Old',last_activity:1},{id:'new',name:'New',last_activity:10},{id:'p',name:'REIGN',private:true,last_activity:5}];
assert.equal(c.dashboardRooms(rooms,'all')[0].id,'new');assert.equal(c.dashboardRooms(rooms,'groups').length,2);assert.equal(c.dashboardRooms(rooms,'direct')[0].id,'p');assert.equal(rooms[0].id,'old');
assert.equal(c.projectTitle('  Build a launch plan\nwith everyone  '),'Build a launch plan');
assert.equal(c.projectTitle('a'.repeat(100)).length,80);
console.log('Dashboard: recent sorting, private/group filters and bounded project titles passed.');
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{hidden:true,value:'',checked:true,disabled:false,dataset:{},addEventListener(){},setAttribute(){},scrollIntoView(){},click(){}});return nodes.get(id);}
const calls=[],ctx={document:{querySelector:node,querySelectorAll:()=>[],documentElement:{dataset:{}}},window:{},localStorage:{getItem:()=>null,setItem(){}},console,rooms,me:{name:'James Hill'},esc:s=>String(s),initials:s=>s[0],date:String,timestamp:String,toast(){},api:async(path,method,body)=>{calls.push([path,method,body]);return{id:'created'};},selectRoom:async id=>{calls.push(['select',id]);},loadRooms:async()=>{},updateSettings:async changes=>calls.push(['settings',changes]),invitePeople:()=>calls.push(['invite'])};
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{node('#dashboard-idea').value='Build something real';await node('#dashboard-form').onsubmit({preventDefault(){}});assert.equal(calls[0][0],'/rooms');assert.equal(calls[0][2].name,'Build something real');assert(calls.some(x=>x[0]==='select'&&x[1]==='created'));assert(calls.some(x=>x[0]==='settings'&&x[1].enabled));assert(calls.some(x=>x[0]==='invite'));assert.equal(node('#dashboard-create').disabled,false);assert.equal(node('#dashboard-idea').value,'');console.log('Dashboard project flow passed: real create, open, REIGN setting and invitation handoff.');})().catch(e=>{console.error(e);process.exitCode=1;});
