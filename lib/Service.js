/**
 * Created by memili on 07/06/14.
 */
var PR=require('./protocol/Protocol.js');
var LOG=require('uw').log;
exports.config=function(app,router) {
    require('./Config.js').init();
    require('./security/Security.js').config(router);
    require('./bonjour/Bonjour.js').config(router);
    require('./rest/Rest.js').config(router);
    app.use(function (err, req, res, next) {
      next = next||undefined; //only to mantain 4 params on uglify
      LOG.error('Bad format message');
      res.send(500, PR.newError(500,'Bad format message'));
    });
}
