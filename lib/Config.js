/**
 * Created by mdellano on 9/3/14.
 */

var SCHEMAS={};
var ENTITIES={};
var SECURITY={};
var CONFIG={};
var CRUDS={};
var WADLS={};

var MODULE='CONFIG\t';
var PATH=require('path');
var ENTITY_PATH=PATH.dirname(process.mainModule.filename)+'/../config/letrest/entities/';
var SCHEMA_PATH=PATH.dirname(process.mainModule.filename)+'/../config/letrest/schemas/';
var SECURITY_PATH=PATH.dirname(process.mainModule.filename)+'/../config/letrest/security/config.json';
var CONFIG_PATH=PATH.dirname(process.mainModule.filename)+'/../config/letrest/config.json';
var CRUDS_PATH=PATH.dirname(process.mainModule.filename)+'/../config/letrest/crud/';

var MERGE = require('merge')

var LOG=require('uw').log;

var DOTTY=require("dotty");

var copy=function(obj) {
 return JSON.parse(JSON.stringify(obj));
};
var parseConstants=function(obj) {
    for (var k in obj.constants) {
        for (var i=0;i<obj.actions.length;i++) {
            if (obj.actions[i].label) obj.actions[i].label=obj.actions[i].label.replace(new RegExp("#"+k+"#","g"),obj.constants[k]);
            if (obj.actions.position==undefined) obj.actions.position=-1;
            if (obj.actions.weight==undefined) obj.actions.weight=-1;
        };
        if (obj.fields)
        for (var i=0;i<obj.fields.length;i++) {
            if (obj.fields[i].label) obj.fields[i].label=obj.fields[i].label.replace(new RegExp("#"+k+"#","g"),obj.constants[k]);
            if (obj.fields[i].position==undefined) obj.fields[i].position=0;
            if (obj.fields[i].weight==undefined) obj.fields[i].weight=-1;
                if (obj.fields[i].readonly==undefined) obj.fields[i].readonly=false;
        };
    };
    return obj;
};

var merge=function(pBase,pParent) {
    var base=copy(pBase);
    var parent=copy(pParent);
    //FIXME This shouuld evaluate how the concatenation of arrays works when you do a merge.
    var merged=MERGE.recursive(true,(parent),(base));
    merged.fields=[].concat(parent.fields||[],base.fields||[]);
    merged.filters=[].concat(parent.filters||[],base.filters||[]);
    merged.actions=[].concat(parent.actions||[],base.actions||[]);
    return merged;
}
var processHierarchy=function(base) {
  if (CRUDS[base.parent]) {
      return merge(base,CRUDS[base.parent]);
  } else {
     var newOne=base.parent+'.crud.json';
     var parent=retrieveCRUD(newOne);
     CRUDS[base.parent]=(parent);
     return merge(base,parent);
  }
};

var retrieveCRUD=function(filename) {
    var file=require(CRUDS_PATH+filename);
    if (file.parent) {
        file=processHierarchy(file);
    }
    return (file);
};

var fillCRUDs=function() {
    LOG.info(MODULE,'Reading cruds.');
    var files=require('fs').readdirSync(CRUDS_PATH);
    for (var i=0;i<files.length;i++) {
        LOG.info(MODULE,'Processing crud file',files[i]);
        var file=retrieveCRUD(files[i]);
        CRUDS[files[i].replace('.crud.json','')]=file;
    }
    for (var k in CRUDS) {
        parseConstants(CRUDS[k]);
    }
};

var fillEntities=function() {
    LOG.info(MODULE,'Reading entities.');
    var files=require('fs').readdirSync(ENTITY_PATH);
    for (var i=0;i<files.length;i++) {
        LOG.info(MODULE,'Processing entity file',files[i]);
        var file=require(ENTITY_PATH+files[i]);
        if (file.name!=files[i].replace('.json','')) LOG.warn(MODULE,'Entity Definition name not match file name =>',files[i]);
        ENTITIES[file.name]=file;
    }
};

