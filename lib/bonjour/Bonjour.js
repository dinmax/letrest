/**
 * Created by mdellano on 7/15/14.
 */
var LOG=require('uw').log;
var SCHEMA=require('../Config.js').getSchemas();
var CRUDS=require('../Config.js').getCRUDs();
var WADLS=require('../Config.js').getWADLs();

var PATH=require('path');
var WADL_PATH=PATH.dirname(process.mainModule.filename)+'/../web/public/';
var MODULE="BONJOUR\t";

exports.config=function(router) {
    LOG.verbose(MODULE,'Configuring config discover process');

    router.get('/_discover/:type/:name',function(req, res, next) {
        LOG.info()
        var ret=null;
          switch (req.params.type) {
              case 'schema':
                  LOG.info(MODULE,'Request for schema =>',req.params.name);
                  ret=SCHEMA[req.params.name];
                  break;
              case 'definition':
                  try {
                     LOG.info(MODULE,'Request for endpoint =>',req.params.name);
                     //ret=require(WADL_PATH+req.params.name);
                      ret=WADLS[req.params.name];
                  } catch (e) {
                      LOG.error(MODULE,'Failed to retrieve endpoint config', e.toString());
                      ret=null;
                  }
                  break;
              case 'crud':
                  LOG.info(MODULE,'Request for crud =>',req.params.name);
                  ret=CRUDS[req.params.name];

                  break;
          }
          if (ret) {
              res.send(ret);
          } else {
              res.status(404).send('Discovering not found');
          }


    });

}