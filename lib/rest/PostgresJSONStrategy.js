var CONFIG=require('../../../../letrest_entities.json').config;
var DB=require('uw').DB;
var LOG=require('uw').log;
var Q=require("q");
var UTIL=require("util");




var QUERY=function(service,action,entity,params,body,query) {
    var CONST_SELECT = "SELECT * FROM %s WHERE %s %s %s";
    var CONST_INSERT = "INSERT INTO %s (%s) VALUES(%s) RETURNING %s";
    var CONST_UPDATE = "UPDATE %s SET %s WHERE %s  RETURNING %s";
    var CONST_DELETE = "DELETE FROM %s WHERE %s";
    var paginated=false;
    var from=0;
    this.enrichRows=function(rows) {
        var lst=[];
        for (var i=0;i<rows.length;i++) {
            lst.push(this.enrichRow(rows[i],entity));
        }
        lst.from=from;
        lst.paginated=paginated;
        return lst;
    }
    this.enrichRow=function(row) {
        if (!row) return {};
        var obj=row.data;
        obj.entity=entity.table;
        obj[entity.pk]=row[entity.pk];
        return obj;
    }
    var processFields=function() {
        var fields="";
        if (entity.service)
            if (entity.service['post'].filter) {
                for (var k in entity.service['post'].filter) {
                    fields=fields+k+',';
                }
            }
        return fields+"data";
    }
    var processValues=function() {
        var values="";
        if (entity.service)
            if (entity.service['post'].filter) {
                for (var k in entity.service['post'].filter) {
                    values=values+params[k]+',';
                }
            }
        return values+"'"+JSON.stringify(body)+"'";
    }
    var processWhere=function() {
        var where="1=1";
        //Evaluates if it have to add a custom filter
        if (entity.service)
            if (entity.service[service])
                if (entity.service[service].filter) {

                    for (var k in entity.service[service].filter) {
                        where+=" and "+k+"="+params[k];
                    }
                }
        if (params[CONFIG.pk_name]){
            where+=" and "+entity.pk+"="+params[CONFIG.pk_name];
        }
        return where;
    }
    var processSets=function() {
        return "data='"+JSON.stringify(body)+"'";
    }


    var processOrder=function() {
        if (service=='all' && query.ORDER) {
            var orders=query.ORDER.split(',');
            var all='';
            for (var i=0;i<orders.length;i++) {
                var order=orders[i].trim().split(' ');
                if (order.length>2) throw new Error("Bad Order format. It should be 'order [asc|desc],order1 [asc|desc]. Spaces are not allowed between order and modificator");
                if (entity.service[service].order) {
                    var realOrder=entity.service[service].order[order[0]];
                    if (realOrder) {
                        all+=','+realOrder+(order.length>1?' '+order[1]:'');
                    } else {
                        throw new Error("Order '"+order[0]+"' not defined on the entity.");
                    }
                }
            }
            if (all)all=" ORDER BY "+all.substring(1);
            return all;
        }
        return "";
    }

    var processLimit=function() {
        if (service=='all' && query.FROM && query.ROWS) {
            var expFrom=/[0-9]*/;
            var expRows=/^[1-9][0-9]*]/;
                if (!query.FROM || !query.ROWS || !expFrom.test(query.FROM)  || !expFrom.test(query.ROWS)) {
                    throw new Error("Not a valid pagination form. Valid: url?FROM(numeric)=1&ROWS(numeric)=5. Rows should be larger than 1.");
                }
            from=query.FROM;
            paginated=true;
            return " OFFSET "+query.FROM+" LIMIT "+ Math.min(CONFIG.max_rows,query.ROWS);
        }
        return ' OFFSET 0 LIMIT '+CONFIG.max_rows;
    }

    this.parse=function() {
        switch (action) {
            case "select":
                return (UTIL.format(CONST_SELECT,entity.table,processWhere(),processOrder(),processLimit()));
            case "insert":
                return UTIL.format(CONST_INSERT,entity.table,processFields(),processValues(),entity.pk);
            case "update":
                return UTIL.format(CONST_UPDATE,entity.table,processSets(),processWhere(),entity.pk);
            case "delete":
                return UTIL.format(CONST_DELETE,entity.table,processWhere());
        }
    }
}

exports.select=function(entity,params,mode,model,query) {
    var promise = Q.defer();
    var query=new QUERY(mode,'select',entity,params,null,query);
        DB.query(query.parse()).then(function(arr){
            promise.resolve(query.enrichRows(arr.rows));
        }).catch(function(err){
            LOG.error(err);
            promise.reject('Failed to execute query');
        });
    return promise.promise;
}
exports.insert=function(entity,params,mode,model,query,security ) {
    var promise = Q.defer();
    var query=new QUERY(mode,'insert',entity,params,model,query,security);
    DB.query(query.parse()).then(function(arr){
        var obj=arr.rows[0];
        obj.data=model;
        promise.resolve(query.enrichRow(obj));
    }).catch(function(err){
        LOG.error(err);
        promise.reject('Failed to execute query');
    });
    return promise.promise;
}
exports.update=function(entity,params,mode,model) {
    var promise = Q.defer();
    var query=new QUERY(mode,'update',entity,params,model);
    DB.query((query.parse())).then(function(arr){
        var obj=arr.rows[0];
        obj.data=model;
        promise.resolve(query.enrichRow(obj));
    }).catch(function(err){
        LOG.error(err);
        promise.reject('Failed to execute query');
    });
    return promise.promise;
}
exports.delete=function(entity,params,mode,model) {
    var promise = Q.defer();
    var query=new QUERY(mode,'delete',entity,params,model);
    DB.query((query.parse())).then(function(arr){
        if (arr.rowCount==0) {
            promise.reject(null);
        }  else {
            promise.resolve(null);
        }
    }).catch(function(err){
        LOG.error(err);
        promise.reject('Failed to execute query');
    });
    return promise.promise;
}


