/**
 * Created by memili on 11/06/14.
 */
var CONFIG=require('../../../../letrest_security.json').config.STRATEGY;
var DB=require('uw').DB;
var LOG=require('uw').log;
var Q=require("q");
var UTIL=require("util");

 var CONST_LOGIN_QUERY=UTIL.format("select * from %s where data->>'%s'='%%s' and data->>'%s'='%%s'",CONFIG.TABLE,
                                                                                                    CONFIG.FIELDS.NICK,
                                                                                                    CONFIG.FIELDS.PASSWORD);




exports.register=function() {

}

exports.login=function(credentials) {
    var promise= Q.defer();
        DB.query(UTIL.format(CONST_LOGIN_QUERY,credentials.username,credentials.password)).then(function(arr){
            //If no row means that the user and password was incorrect
            if (!arr.rowCount) {
                promise.resolve(null);
            } else {
                promise.resolve(arr.rows[0]);
            }
        }).catch(function(err){
                LOG.error('Failed to executed credentials query.');
                promise.reject(err);
        })

    return promise.promise;
}

exports.logout=function() {

}
