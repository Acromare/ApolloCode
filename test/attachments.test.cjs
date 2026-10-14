const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {storeUpload,attachmentContext,localFile}=require('../desktop/attachments.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-files-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('clipboard uploads preserve binary bytes, avoid traversal and do not overwrite duplicate names',t=>{
 const root=fixture(t),bytes=Uint8Array.from([0,255,11,37]);
 const first=storeUpload(root,{name:'../../新文件.bin',data:bytes});const second=storeUpload(root,{name:'新文件.bin',data:bytes});
 assert.equal(first.name,'新文件.bin');assert.ok(first.path.startsWith(root+path.sep));assert.notEqual(first.path,second.path);assert.deepEqual(fs.readFileSync(first.path),Buffer.from(bytes));
 assert.throws(()=>storeUpload(root,{name:'bad',data:'bad'}));assert.throws(()=>localFile({path:root}),/文件夹/);
});
test('native attachment transport accepts unknown extensions and keeps binary files accessible in the project',t=>{
 const root=fixture(t),project=path.join(root,'project');fs.mkdirSync(project);
 const source=path.join(root,'没有 扩展名');fs.writeFileSync(source,Buffer.from([0,255,1]));
 const original={messages:[{role:'user',content:'查看附件'}],attachments:[{path:source,name:'没有 扩展名'}]};
 const sent=attachmentContext(original,project);assert.equal(original.messages[0].content,'查看附件');
 assert.match(sent.messages[0].content,/Attached file/);assert.doesNotMatch(sent.messages[0].content,/File content/);
 const stored=JSON.parse(sent.messages[0].content.match(/Path: (.+)/)[1]);assert.ok(stored.startsWith(project+path.sep));assert.deepEqual(fs.readFileSync(stored),fs.readFileSync(source));
});
test('text attachment preview works for arbitrary source extensions and avoids silently truncating large files',t=>{
 const root=fixture(t),file=path.join(root,'main.go');fs.writeFileSync(file,'package main\n');
 let sent=attachmentContext({messages:[{role:'user',content:'检查代码'}],attachments:[{path:file}]},root);assert.match(sent.messages[0].content,/package main/);
 fs.writeFileSync(file,'a'.repeat(70000));sent=attachmentContext({messages:[{role:'user',content:'读取文件'}],attachments:[{path:file}]},root);assert.doesNotMatch(sent.messages[0].content,/File content/);assert.match(sent.messages[0].content,/Path:/);
});
