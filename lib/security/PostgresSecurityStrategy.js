/**
 * Created by noroza on 25/07/14.
 */
var CONFIG=require('../Config.js').getSecurity().config.STRATEGY;
var DB=require('uw').DB;
var LOG=require('uw').log;
var Q=require("q");
var UTIL=require("util");
var CONST_LOGIN_QUERY=UTIL.format("select * from %s where %s='%%s' and %s='%%s'",CONFIG.TABLE,
                                                                                     CONFIG.FIELDS.NICK,
                                                                                     CONFIG.FIELDS.PASSWORD)
var MODULE="PGSQL-SECURITY\t"
exports.register=function() {}


exports.getRoles=function() {
    LOG.info(MODULE,'Retriving available roles');

    var promise= Q.defer();

    if(CONFIG.ROLE_JSON){
      LOG.info(MODULE,'Using JSON provided instead query');
      promise.resolve(CONFIG.ROLE_JSON);
      return promise.promise;
    }

    DB.query(LOG.show(MODULE,CONFIG.ROLE_SQL)).then(function(arr){
            promise.resolve(arr.rows);
    }).catch(function(err){
            LOG.error(MODULE,'Failed to executed credentials query.');
            promise.reject(err);
    });
    return promise.promise;
}
exports.login=function(credentials) {
    LOG.info(MODULE,'Procesing login request for user:',credentials.username);
    var promise= Q.defer();
        DB.query(LOG.show(MODULE,UTIL.format(CONFIG.LOGIN_SQL||CONST_LOGIN_QUERY,credentials.username,credentials.password))).then(function(arr){
            //If no row means that the user and password was incorrect
            if (arr.rows.length==0) {
                promise.resolve(null);
            } else {
                promise.resolve(arr.rows[0]);
            }
        }).catch(function(err){
                LOG.error(MODULE,'Failed to executed credentials query.');
                promise.reject(err);
        })
    return promise.promise;
}
exports.logout=function() {
}
