module.exports.allservice=function(req,res) {

    require('uw').DB.getTables().then(function(rs){
            res.send(rs);
        }).catch(function(e){
            res.send(500,e);
        }
    );

};
