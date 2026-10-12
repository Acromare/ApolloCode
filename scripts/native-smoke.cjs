const {spawn}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
const {ComputerTools}=require('../desktop/computer-tools.cjs');
(async()=>{
  const child=spawn('powershell.exe',['-NoProfile','-STA','-File',path.join(__dirname,'native-fixture.ps1')],{windowsHide:true});
  let timer;
  try {
    const target=await new Promise((resolve,reject)=>{
      let output='';timer=setTimeout(()=>reject(new Error('Native fixture startup timeout')),10000);
      child.stdout.on('data',chunk=>{output+=chunk;const line=output.split(/\r?\n/).find(l=>l.startsWith('{'));if(line){clearTimeout(timer);resolve(JSON.parse(line));}});
      child.once('error',reject);child.stderr.on('data',data=>reject(new Error(data.toString())));
    });
    const computer=new ComputerTools(async()=>true);
    let snapshot=await computer.select(target.handle,target.pid);
    const input=snapshot.controls.find(c=>c.name==='ApolloInput');assert.ok(input,JSON.stringify(snapshot));
    await computer.action('type',input.id,'verified input');
    snapshot=await computer.snapshot();const button=snapshot.controls.find(c=>c.name==='ApolloApply');assert.ok(button);
    await computer.action('click',button.id);snapshot=await computer.snapshot();
    assert.ok(snapshot.controls.some(c=>c.name==='clicked verified input'),JSON.stringify(snapshot));
    console.log('PASS: real Windows UIA selects authorized invisible test window, sets text, invokes button and verifies result');
  }finally{clearTimeout(timer);child.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
