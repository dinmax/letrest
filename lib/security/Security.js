var CONFIG=require('../Config.js').getSecurity().config;
var DB=require('uw').DB;
var LOG=require('uw').log;
var Q=require("q");
var UTIL=require("util");
var MOMENT = require('moment');
var JWT = require('jwt-simple');
var PR=require('../protocol/Protocol.js');
var STRATEGY=require(CONFIG.STRATEGY.IMPORT);
var VALIDATOR = require('jsonschema').Validator;
var SCHEMA = require('./credentialschema.json');
var MODULE="SECURITY\t";

/*
Token Manipulation
 */
var createPayload=function(accountid,role,name,nick) {
    var expires = MOMENT().add(CONFIG.KEYEXPIRATION,'hours').valueOf();
    var payload= {
        sso: accountid,
        ttl: expires,
        role:role,
        name:name,
        nick:nick
    };
    return payload;
}
var createSessionToken=function(accountid,role,name,nick) {
    return JWT.encode(createPayload(accountid,role,name,nick), CONFIG.KEYPASS);
}
var recoverSessionToken=function(token) {
    return JWT.decode(token,CONFIG.KEYPASS);
}
var validateSessionToken=function(token) {
    var TK=recoverSessionToken(token);
    //If the elapsed is positive it means that the session has expired
    var elapsed=MOMENT()-TK.ttl;
    if (elapsed>0) throw  new Error('Session expired');
    return TK;
}

exports.secure=function(entity, serviceWeight) {
    return function(req,res,next) {
        //FIXME This must support the role mapping to be able to mix numbers with role names.
        serviceWeight=serviceWeight||entity.weight||-1;
        LOG.info(MODULE,'Validating weight for %s with weight %s',entity.name,serviceWeight);
        if (req.letrest && req.letrest.session && req.letrest.session.role) {
           if (serviceWeight>req.letrest.session.role.weight) {
               LOG.warn(MODULE,'Not enough rights for request');
               res.send(403);
           } else {
               next();
           }
        } else {
            //We dont have a session but the user service has security rights
            if (serviceWeight>-1) {
                LOG.warn(MODULE,'User must be logged to use the service');
                res.send(401);
            } else {
                next();
            }
        }
    };
};

exports.config=function(router) {
    /*
    CORS Support for all the server
     */
    router.use(function(req, res, next) {
        var oneof = false;
        if(req.headers.origin) {
            res.header('Access-Control-Allow-Origin', req.headers.origin);
            oneof = true;
        }
        if(req.headers['access-control-request-method']) {
            res.header('Access-Control-Allow-Methods', req.headers['access-control-request-method']);
            oneof = true;
        }
        if(req.headers['access-control-request-headers']) {
            res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
            oneof = true;
        }
        if(oneof) {
            res.header('Access-Control-Max-Age', 60 * 60 * 24 * 365);
        }
        // intercept OPTIONS method
        if (oneof && req.method == 'OPTIONS') {
            res.status(200).end();
        }
        else {

            var session;
            try {
                var token=req.header('Token');
                LOG.info(MODULE,"Populating session for token =>",token);
                if (token) session=validateSessionToken(token);
                if (!session) throw new Error();
            } catch (e) {
                LOG.error(MODULE,"Failed to parse token",token, e.toString());
                session=undefined;
            };
            req.letrest={
                session:session
            };
            next();
        }
    });
    /*
    Rule for validate the secured path against the SSO
     */
    router.use(CONFIG.SECURED_PATH.path,function(req, res, next) {
        LOG.info('Authorized request')
        try {
            var token=req.header('Token');
            if (token) {
                //Validate token
                var tokenObject=validateSessionToken(token);
                //The framework assume that the account its the first part of the request
                var exp=new RegExp('^[\/]'+tokenObject.sso+'$|^[\/]'+tokenObject.sso+'[\/]');
                if (exp.test(req.url)) {
                    next();
                } else {
                    throw new Error('Unauthorized path request');
                }
            } else {
                throw new Error('Unauthorized request');
            }
        } catch (e) {
            LOG.error(e);
            res.send(401,PR.newError(401,'You need to have a valid session'));
         }
    });
    /*
      TBI Path for register new accounts
     */
    router.post(CONFIG.REGISTER_PATH.path,function(req,res){

        console.log('should not  have a session');


    });
    /*
     Role session generation and recover
     */
    var roleMixIn=function(session) {
        LOG.info(MODULE, "Mixining in session with roles");
        var defer= Q.defer();
        //FIXME We should have a catching strategy so we can only get this when the roles have changed.
        STRATEGY.getRoles().then(function(roles){
            var mapRole={};
            for (var i=0;i<roles.length;i++) {
                mapRole[roles[i][CONFIG.CREDENTIAL_ROLE]]=roles[i][CONFIG.CREDENTIAL_WEIGHT];
            }
            defer.resolve({roles:mapRole,session:session});
        });
        return defer.promise;
    };
    router.get(CONFIG.ROLE_PATH.path,function(req,res){
        var session;
        try {
            var token=req.header('Token');
            if (token) session=validateSessionToken(token);
            delete session.ttl;
        } catch (e) {
            session=undefined;
        };
        roleMixIn(session).then(function(sessionMixIn){
            res.send(PR.success('session','get',sessionMixIn));
        }).catch(function(error){
            res.send(PR.newError(2,'Failed to retrieve roles',error));
         });;
    });
    /*
     Login action
     */
    router.post(CONFIG.LOGIN_PATH.path,function(req,res){
        try {
            var body=req.body;
            var validation=new VALIDATOR().validate(body,SCHEMA);
            if (validation.errors.length>0) {
                res.send(400, validation.errors);
            } else {
                STRATEGY.login(req.body).then(function(credential){
                    //If no credentials that the user and password was incorrect
                    if (credential==null) {
                        res.send(PR.newError(0,'Username or password incorrect',''));
                    } else {
                        //FIXME We should include the concept of group for more advance security restrictions
                        var role={name:'GUEST',weight:-1};
                        if (credential[CONFIG.CREDENTIAL_ROLE]) {
                            role.name=credential[CONFIG.CREDENTIAL_ROLE];
                            role.weight=credential[CONFIG.CREDENTIAL_WEIGHT];
                            role.id=credential[CONFIG.CREDENTIAL_ROLE_ID];
                        }
                        var fullname=credential[CONFIG.CREDENTIAL_NAME]||'Guest';
                        var dummySession=createPayload(credential[CONFIG.CREDENTIAL_KEY],role,fullname,credential[CONFIG.CREDENTIAL_NICK]);
                        delete dummySession.ttl;
                        roleMixIn(dummySession).then(function(sessionMixIn){
                            //We create the token an return the successfully connection
                            res.send({msg:'Login successful',token:createSessionToken(credential[CONFIG.CREDENTIAL_KEY],role,fullname,credential[CONFIG.CREDENTIAL_NICK]),session:sessionMixIn});
                        }).catch(function(err){
                                LOG.error(MODULE,err);
                                res.send(PR.newError(1,'Internal problem error',err));
                        });

                }
                }).catch(function(err){
                        LOG.error(MODULE,err);
                        res.send(PR.newError(1,'Internal problem error',err));
                });
            }
        } catch (e) {
            res.send(PR.newError(2,'Bad format message',e));
        }
    });


}
