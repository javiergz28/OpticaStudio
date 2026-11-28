const {app,BrowserWindow}=require('electron');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const {buildSync}=require('esbuild');
const js=buildSync({entryPoints:[path.join(__dirname,'c3-pixels.ts')],bundle:true,platform:'browser',format:'iife',write:false}).outputFiles[0].text;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<script src="/test.js"></script>');return}
 if(url.pathname==='/test.js'){res.setHeader('Content-Type','application/javascript');res.end(js);return}
 const p=path.resolve(root,'public',url.pathname.slice(1));
 if(!p.startsWith(path.join(root,'public')+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return}
 res.setHeader('Content-Type',p.endsWith('.wasm')?'application/wasm':p.endsWith('.js')?'application/javascript':'application/octet-stream');fs.createReadStream(p).pipe(res);
});
app.setPath('userData',fs.mkdtempSync(path.join(require('node:os').tmpdir(),'optica-c3-test-')));
app.whenReady().then(async()=>{
 server.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
 const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});
 win.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 win.webContents.session.webRequest.onBeforeRequest({urls:['https://*/*','http://*/*']},(d,cb)=>cb({cancel:!d.url.startsWith('http://127.0.0.1:')}));
 try{await win.loadURL('http://127.0.0.1:'+server.address().port);const result=await win.webContents.executeJavaScript('window.c3Run()');console.log('C3 ELECTRON PASS',JSON.stringify(result));win.destroy();server.close();app.exit(0)}
 catch(e){console.error('C3 ELECTRON FAIL',e);win.destroy();server.close();app.exit(1)}
});
setTimeout(()=>{console.error('C3 ELECTRON TIMEOUT');app.exit(2)},60000).unref();
