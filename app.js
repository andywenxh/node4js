const express  = require('express');
const https = require('https');
const fileSystem = require('fs'); 
const encode = require('nodejs-base64-encode');

const ctrlPort = 81
const mockPort = 80;
const mockTlsPort = 443

//controller setup
const ctrlApp     = express();
var contServer    = null;
var mockServer    = null;
var tlsMockSvr    = null;

var mockPowerOn      = false;
var nextMockResult   = "";
var nextMockWaitTime = "";
var mockResponseOverride = null;
var emptyResponseBody = false;

// sleep in miliseconds 
var sharedArrayBuffer_for_sleep = new SharedArrayBuffer( 4 );
var sharedArray_for_sleep = new Int32Array( sharedArrayBuffer_for_sleep );
var sleep = function( n ) {  
  console.log(getDate() + ' start sleeping !' );
  Atomics.wait( sharedArray_for_sleep, 0, 0, n );
  console.log( getDate() + ' end sleeping !');
}

var lastPostRequest = {};

//start up the https based mock server
var tlsOptions = { 
  key: fileSystem.readFileSync('hialkey.pem'), 
  cert: fileSystem.readFileSync('hialcert.pem'), 
  ca: fileSystem.readFileSync('truststore.pem'), 
  requestCert: true, 
  rejectUnauthorized: true  
}; 


// start up the mock !
ctrlApp.get('/powerup', (req,res) => {

  logIncomingRequest(req);
  res.contentType('application/json') ;
  if (!mockPowerOn) {
        mockServer  = mockApp.listen(mockPort, () => console.log("Mock application running on port: " + mockPort));
        //tlsMockSvr  =  https.createServer(tlsOptions, mockApp ).listen( mockTlsPort, () => console.log("Mock Interface listening on TLS port: " + mockTlsPort) );
        mockPowerOn = true;
        res.send('["powering up"]');
    } 
    else {
      res.send('["already powered up"]');
    }
});

// bring down the mock !!
ctrlApp.get('/powerdown', (req, res) => {
    logIncomingRequest(req);
    res.contentType('application/json') ;  
    if ( mockPowerOn ) {
        mockServer.close();        
        
        //tlsMockSvr.close();

        mockPowerOn = false;
        res.send('["powering down"]');
        console.log('Mock application is powered down ')
    }
    else {
        res.send('["already powered down"]');
    }
});


ctrlApp.get('/', (req, resp) => {
  resp.statusCode = 200;
  resp.statusMessage = 'OK';
  resp.contentType('text/plain');
  resp.send('support GET on /powerup and /powerdown, current power status is: ' + mockPowerOn );
});


// set result for next mock response !!
ctrlApp.get('/setemptyresponse', (req, resp) =>{
  logIncomingRequest(req);
  var timeStamp = getDate() ;
  console.log('client set the next mock result as: ' + req.params.mockresult );


  emptyResponseBody = true;
  
  resp.statusCode = 200;
  resp.contentType('text/plain');
  resp.send( timeStamp + ', next http call will return empty response' );
});


// set result for next mock response !!
ctrlApp.get('/setmockresult/:mockresult', (req, resp) =>{
  logIncomingRequest(req);
  var timeStamp = getDate() ;
  console.log('client set the next mock result as: ' + req.params.mockresult );
  nextMockResult = req.params.mockresult ;
  resp.statusCode = 200;
  resp.contentType('text/plain');
  resp.send( timeStamp + ', next http status is set to ' + nextMockResult );
});

// set wait time for next transaction !!
ctrlApp.get('/setmockwaitTime/:waittime', (req, resp) =>{
  logIncomingRequest(req);
  var timeStamp = getDate() ;
  console.log('client set the next mock wait seconds to : ' + req.params.waittime );
  nextMockWaitTime = req.params.waittime ;
  resp.statusCode = 200;
  resp.contentType('text/plain');
  resp.send( timeStamp + ', next http wait time seconds is set to ' + nextMockWaitTime );
});

// set wait time for next transaction !!
ctrlApp.get('/getlastpostrequest', (req, resp) =>{
  console.log( getDate() + ' requested to get last POST request')
  resp.statusCode = 200;
  resp.statusMessage = 'OK';
  resp.contentType('application/json');
  resp.send( lastPostRequest );
});


// make the mock able to receive any kind of content up to 200MB size !!
const mockApp     = express();
const bodyParser = require('body-parser');
mockApp.use( bodyParser.text({limit: "200mb", type: "*/*"}));

