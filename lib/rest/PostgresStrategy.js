/**************************************************************
 * PostgresSQL Strategy
 * ------------------------------------------------------------
 *
 *************************************************************/
var CONFIG = require('../Config.js').getConfig();

var DB=require('uw').DB;
var UW_U=require('uw').util;
var LOG=require('uw').log;
var Q=require("q");
var UTIL=require("util");
var DOTTY=require("dotty");
var MODULE="PGSQL  \t"
//FIXME when running the server the require isn't working
var M=require("moment");
//FIXME when invoking it as an instance also doesn't work
//var MO=M();

var QUERY=function(service,action,entity,params,body,query,security) {
    var CONST_SELECT = "SELECT %s FROM %s %s WHERE %s %s %s %s";
    var CONST_INSERT = "INSERT INTO %s (%s) VALUES(%s) RETURNING %s";
    var CONST_UPDATE = "UPDATE %s SET %s WHERE %s  RETURNING %s";
    var CONST_DELETE = "DELETE FROM %s WHERE %s";
    var paginated=false;
    var from=0;
    var rowTemplate={};


    var returnAsType=function(object,type) {
        var type=type.toLowerCase();
        switch (type) {
            case 'boolean':
                return new Boolean(object);
            case 'number':
                return new Number(object);
            case 'date':
                return new Date(object);
            default :
                return object;
        }

    };

    this.enrichRows=function(rows) {
        var lst=[];
        for (var i=0;i<rows.length;i++) {
            lst.push(this.enrichRow(rows[i],entity));
        }
        lst.from=from;
        lst.paginated=paginated;

        lst.total_rows = (rows.length<=0) ? 0 : rows[0].__rowstotal;
        return lst;
    }
    this.enrichRow=function(row) {
        var nr={};
        if (!row) return nr;
        for (k in rowTemplate) {
            var template=rowTemplate[k];
            DOTTY.put(nr,template.attribute.replace(new RegExp('_f_','g'),'.'),returnAsType(row[template.attribute],template.type));
        }
        return nr;
    }


    var processFields=function() {
        var fields="";
        if (entity.service)
            if (entity.service['post']) {

                if (entity.fk) {
                    for (var k in entity.fk) {
                        fields+=','+entity.fk[k].field
                    }
                }

                var mapping=entity.mapping;
                if (!mapping) throw new Error("You MUST specify a mapping for the entity '"+entity.table+"'");
                for (var i=0;i<mapping.length;i++) {
                    var m=mapping[i];
                    if (!m.external) {
                        fields+=','+ m.field.split('@')[0];
                    }
                }
            }
        return fields.substring(1,fields.length);
    }

    var getFKValue=function(fk) {
        var value;
        if (fk.type=="url"||fk.type=='path') {
            console.log('getFKValue - URL or PATH',fk.value);
            value= params[fk.value];
        } else {
            console.log('getFKValue - DOTTY',fk.value);
            value= DOTTY.get(body,fk.value);
        }
        //If have a custom SQL we prcess it.
        if (fk.sql) {
            var query=fk.sql;
            query=processSecurity(query);
            if(!value)
                value = null;
            query=query.replace(new RegExp('#value#','g'),value);
            console.log('getFKValue - sql',query);
            return query;
        }
        return value;
    }
    var processValues=function() {
        var values="";
        if (entity.service)
            if (entity.service['post']) {
                if (entity.fk) {
                    for (var k in entity.fk) {
                        values+=','+getFKValue(entity.fk[k]);
                    }
                };
                var mapping=entity.mapping;
                for (var i=0;i<mapping.length;i++) {
                    var m=mapping[i];
                    if (!m.external) {
                        values+=','+ getMappingValue(m.attribute.replace(new RegExp('@','g'),'.'), m.type, m.value);
                    }
                };
            }
        return values.substring(1,values.length);
    }

    var getMappingValue=function(path,type,value) {
       console.log('getMappingValue',path,type,value);

        switch (type||'object') {
             default:
                var v=DOTTY.get(body,path);
                if (v==undefined) {
                    return 'null';
                };
                if (type=='json') {
                    return "'"+ JSON.stringify(v)+"'";
                };
                if (type=='date') {
                    //We shoud format to a PG valid date format.

                };
                return "'"+ new String(v).replace(new RegExp("'"),"''")+"'";
                break;
            case 'value':
                return value;
                break;
        }

    }
    var getAbsoluteField=function(field) {
        var path=field.split('@');
        if (path.length<2)return path[0];
        return path[1]+'.'+path[0];
    };

    var processType=function(value,filter) {
        var type=filter.type;
        var prefix=filter.prefix||'';
        var suffix=filter.suffix||'';
        if (value==null || value == undefined) return null;
        try {
            switch ((type || 'string').toLocaleLowerCase()) {
                case "sql":
                    return value;
                case "date":
                    var m = require("moment");
                    // save the double "" on the beggining and the end of value in some cases that caused problems
                    value = value.replace("\"\"","\"");
                    //ANY date should be seralizrd as "YYYY/MM/DD"
                    value = m(value.substr(0,10),"YYYY/MM/DD").format( 'YYYY/MM/DD');
                    //TODO this date managment maybe needs a bit more of thinking
                    return "'"+prefix+value+suffix+"'";
                case "datetime":
                    var m = require("moment");
                    value = m(value).format( 'YYYY/MM/DD HH:mm:ss');
                    return "'"+prefix+value+suffix+"'";
                case "number":
                    if (isNaN(value)) throw new Error('Not a valid number:'+value);
                    return value;
                case "boolean":
                    return new Boolean(value);
                default:
                    return "'"+prefix+value+suffix+"'";
            };
        } catch (e){
            LOG.error(MODULE,"Failed to parse filter type:"+type,error);
            throw e;
        }
    };
    var processFilter=function(pFilter) {
        /*
             {
                 "key":"advertiserid", => Name to be used to search on the sptified hashmap
                 "field": "advertiserid", => Name of the database field
                 "source":"path", => path (Retrieves the value from the path) | url (Retrieves the value from the query string) | security (it doesnt retrieve the value from nowhere)
                 "value":"", => Value to assign to the right part of the filter. This should be complaiant with the specified type. ie. If it is a string it must come with the quotes. 'pepe'.
                 "comparator":"=" => Posible types of comparisons '>','<','=','>=','<=','like'
                 "type":"string" => Posible types are 'string'|'date'|'number'|'boolean'|'sql'
                 "suffix": "%" => It will append the value to the user sent text
                 "prefix": ""  => It will prepend the value to the user sent text
             }

             == SECURITY PROCESS ==
             #account_id#     Will be replaced by the sso session
             #account_nick#   Will be replaced by the session nick
             #account_role#   Will be replaced by the session role
             #account_weight# Will be replaced by the session weight

         */
        var condition="";
        var processFilter=function(filter) {
            switch (filter.source) {
                case 'path':
                    return filter.field+' '+filter.comparator+' '+processSecurity(params[pFilter.key]||filter.value);

                case 'url':
                    return filter.field+' '+filter.comparator+' '+processSecurity(processType(query[pFilter.key],filter)||filter.value);

                case 'security':
                    return filter.field+' '+filter.comparator+' '+processSecurity(filter.value);



            }
        }
        //Support for multiple applies on one field (QuickSearch)
        if (pFilter.field instanceof Array) {
            condition+="( false ";
            for (var i=0;i<pFilter.field.length;i++) {
                var filterCopy=JSON.parse(JSON.stringify(pFilter));
                filterCopy.field=pFilter.field[i];
                filterCopy.value=pFilter.value[i];
                condition+=" OR "+processFilter(filterCopy);
            };
            condition+=")"

        } else {
            /*
                The framework support a custom way to proceess the value of query string parameter
                If it has the format @[value,value,value] it will create and OR between all the posible values on the same field
            */
            //Validates if the value it is a list or one value. WE MUST USE A MORE PROFESIONAL WAY OF VALIDATION.

                if (query[pFilter.key]&&query[pFilter.key].indexOf('@[')==0) {
                    var re = /^@\[(.*)[\]]$/;
                    var subst = '$1';
                    var text=query[pFilter.key].replace(re, subst);
                    var values=text.split(',');
                    condition+="( false ";
                    for (var i=0;i<values.length;i++) {
                        query[pFilter.key]=values[i];
                        condition+=" OR "+processFilter(pFilter);
                    };
                    condition+=")"
                } else {
                    condition=processFilter(pFilter);
                }
        }
        return condition;
    };

    var processSecurity=function(text) {
        text=UW_U.replaceAll(text,"#account_id#",security.sso);
        text=UW_U.replaceAll(text,"#account_nick#",security.nick);
        text=UW_U.replaceAll(text,"#account_role_id#",security.role.id);
        text=UW_U.replaceAll(text,"#account_role#",security.role.name);
        text=UW_U.replaceAll(text,"#account_weight#",security.role.weight);
        return text
    };
    var processWhere=function() {
        var where="1=1";
        //Evaluates if it have to add a custom filter
        if (entity.service)
            if (entity.service[service])
                if (entity.service[service].filter) {
                    var filters=entity.service[service].filter;
                    for (var k in filters) {
                        if (filters[k].mode&&filters[k].mode=='dummy') continue;
                        where+=" and "+processFilter(filters[k]);
                    }
                }
        /*
          If it has to add it, it will add the PK
          this will fetch from the URL the PK and will be applied to the query
          this is related with the CONFIG.pk_template which will be used by WADL
        */
        if (params[CONFIG.pk_name]){
            where+=" and "+entity.table+"."+getAbsoluteField(entity.pk)+"="+params[CONFIG.pk_name];
        }
        return where;
    };

    var processSets=function() {
        var fields="";
        if (entity.service) {
            if (entity.service['put']) {

                if (entity.fk) {
                    for (var k in entity.fk) {
                        if (entity.fk[k].field != entity.pk) {
                            fields += ',' + entity.fk[k].field + '=' + getFKValue(entity.fk[k]);
                        }
                    };
                };
                var mapping = entity.mapping;
                for (var i = 0; i < mapping.length; i++) {
                    var m = mapping[i];
                    if (!m.external) {
                        fields += ',' + m.field.split('@')[0] + '=' + getMappingValue(m.attribute.replace(new RegExp('@', 'g'), '.'), m.type, m.value);
                    };
                };
                fields = fields.substring(1, fields.length);
            };
        }
        if (!fields) throw new Error('processSets, unable to find a valid service.');
        return fields;
    };

    var processOrder=function() {
        if (service == 'all' && query.GROUP) {
            if(query.ORDER)
                return processGroupOrder();

            if(entity.service[service].group.order)
                return defaultOrderGroup().replace("GROUP BY","ORDER BY");
            //FIXME This is a workaround until we define a better way to handle order inside a group by.

            return processGroup().replace("GROUP BY","ORDER BY");

        } else {
            if (service == 'all' && (query.ORDER)) {
                var orders = query.ORDER.split(',');
                var all = '';
                for (var i = 0; i < orders.length; i++) {
                    var order = orders[i].trim().split(' ');
                    if (order.length > 2) throw new Error("Bad Order format. It should be 'order [asc|desc],order1 [asc|desc]. Spaces are not allowed between order and modificator");
                    if (entity.service[service].order) {
                        var realOrder = entity.service[service].order[order[0]];
                        if (realOrder) {
                            all += ',' + realOrder + (order.length > 1 ? ' ' + order[1] : '');
                        } else {
                            throw new Error("Order '" + order[0] + "' not defined on the entity.");
                        }
                    } else {
                        all += ',' +  order[0] + ' ' + order[1];

                    }
                }
                if (all)all = " ORDER BY " + all.substring(1);
                return all;
            } else {
                if (entity.service[service].order && entity.service[service].order['default']) {
                    return " ORDER BY " + entity.service[service].order['default'];
                }
            }
        }
        return "";
    };

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
        //return ' OFFSET 0 LIMIT '+CONFIG.max_rows;
        //TODO a simple way to remove the limit from the queries
        return ' OFFSET 0 '+ ((entity.nolimit) ? '':'LIMIT '+CONFIG.max_rows);
    };

    var processJoin=function() {
        var join="";
        if (entity.fk) {
            for (var k in entity.fk) {
                var fk=entity.fk[k];
                var map=fk.relation.split("@");
                var jointype=fk.jointype||"INNER";
                var sourcetable=fk.source||entity.table;
                var comparator=fk.comparator||"=";
                var asAlias = (fk.alias) ? " as "+ fk.alias:"";
                var alias = (fk.alias) ? fk.alias:map[1];
                join+=" "+jointype+" JOIN "+map[1]+asAlias+ " ON "+alias+"."+map[0]+comparator+sourcetable+"."+fk.field+" ";
            }
        }
        return join;
    };

    var defineFields=function() {
        var fields=",";
        var mapping;
        //We check if we have a group by set
        if (query.GROUP) {
            mapping=[];
            var g=entity.service['all'].group;
            var measures=g["measures"];
            var dimensions=g["dimensions"];
            var filter=null;
            if (query.GROUP.trim()!="*") {
                var arr=query.GROUP.split(',');
                filter={};
                for(var i=0;i<arr.length;i++) filter[arr[i]]="OK";
            } else {
                filter=dimensions;
            }
            Object.keys(measures).forEach(function(k){
                 mapping.push(measures[k]);
            });

            Object.keys(dimensions).forEach(function(k){
                if (filter[k]) mapping.push(dimensions[k]);
            });
        } else {
            //We use the normal mapping definition.
            mapping = entity.mapping;
        }
        for (var i = 0; i < mapping.length; i++) {
            //Create a row template
            var attribute = mapping[i].attribute.replace(new RegExp('@', 'g'), '_f_');
            var field = mapping[i].field.replace(new RegExp('@', 'g'), '_f_');
            rowTemplate[field] = {attribute: attribute, type: mapping[i].type || 'string'};
            fields += getAbsoluteField(mapping[i].field) + ' as ' + attribute + ',';
        }
        return fields.substring(1, fields.length - 1);

    };

    var processGroup=function() {
        if (query.GROUP) {
            var fields="";
            var hash=null;
            if (query.GROUP!="*") {
                var hash={};
                var arr=query.GROUP.split(',');
                for(var i=0;i<arr.length;i++) hash[arr[i]]="OK";
            }
            var g=entity.service['all'].group;
            var dimensions=g["dimensions"];
            Object.keys(dimensions).forEach(function(k){
                if (hash==null || hash[k]) fields+=","+dimensions[k].field.replace(new RegExp('@', 'g'), '.');
            });
            return " GROUP BY "+fields.substring(1, fields.length )+" ";
        }
        return "";
    };


    var defaultOrderGroup=function() {

        var fields="";

        var arr="";
        if (query.GROUP!="*") {
            var hash={};
            arr = query.GROUP.split(',');
            for(var i=0;i<arr.length;i++) hash[arr[i]]="OK";
        }
        if (query.AGGREGATE!="*") {
            var hashAggregate={};
            arr = query.AGGREGATE.split(',');
            for(var i=0;i<arr.length;i++) hashAggregate[arr[i]]="OK";
        }
        var g=entity.service['all'].group;

        var dimensions=g["dimensions"];
        var measures=g["measures"];


        arr=entity.service.all.group.order;
        for(var i = 0; i<arr.length;i++){
           k = arr[i];
           if(dimensions[k] && (hash==null || hash[k])) {
               fields += "," + dimensions[k].field.replace(new RegExp('@', 'g'), '.');
           }
           if(measures[k] && hashAggregate[k]) {
               fields += "," + measures[k].field.replace(new RegExp('@', 'g'), '.');
           }
        }
        return "ORDER BY "+fields.substring(1, fields.length )+" ";

    };

    var processGroupOrder=function() {

            var fields="";
            var hash=null;
            if (query.ORDER!="*") {
                var hash={};
                var arr=query.ORDER.split(',');
                for(var i=0;i<arr.length;i++) {
                    hash[arr[i].trim().split(' ')[0]]= {
                        order: arr[i].trim().split(' ')[1]
                    };
                }
            }
            var g=entity.service['all'].group;
            var dimensions=g["dimensions"];
            Object.keys(dimensions).forEach(function(k){
                if (hash==null || hash[k]) fields+=","+dimensions[k].field.replace(new RegExp('@', 'g'), '.')+" "+hash[k].order;
            });
            var measures=g["measures"];
            Object.keys(measures).forEach(function(k){
                if (hash==null || hash[k]) fields+=","+measures[k].attribute.replace(new RegExp('@', 'g'), '.')+ " "+hash[k].order ;
            });
            return " ORDER BY "+fields.substring(1, fields.length )+" ";
        return "";
    };


    this.parse=function() {
        if (!entity.pk) throw new Error('You MUST specify a PK for the entity "'+entity.name+"'");
        switch (action) {
            case "select":
                //TODO rethink if it's correct add totalRows here or it should be on defineFields
                var totalRows = ",count(1) over() as __ROWSTOTAL";
                return LOG.show(MODULE,UTIL.format(CONST_SELECT,defineFields()+totalRows,entity.table,processJoin(),processWhere(),processGroup(),processOrder(),processLimit()));
            case "insert":
                return LOG.show(MODULE,UTIL.format(CONST_INSERT,entity.table,processFields(),processValues(),entity.pk));
            case "update":
                return LOG.show(MODULE,UTIL.format(CONST_UPDATE,entity.table,processSets(),processWhere(),entity.pk));
            case "delete":
                return LOG.show(MODULE,UTIL.format(CONST_DELETE,entity.table,processWhere()));
        }
    }
}


