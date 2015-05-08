/**
 * Created by memili on 10/06/14.
 */
var SCHEMA=require('../Config.js').getSchemas();
var VALIDATOR = require('jsonschema').Validator;
var LOG=require('uw').log;
var MODULE="SCHEMA\t"

exports.validate=function(entity,model) {
    LOG.verbose( MODULE,'Validating entity',entity.name);
    var v = new VALIDATOR();
    var s=SCHEMA[entity.name];
    if (!s || !s.definition || !s.dependencies) {
        throw new Error('You need at least a full schema definition for \"'+entity.name+'\".{ definition:{},dependencies:[]}');
    }
    LOG.verbose( MODULE,'Configuring validation',entity.name);
    //Adding dependencies schemas if it is needed.
    for (var i=0; i<s.dependencies.length;i++) {
        v.addSchema(s.dependencies[i],s.dependencies[i].id);
    }
    LOG.verbose( MODULE,'Doing validation',entity.name);
    return v.validate(model,s.definition);
}