// general handling
mockApp.use( function(req, resp, next) {

  //keep the last post transaction !
  if( req.method.toUpperCase() == 'POST') {
     console.log( getDate() + ' keep the current post request body');
     var base64EncodedRequest = encode.encode(req.body, 'base64');
     var url = req.protocol + '://' + req.get('host') + req.originalUrl;
     var contentType = req.header('Content-Type');
     lastPostRequest['body'] = base64EncodedRequest;
     lastPostRequest['url']  = url;
     lastPostRequest['contentType']  = contentType;
  }

  // If wait time is set, then wait for some time !!!
  if( isNumeric( nextMockWaitTime )) {
    var waitTimeInSeconds = new Number( nextMockWaitTime );
    nextMockWaitTime = "";
    console.log( getDate() + ' mock is going to sleep with seconds: ' + waitTimeInSeconds );
    sleep( waitTimeInSeconds * 1000 );
  }

  //echo the header from original request with a prefix echo
  var headers = req.headers;
  for( var key in headers ) {
    var value  = headers[key];
    var newKey = 'echo' + key;
    resp.setHeader(newKey, value);
  }

  //echo the query parameters in response header
  var queryParameters = req.query;
  for( var key in queryParameters ) {
    var value  = queryParameters[key];
    resp.setHeader(key, value);
  }  

  if (req.method === 'OPTIONS') {
    resp.setHeader('Access-Control-Allow-Origin', '*');
    resp.setHeader('Access-Control-Allow-Method', 'GET, POST, OPTIONS');
    resp.setHeader('Access-Control-Allow-Credentials', true);
    resp.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
  
    resp.send(200);
  }
  else {
      next();
  }
} );


mockApp.get('/', (req, resp) => {

  resp.statusCode = 200;
  resp.statusMessage = 'OK';
  resp.contentType('application/json');

  var responseBody = {
    'controller': {
       'port': 81,
       'handlers':[
         '/powerup',
         '/powerdown',
         '/setmockresult/2xx|3xx|4xx|5xx',
         '/setmockwaitTime/1234[seconds]',
         '/getlastpostrequest',
         '/setemptyresponse'
       ]
    },

    'mock':{
      'httpPort': 80,
      'httpsPort': 443,
      'get': ['/API/FHIR/test'],
      'post':['/API/HRM/test','/API/FHIR/test','/mock/cdrin/hl7v2','more...']
    }
  };

  resp.send(responseBody);

});

mockApp.post('/API/HRM/test',   defaultHandler );

mockApp.post('/API/FHIR/test',  defaultHandler );
mockApp.get( '/API/FHIR/test',  defaultHandler );

mockApp.post('/deep/$post',  defaultHandler );
mockApp.post('/ctemplate',   defaultHandler );
mockApp.get( '/ctemplate',   defaultHandler );

mockApp.post('/ptemplate/multi',   defaultHandler );
mockApp.get( '/ptemplate/multi',   defaultHandler );

mockApp.post('/mappedpath',   defaultHandler );
mockApp.get( '/mappedpath',   defaultHandler );

mockApp.post('/api/Bundle', defaultHandler );
mockApp.get( '/api/Bundle', defaultHandler );

mockApp.get( '/api/Bundle/:bundleid', (req, resp) => {  
  var bundleid = req.params.bundleid;
  mockResponseOverride = {
    'buldleid' : bundleid
  }; 
  defaultHandler( req, resp );
});

//for HL7 v2 CDR data in
mockApp.post('/', cdrinHandler);
mockApp.post('/mock/cdrin/hl7v2', cdrinHandler );

function cdrinHandler( req, resp ) {
  
  logIncomingRequest(req);

  var ack = 'MSH|^~\\&|APPLICATION|HOSPITAL|Catalyze|INC|202111121314||ACK|MSGID5183033|P|2.4|ABC\r'
  ack = ack + 'MSA|AA|HL7MSGID|LAYER7TXNID\n';

  if( isNumeric( nextMockResult )) {
    var httpStatus = new Number( nextMockResult );
    nextMockResult = "";
    resp.statusCode = httpStatus;
    resp.statusMessage = 'NOT OK';
    resp.contentType('text/plain');
    resp.send('');
  }
  else {
    resp.statusCode = 200;
    resp.statusMessage = 'OK';
    resp.contentType('text/plain');

    var msgId = 'MsgId-' + rand();
    var txnId = 'Layer7TxnId-' + rand();

    ack = ack.replace('HL7MSGID', msgId);
    ack = ack.replace('LAYER7TXNID', txnId);
    resp.send( ack );
  }
}

