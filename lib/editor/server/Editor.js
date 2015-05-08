/**
 * Created by mdellano on 11/20/14.
 */
module.exports.start=function() {
// call the packages we neeed
    console.log("==============================");
    console.log(" Initializing Let-Rest Editor ");
    console.log("");
    console.log(" v0.0.1");
    console.log("------------------------------");

    var express = require('express');            // call express
    var app = express();                             // define our app using express
    var bodyParser = require('body-parser');

// configure app to use bodyParser()
// this will let us get the data from a POST
    app.use(bodyParser.json());
    var port =  8001;            // set our port

// ROUTES FOR OUR API
// =============================================================================
    var router = express.Router();                          // get an instance of the express Router



    router.use(function(req, res, next) {
        var oneof = false;
        if (req.headers.origin) {
            res.header('Access-Control-Allow-Origin', req.headers.origin);
            oneof = true;
        }
        if (req.headers['access-control-request-method']) {
            res.header('Access-Control-Allow-Methods', req.headers['access-control-request-method']);
            oneof = true;
        }
        if (req.headers['access-control-request-headers']) {
            res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
            oneof = true;
        }
        if (oneof) {
            res.header('Access-Control-Max-Age', 60 * 60 * 24 * 365);
        }
        // intercept OPTIONS method
        if (oneof && req.method == 'OPTIONS') {
            res.status(200).end();
        }
        if (oneof && req.method == 'OPTIONS') {
            res.status(200).end();
        }
        else {
            next();
        }

    });
    router.get('/entities', require('./EntitiesService').allservice);
    router.post('/entities', require('./EntitiesService').saveservice);
    router.get('/tables', require('./DatabaseService').allservice);

    app.use('/api',router);
// START THE SERVER
// =============================================================================
    app.listen(port);
    console.log(" Server started on",port);
    console.log("==============================");
}