var fillSchemas=function() {
    LOG.info(MODULE,'Reading schemas.');
    var files=require('fs').readdirSync(SCHEMA_PATH);
    for (var i=0;i<files.length;i++) {
        LOG.info(MODULE,'Processing schema file',files[i]);
        var file=require(SCHEMA_PATH+files[i]);
        if (file.definition.id!='/'+files[i].replace('.json','')) LOG.warn(MODULE,'Schema Definition name not match file name =>',files[i]);
        SCHEMAS[files[i].replace('.json','')]=file;
    }
};
var fillSecurity=function() {
    LOG.info(MODULE,'Reading scurity.');
    SECURITY=require(SECURITY_PATH);
};
var fillConfig=function() {
    CONFIG=require(CONFIG_PATH);
};

var parseNew = function(entity){
    var newElement = {};
    //var nameAttr = '';
    for(var i = 0; i<entity.mapping.length;i++){
        if(typeof entity.mapping[i].default !== 'undefined'){
            var attr = entity.mapping[i].attribute.replace('@','.');
            DOTTY.put(newElement,attr,entity.mapping[i].default);
        }
    }

   return newElement;
};

// #2 Fix WADL mapping generation
var findPKMapped=function(entity){
  if( entity.mapping ){
    for(var i=0; i < entity.mapping.length; i++){
      var map = entity.mapping[i];
      if( map.field === entity.pk ) return map.attribute;
    }
  }
  return entity.pk;
};

var createWADLs=function() {
 /*
  {
  "type":"account",
  "host": "http://54.187.139.96:8080/",
  "url": "api/account/:accountid/",
  "id": "accountid",
  "map": {
  "accountid":"@accountid"
  },
  "actions": {
  "GET": {"params":["accountid"]},
  "ALL": {"params":["FROM","ROWS","?name","?lastname","?nick","?level","?quick"]},
  "POST": {"params":[]},
  "PUT": {"params":[]},
  "DELETE": {"params":["accountid"]}
  }
  }
  */

  for (var k in ENTITIES) {
      var entity=ENTITIES[k];

      var pkMapped = findPKMapped(entity);

      var WADL = {};
      WADL.type = entity.name;
      WADL.host = "";
      WADL.url = "api" + entity.path + "/:" + pkMapped + "/";
      WADL.id = pkMapped;
      WADL.map = {};
      WADL.map[WADL.id] = "@" + WADL.id;
      WADL.actions = {};
      //Process all
      if (entity.service.all) {
          WADL.actions.ALL = {params: ["FROM", "ROWS","?GROUP","?ORDER","?AGGREGATE"]};
          for (var k in entity.service.all.filter) {
              var f = entity.service.all.filter[k];
              if (f.source = "url") WADL.actions.ALL.params.push("?" + f.key);
          };
          if (entity.service.all.group) {
              WADL.actions.ALL.group={dimensions:{},measures:{}};
              for (var k in entity.service.all.group.dimensions) {
                  WADL.actions.ALL.group.dimensions[k]={label:k};
              };
              for (var k in entity.service.all.group.measures) {
                  WADL.actions.ALL.group.measures[k]={label:k};
              };

          }
      };

      if (entity.service.get) WADL.actions.GET = {params: [pkMapped]};
      if (entity.service.put) WADL.actions.PUT = {params: [pkMapped]};
      if (entity.service.post) WADL.actions.POST = {params: []};
      if (entity.service.delete) WADL.actions.DELETE = {params: [pkMapped]};
      //if(entity.name === "campaign")
      //    debugger;
      if (entity.defaultnew) WADL.new = parseNew(entity);

      WADLS[entity.name]=WADL;
  }

};


exports.init=function() {
    LOG.info(MODULE,'Initializing Let-Rest config.');
    fillConfig();
    fillEntities();
    fillSchemas();
    fillSecurity();
    fillCRUDs();
    createWADLs();
};

exports.getEntities=function() {
    return ENTITIES;
};

exports.getSchemas=function() {
    return SCHEMAS;
};

exports.getSecurity=function() {
    return SECURITY;
};

exports.getConfig=function() {
    return CONFIG;
};

exports.getCRUDs=function() {
    return CRUDS;
};

exports.getWADLs=function() {
    return WADLS;
};