function defaultHandler( req, resp ) {

  logIncomingRequest(req);
  var httpStatus = 200;
  var statusReason = 'OK';
  var simulatedErrorHeader = req.header('simulatederrorcode');
  var contentLength = req.header('Content-Length');
  var mockResponse = {"Result": "Happy Holiday"}; 

  if( mockResponseOverride != null ) {
    mockResponse = mockResponseOverride;
    mockResponseOverride = null
  }
  else if ( req.method === 'GET' ) {
     var queryParam = {};
     for (var param in req.query) {
      var value = req.query[param];
      queryParam[param] = value;
     }

     mockResponse['RequestQueryParameter'] = queryParam;
  }

  if( isNumeric( contentLength )) {
      console.log( 'Received request payload with size: ' + contentLength );
  }


  if( isNumeric( nextMockResult )) {
     httpStatus = new Number( nextMockResult );
     nextMockResult = "";
  }
  else if( isNumeric( simulatedErrorHeader )){

     httpStatus = new Number( simulatedErrorHeader );

     //override the http status if max retry and attempt cound is provided !
     var maxRetryHeader = req.header('maxretry');
     var attemptcountHeader = req.header('attemptcount');
     if( isNumeric(maxRetryHeader) && isNumeric(attemptcountHeader)) {
        var maxRetry = new Number( maxRetryHeader ) ;
        var attemptCount = new Number( attemptcountHeader );
        if( attemptCount == ( maxRetry + 1) ) {
            httpStatus = 200;
        }
     }
  }
  else {
     httpStatus = 200;
  }

  if( httpStatus >= 400 ) {
      statusReason = "Negative";
      mockResponse = "Bad response: HTTP" + httpStatus;
  }

  resp.statusCode = httpStatus;
  resp.statusMessage = statusReason;
  
  if( httpStatus < 400 ) {

    if ( req.method === 'GET' ) {
      // Check the accept encoding and parameters if there is _format
      var wantXML = (req.query['_format'] != null && req.query['_format'].toLowerCase().includes('xml'));
    
      if( emptyResponseBody ) {
        emptyResponseBody = false;
        
      }
      else if (wantXML) {
          resp.contentType('application/xml');
          var xmlData = fileSystem.readFileSync('dhdr.xml');
          resp.send(xmlData);
      } 
      else {
          resp.contentType('application/json');
          resp.send( mockResponse );
      }
    }
    else if ( req.method === 'POST') {
      var reqContentType = req.header('Content-Type');
      console.log( 'request content type is : ' + reqContentType );
      resp.contentType( reqContentType );
      resp.send( req.body );
    }
  }
  else {
      resp.contentType('application/json')
      resp.send('{"Error": "Error Requested by Client"}');
  }
}


// start the controller on port 9081
ctrlServer  = ctrlApp.listen( ctrlPort, () => console.log("Ctrl Interface listening on port: " + ctrlPort));
mockServer  = mockApp.listen( mockPort, () => console.log("Mock Interface listening on port: " + mockPort));
mockPowerOn = true;


//tlsMockSvr = https.createServer(tlsOptions, mockApp ).listen( mockTlsPort, () => console.log("Mock Interface listening on TLS port: " + mockTlsPort) );


function logIncomingRequest(req) { 
  var dateString = getDate();
  var url = req.protocol + '://' + req.get('host') + req.originalUrl;
  var method = req.method;
  console.log( dateString + ' Incoming ' + method + ' on ' + url);
}


// support functions
function getDate()  {
    
        let date_ob = new Date();
      
        // adjust 0 before single digit date
        let date = ("0" + date_ob.getDate()).slice(-2);
        let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
        let year = date_ob.getFullYear();
      
        // current hours
        let hours = date_ob.getHours();
        let minutes = date_ob.getMinutes();
        let seconds = date_ob.getSeconds();
      
        var dateString = year + '/' + month + '/' + date + ' ' + hours + ':' + minutes + ':' + seconds;
        return dateString;
}    

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function rand() {
  var num = Math.floor( Math.random() * 12313579  );
  var str = num + '';
  return str;
}