exports.select=function(req) {

    var promise = Q.defer();
    var query=new QUERY(req.mode,'select',req.entity,req.params,null,req.query,req.letrest.session);
        DB.query(query.parse()).then(function(arr){
            req.arr = query.enrichRows(arr.rows);
            promise.resolve(req);
        }).catch(function(err){
            LOG.error(err);
            promise.reject('Failed to execute query');
        });
    return promise.promise;
}

exports.insert=function(req) {
    LOG.verbose(MODULE,"Insert request");
    var promise = Q.defer();
    var query=new QUERY(req.mode,'insert',req.entity,req.params,req.body,req.query,req.letrest.session);
    DB.query(query.parse()).then(function(arr){
        var obj=req.body;
        obj[req.entity.pk]=arr.rows[0][req.entity.pk];
        req.arr = obj;
        promise.resolve(req);
    }).catch(function(err){
        LOG.error(err);
        promise.reject('Failed to execute query');
    });
    return promise.promise;
}

exports.update=function(req) {
    var promise = Q.defer();
    var query=new QUERY(req.mode,'update',req.entity,req.params,req.body,req.query,req.letrest.session);
    DB.query((query.parse())).then(function(arr){
        var obj=req.body;
        obj[req.entity.pk]=arr.rows[0][req.entity.pk];
        req.arr = obj;
        promise.resolve(req);
    }).catch(function(err){
        LOG.error(err);
        promise.reject('Failed to execute query');
    });
    return promise.promise;
}

exports.delete=function(req) {
    var promise = Q.defer();
    var query=new QUERY(req.mode,'delete',req.entity,req.params,req.body,req.query,req.letrest.session);
    DB.query((query.parse())).then(function(arr){
        req.arr= {
            rowsAffected: arr.rowCount
        };
        promise.resolve(req);
    }).catch(function(err){
        LOG.error(err);
        promise.reject('Failed to execute query');
    });
    return promise.promise;
}


