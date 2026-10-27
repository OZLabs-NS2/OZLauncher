const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const APP_ID=/^[a-z0-9][a-z0-9-]{0,47}$/;
const KEY=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const FORMAT=1,MAX_KEY_BYTES=64,MAX_VALUE_BYTES=900,MAX_KEYS=256,MAX_APP_BYTES=65536;
class StorageError extends Error{constructor(message,code='STORAGE'){super(message);this.name='StorageError';this.code=code;}}
function invalid(message){throw new StorageError(message,'INVALID');}
function validateId(id){if(typeof id!=='string'||!APP_ID.test(id))invalid('Invalid app id');return id;}
function validateKey(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>MAX_KEY_BYTES||bytes.some(byte=>byte>0x7f))invalid('Invalid storage key');
 const key=bytes.toString('ascii');if(!KEY.test(key))invalid('Invalid storage key');return key;
}
function empty(){return {version:FORMAT,values:Object.create(null)};}
function decode(bytes){
 if(bytes.length>MAX_APP_BYTES)throw new StorageError('Stored data exceeds the app quota');
 let document;try{document=JSON.parse(bytes.toString('utf8'));}catch{throw new StorageError('Stored data is malformed');}
 if(!document||document.version!==FORMAT||!document.values||typeof document.values!=='object'||Array.isArray(document.values))throw new StorageError('Stored data has an unsupported format');
 const keys=Object.keys(document.values);if(keys.length>MAX_KEYS)throw new StorageError('Stored data exceeds the key limit');
 for(const key of keys){
  if(!KEY.test(key))throw new StorageError('Stored data contains an invalid key');
  const encoded=document.values[key];if(typeof encoded!=='string')throw new StorageError('Stored data contains an invalid value');
  const value=Buffer.from(encoded,'base64');if(value.length>MAX_VALUE_BYTES||value.toString('base64')!==encoded)throw new StorageError('Stored data contains an invalid value');
 }
 return document;
}
function serialize(document){
 const bytes=Buffer.from(JSON.stringify(document));
 if(Object.keys(document.values).length>MAX_KEYS||bytes.length>MAX_APP_BYTES)throw new StorageError('App storage quota exceeded','QUOTA');
 return bytes;
}
function storageError(error,message){
 if(error instanceof StorageError)return error;
 return new StorageError(message+(error?.code?' ('+error.code+')':''));
}
function create({root=process.env.OZLAUNCHER_STORAGE_DIR||path.join(os.homedir(),'.ozlauncher','storage')}={}){
 root=path.resolve(root);const locks=new Map();
 function fileFor(id){return path.join(root,crypto.createHash('sha256').update(validateId(id)).digest('hex')+'.json');}
 async function locked(file,action){
  const previous=locks.get(file)||Promise.resolve();let release;const current=new Promise(resolve=>{release=resolve;});locks.set(file,current);
  await previous;try{return await action();}finally{release();if(locks.get(file)===current)locks.delete(file);}
 }
 async function read(file){
  let handle;
  try{
   handle=await fs.open(file,'r');const stat=await handle.stat();if(stat.size>MAX_APP_BYTES)throw new StorageError('Stored data exceeds the app quota');
   return decode(await handle.readFile());
  }catch(error){if(error.code==='ENOENT')return empty();throw storageError(error,'Storage read failed');}
  finally{await handle?.close().catch(()=>{});}
 }
 async function write(file,document){
  const bytes=serialize(document),temporary=file+'.'+process.pid+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';let handle;
  try{
   await fs.mkdir(root,{recursive:true,mode:0o700});handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
   await fs.rename(temporary,file);const directory=await fs.open(root,'r');try{await directory.sync();}finally{await directory.close();}
  }catch(error){await handle?.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});throw storageError(error,'Storage write failed');}
 }
 async function access(id,keyBytes,action){
  const file=fileFor(id),key=validateKey(keyBytes);return locked(file,async()=>action(file,key));
 }
 return {
  async load(id,keyBytes){return access(id,keyBytes,async(file,key)=>{const document=await read(file);return Object.hasOwn(document.values,key)?Buffer.from(document.values[key],'base64'):null;});},
  async save(id,keyBytes,value){
   if(!Buffer.isBuffer(value)||value.length>MAX_VALUE_BYTES)invalid('Invalid storage value');
   return access(id,keyBytes,async(file,key)=>{const document=await read(file);document.values[key]=value.toString('base64');await write(file,document);});
  },
  async delete(id,keyBytes){return access(id,keyBytes,async(file,key)=>{const document=await read(file);if(!Object.hasOwn(document.values,key))return false;delete document.values[key];await write(file,document);return true;});},
  async exists(id,keyBytes){return access(id,keyBytes,async(file,key)=>Object.hasOwn((await read(file)).values,key));},
  async close(){}
 };
}
module.exports={create,StorageError,APP_ID,KEY,MAX_KEY_BYTES,MAX_VALUE_BYTES,MAX_KEYS,MAX_APP_BYTES};