/**
 * Created by memili on 07/06/14.
 */


exports.newError=function(code,msg,type,trace) {
    return {
        type:'error',
        errorType:type,
        code:code,
        msg:msg,
        trace:trace
    }
}

exports.serverError=function(e) {
    return this.newError(500, e.message,'server');
}


exports.notFound=function() {
    return this.newError(404, 'Entity not found','server');
}

exports.dataError=function() {
    return this.newError(500,'Failed to retrieve data','server');
}

exports.validationError=function(errors) {
    return this.newError(400,'There are format issues','business',errors);
}

exports.getError=function(error) {

    if(!error.code)
        return this.dataError();

    switch(error.code){
        case 400:
            return this.validationError(error.message);
        case 404:
            return this.notFound();
        case 500:
            return this.dataError();
        default:
            return this.newError(error.code,error.message,'business');

    }
};

exports.success=function(entity,action,data) {

    if (data instanceof Array) {
        return {
            entity:entity.name,
            data:data,
            rows:data.length,
            paginated:data.paginated,
            total_rows: data.total_rows,
            from:data.from||0
        };
    } else {
        return {
            entity:entity.name,
            data:data
        };
    }

}