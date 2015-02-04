#Let Rest
Framework to really REST on your Rest.

##Overview
Framework to implement a full secured Rest service just using declarative JSON configuration files

##Dependencies

* Express 4.0
* Body parser
* moment
* jwt-simple
* uw
* jsonschema
* pg (Depends on the selected strategies)
* q 
* winston

##Install

```bash
npm install letrest
```

##Config

The config file should be in the upper folder of the node_modules.


| File      | Description |
|-----------|------------------------------------------------------------------------------|
| config.js | this is related to UW configuration, not a specific let-rest configuration) |
|[letrest_entities.json](letrest_entities.md "See entity definitions") | Configure all the services asociated to the entities |
|[letrest_security.json](letrest_security.md "See entity security")  | Configure all the security services related parameters|
|[letrest_schema.json](letrest_schema.md "See entity schema")  | Configure how has to validate all the JSON recived on the server |

##Code

This code it is a basic boilerplate of a Express server. We have added comments so you can easily add the framework to your code

```javascript
	var express    = require('express'); 		//We requre the package
	var app        = express(); 				//We create the server
	var bodyParser = require('body-parser');	//Body parser, now separated since 4.0
	app.use(bodyParser());						//We set the parser as the first middleware
	var port = process.env.PORT || 8080; 		//We define the port

	// ROUTES FOR OUR API
	// =============================================================================
	var router = express.Router(); 				// get an instance of the express Router
	require('letrest').config(app,router);
	app.use('/api', router);					//We add a base to the URL for all request
	app.listen(port);							//We start the server loop
```
