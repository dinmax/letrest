/*
 * Configuring ENTITIES
 */
var CONFIG = require('../Config.js').getConfig();
var ENTITIES = require('../Config.js').getEntities();
var STRATEGY = require(CONFIG.strategy);
var SCHEMA = require('../schema/Schema.js');
var SECURITY = require('../security/Security.js');
var PROTOCOL = require('../protocol/Protocol.js');

var DB = require('uw').DB;
var LOG = require('uw').log;
var Q = require("q");
var UTIL = require("util");

var MODULE="REST\t\t";


var Mapper = function (entity) {
    var validSession=function(req) {
        if (!req.letrest.session) {
            throw new Error('Not a valid token session. This should not happened');
        }
    };

    var preWrapper= function(req){
        var promise = Q.defer();

        try{
            promise.resolve(req.pre(req.entity,req));
        } catch(e){
            LOG.info(MODULE,'Failed to execute pre-aggregate function');
            promise.reject(e);
        }
        return promise.promise;
    };

    var postWrapper= function(req){
        var promise = Q.defer();

        try{
            promise.resolve(req.post(req.entity, req.arr, req));
            //promise.resolve(req);
        } catch(e){
            LOG.info(MODULE,'Failed to execute post-aggregate function');
            promise.reject(e);
        }

        return promise.promise;
    };

    var dummyPre = function(entity,value){
             return value;
    };

    var dummyPost = function(entity,arr,value){
        return value;
    };

    var doSend =  function(req) {
        req.res.send(PROTOCOL.success(req.entity,req.mode, req.arr));
    };

    var doError = function (req,error) {
        //debugger;
        var protocolError = PROTOCOL.getError(error);
        req.res.status(protocolError.code).send(protocolError);
    };

    var ALL = function (entity, pre, post) {
        this.service = function (req, res) {


            LOG.info(MODULE,'Executing ALL request for entity =>', entity.table);
            try {
                validSession(req);

                req.pre = pre || dummyPre;

                req.post = post || dummyPost;

                req.entity = entity;
                req.mode = 'all';
                req.res = res;

                preWrapper(req)
                    .then(STRATEGY.select)
                    .then(postWrapper)
                    .then(doSend)
                    .catch(function(error){
                        console.log(error);
                        doError(req,error);
                    });

            } catch (e) {
                LOG.error(MODULE,'Failed to validate session.', e.toString());
                res.status(500).send(PROTOCOL.serverError(e));
            }
        }
    };

    var GET = function (entity, pre, post) {
        this.service = function (req, res) {

           

            LOG.info(MODULE,'Executing GET request for entity =>', entity.table);

            try {
                validSession(req);
                req.pre = pre || dummyPre;
                req.post = post || dummyPost;

                req.entity = entity;
                req.mode = 'get';
                req.res = res;

                preWrapper(req).then(STRATEGY.select)
                    //.then(postWrapper)
                    .then(function (req) {
                            if (req.arr.length == 0) {
                                req.res.status(404).send(PROTOCOL.notFound());
                                throw new Error('');
                            } else {
                                return postWrapper(req);
                            }
                        })
                    .then(doSend)
                    .catch(function(error){
                        doError(req,error);
                    });


            } catch (e) {
                LOG.error(MODULE,'Failed to process query', e);
                res.send(500, PROTOCOL.serverError(e));
            }
        }
    };

    var POST = function (entity, pre, post) {
        this.service = function (req, res) {

           
            LOG.info(MODULE,'Executing POST request for entity =>', entity.table);
            try {
                validSession(req);
                req.pre = pre || dummyPre;
                req.post = post || dummyPost;

                req.entity = entity;
                req.mode = 'post';
                req.res = res;

                var V = SCHEMA.validate(entity, req.body);
                LOG.verbose(MODULE,'Validation result',V);
                if (V.errors.length > 0) {
                    res.status(400).send(PROTOCOL.validationError(V.errors));
                } else {
                //LOG.verbose(MODULE,"Preparing query");
                    preWrapper(req).then(STRATEGY.insert)
                        .then(postWrapper)
                        .then(doSend)
                        .catch(function(error){
                            doError(req,error);
                        });
                }
            } catch (e) {
                LOG.error(MODULE,'Failed to process query because of =>', e.toString());
                res.status(500).send(PROTOCOL.serverError(e));
            }
        }
    };

    var PUT = function (entity, pre, post) {
        this.service = function (req, res) {

          

            LOG.info(MODULE,'Executing PUT request for entity =>', entity.table);
            try {
                //If pre or post is not defined we create a dummy function
                req.pre = pre || dummyPre;
                req.post = post || dummyPost;

                req.entity = entity;
                req.mode = 'put';
                req.res = res;

                var V = SCHEMA.validate(entity, req.body);
                if (V.errors.length > 0) {
                    res.send(400, PROTOCOL.validationError(V.errors));
                } else {
                    preWrapper(req)
                        .then(STRATEGY.update)
                        .then(postWrapper)
                        .then(doSend)
                        .catch(function(error){
                            doError(req,error);
                        });
                }
            } catch (e) {
                LOG.error(MODULE,'Failed to validate session.', e);
                var protocolError = PROTOCOL.serverError(e);
                res.status(protocolError.code).send(protocolError.msg);
            }
        }
    }
    var DELETE = function (entity, pre, post) {
        this.service = function (req, res) {

            


            LOG.info(MODULE,'Executing DELETE request for entity =>', entity.table);
            try {

                //If pre or post is not defined we create a dummy function
                req.pre = pre || dummyPre;

                req.post = post || dummyPost;

                req.entity = entity;
                req.mode = 'delete';
                req.res = res;

                preWrapper(req).then(STRATEGY.delete)
                    .then(postWrapper)
                    .then(doSend)
                    .catch(function(error){
                        doError(req,error);
                    });
            } catch (e) {
                LOG.error(MODULE,'Failed to process query ->', e.toString());
                res.send(500, PROTOCOL.serverError(e));
            }
        }
    };

    this.createPath = function (type) {
        if (entity.path.indexOf("/", entity.path.length - 1) !== -1) throw new Error('The service path should not end with a \"/\"');
        switch (type) {
            case "all":
                return  (entity.path);
            case "post":
                return  (entity.path + "/");
            case "put":
            case "get":
            case "delete":
                return  (entity.path + "/" + CONFIG.pk_template);
        }

    };

    this.map = function (router) {
        var PATH = require('path');
        var HUB = {'all': ALL, 'get': GET, 'post': POST, 'put': PUT, 'delete': DELETE};
        for (var definedService in entity.service) {
            LOG.info(MODULE,'- Configuring %s service', definedService.toUpperCase());
            var path = this.createPath(definedService);
            var pre=null,post=null;
            if (entity.service[definedService].pre) {
                var pair = entity.service[definedService].pre.split('@');
                LOG.info(MODULE,"\t- Mapping pre message '%s' in '%s'", pair[0], pair[1]);
                pre = require(PATH.dirname(require.main.filename) + '/' + pair[1])[pair[0]];
            }
            if (entity.service[definedService].post) {
                var pair = entity.service[definedService].post.split('@');
                LOG.info(MODULE,"\t- Mapping post message '%s' in '%s'", pair[0], pair[1]);
                post = require(PATH.dirname(require.main.filename) + '/' + pair[1])[pair[0]];
            }
            //I hacked the 'all' to 'get' because Express has an all action.
            var queryService=definedService;
            if (queryService=='all') queryService='get';

            router.route(path)[queryService](SECURITY.secure(entity, entity.service[definedService].weight),new HUB[definedService](entity, pre, post).service);
        }

    }

};

exports.config = function (router) {
    LOG.info(MODULE,'Configuring REST services');
    for (var k in ENTITIES) {
        LOG.info(MODULE,'Mapping entity', k);
        var entity = ENTITIES[k]
        //Default route for all services
        new Mapper(entity).map(router);
    }
};
