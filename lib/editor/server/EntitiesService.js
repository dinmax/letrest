/**
 * Created by mdellano on 11/23/14.
 */

var MODULE="Entities Service | ";

var LOG=require('uw').log;
var PATH=require('path');
var ENTITY_PATH=PATH.dirname(process.mainModule.filename)+'/../config/letrest/entities/';
var SCHEMA_PATH=PATH.dirname(process.mainModule.filename)+'/../config/letrest/schemas/';
var SECURITY_PATH=PATH.dirname(process.mainModule.filename)+'/../config/letrest/security/config.json';
var CONFIG_PATH=PATH.dirname(process.mainModule.filename)+'/../config/letrest/config.json';
var CRUDS_PATH=PATH.dirname(process.mainModule.filename)+'/../config/letrest/crud/';


var getEntities=function() {
    var ENTITIES={};
    LOG.info(MODULE,'Reading entities.');
    var files=require('fs').readdirSync(ENTITY_PATH);
    for (var i=0;i<files.length;i++) {
        if(files[i].substr(files[i].length-5)=='.json'){
            LOG.info(MODULE,'Processing entity file',files[i]);
            var file=require(ENTITY_PATH+files[i]);
            if (file.name!=files[i].replace('.json','')) LOG.warn(MODULE,'Entity Definition name not match file name =>',files[i]);
            ENTITIES[file.name]=file;
        }else{
            LOG.warn(MODULE,'Skipping file '+files[i]);
        }
    }
    return ENTITIES;
};

var startsWithUntil=function(preface, stopper, string){
    return (string.lastIndexOf(preface,0)==0 && string.lastIndexOf(stopper)==preface.length);
};

var saveEntity=function(data) {
  if( data.schema ){
    saveWithBackup(data.name, data.schema, SCHEMA_PATH, 'SAVING SCHEMA: ');
    data.schema = null;
  }
  return saveWithBackup(data.name, data, ENTITY_PATH, 'SAVING ENTITY: ');
};

var saveWithBackup=function(filename, data, path, message) {
  if(filename){
    var name=filename;
    LOG.info(MODULE,message+name);
    var fs=require('fs');
    var files=fs.readdirSync(path);

    for (var i=0;i<files.length;i++) {
      var fname=files[i];
      if(startsWithUntil(name,'.',fname)){
        var j=1;
        while(startsWithUntil(name,'_',files[i+j])){
          j++;
        }
        var newfname=fname.substr(0,fname.lastIndexOf('.'))+'_'+j+'.bkup';
        fs.rename(path+fname, path+newfname);
        break;
      }
    }
    return fs.writeFileSync(path+name+'.json',JSON.stringify(data,null,'\t'));
  }else{
    return -1;
  }
};

module.exports.allservice=function(req,res) {
    res.send(getEntities());
};

module.exports.saveservice=function(req,res) {
    res.send(saveEntity(req.body));
};
