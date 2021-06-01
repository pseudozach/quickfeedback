/*
Copyright 2020 Square Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.


This sample demonstrates a bare-bones implementation of the Square Connect OAuth flow in Node.js:
    1. A merchant clicks the authorization link served by the root path (http://localhost:8000/sandbox_request_token)
    2. The merchant signs in to Square and submits the Permissions form. Note that if the merchant
        is already signed in to Square, and if the merchant has already authorized your application,
        the OAuth flow automatically proceeds to the next step without presenting the Permissions form.
    3. Square sends a request to your application's Redirect URL
        (which should be set to http://localhost:8000/sandbox_callback on your application dashboard)
    4. The server extracts the authorization code provided in Square's request and passes it
        along to the Obtain Token endpoint.
    5. The Obtain Token endpoint returns an access token your application can use in subsequent requests
        to the Connect API.
This sample requires the following dependencies:
    express (https://expressjs.com/)
*/

const dotenv = require('dotenv').config(); // Loads .env file
const express = require('express');
const cookieParser = require('cookie-parser');
const md5 = require('md5');

// var admin = require("firebase-admin");
// admin.initializeApp({
//   credential: admin.credential.cert({
//       project_id: process.env.FIREBASE_PROJECT_ID, // I get no error here
//       client_email: process.env.FIREBASE_CLIENT_EMAIL, // I get no error here
//       private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') // NOW THIS WORKS!!!
//   }),
//   databaseURL: process.env.FIREBASE_DATABASE_URL
// });

const { ApiError, Client, Environment } = require('square');
const app = express();
app.use(cookieParser());
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'ejs');

const { PORT, SQ_ENVIRONMENT, SQ_APPLICATION_ID, SQ_APPLICATION_SECRET } = process.env;

let basePath;
let environment;
if (SQ_ENVIRONMENT.toLowerCase() === "production") {
  basePath = `https://connect.squareup.com`;
  environment = Environment.Production;
} else if (SQ_ENVIRONMENT.toLowerCase() === "sandbox") {
  basePath = `https://connect.squareupsandbox.com`;
  environment = Environment.Sandbox;
} else {
  console.warn('Unsupported value for SQ_ENVIRONMENT in .env file.');
  process.exit(1);
}

// Check if example secrets were set
if (!SQ_APPLICATION_ID || !SQ_APPLICATION_SECRET) {
  console.warn('\x1b[33m%s\x1b[0m', 'Missing secrets! Configure set values for SQ_APPLICATION_ID and SQ_APPLICATION_SECRET in a .env file.');
  process.exit(1);
}

const port = PORT || "8000";
const messages = require('./messages');

// Configure Square defcault client
const squareClient = new Client({
  environment: environment
});

let newClient;

// console.log("got squareClient with env: ", squareClient, environment);

// Configure Square OAuth API instance
const oauthInstance = squareClient.oAuthApi;

// INCLUDE PERMISSIONS YOU WANT YOUR SELLER TO GRANT YOUR APPLICATION
  // "PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS",
  // "PAYMENTS_WRITE",
  // "PAYMENTS_READ",
const scopes = [
  "ITEMS_READ",
  "MERCHANT_PROFILE_READ",
  "ONLINE_STORE_SITE_READ",
  "ONLINE_STORE_SNIPPETS_READ",
  "ONLINE_STORE_SNIPPETS_WRITE"
];


app.get("/configuresnippet", (req, res) => {

  
  var siteid = req.query.siteid;
  var sitename = req.query.sitename;
  var fburl = "https://forms.gle/ZrJpK9GyqKZEcQFB8"
  var url = "/insertsnippet?siteid="+siteid+"&link="
  // href="${url}"
    // <link type="text/css" rel="stylesheet" href="style.css">
    // <meta name="viewport" content="width=device-width">
  content = `
    <div class="">
    <label for="link">Feedback form link</>
    <input id="link" type="text" style="margin: 10px;" value="${fburl}"/>
      <a class="btn"
        onClick="insert();return false;"
       >
         <strong>Insert Snippet</strong>
      </a>
    </div>
    <script>
      function insert(){
        var link = document.getElementById("link").value;
        console.log(link);
        var insertlink = "${url}" + link;
        console.log("insertlink: ", insertlink);
        // return false;
        window.location = insertlink;
      }
    </script>
    `

    getsnippet(siteid,sitename,content, res)
    // res.render('base', {
    //   content: content
    // });
});

app.get("/insertsnippet", (req, res) => {

  var siteid = req.query.siteid;
  var link = req.query.link;
  // var fburl = "https://forms.gle/ZrJpK9GyqKZEcQFB8"
  snippetcontent = `
    <style>
    .qfsticky {
      position: fixed;
      top: 50%;
      -webkit-transform: translateY(-50%) rotate(270deg);
      -ms-transform: translateY(-50%) rotate(270deg);
      transform: translateY(-50%) rotate(270deg);
      z-index: 99;
      left: 10px;
      transform-origin: left;
    }
    </style>
    <div class="qfsticky">
      <a class="btn"
       href="${link}" target="_blank">
         <strong>Quick Feedback</strong>
      </a>
    </div>`
  upsertsnippet(siteid, snippetcontent, res)
});


app.get("/deletesnippet", (req, res) => {

  var siteid = req.query.siteid;
  deletesnippet(siteid, res)
});

/**
 * Description:
 *  Serves the link that merchants click to authorize your application
 */
app.get("/request_token", (req, res) => {
  // Set the Auth_State cookie with a random md5 string to protect against cross-site request forgery.
  // Auth_State will expire in 300 seconds (5 mins) after the page is loaded.
  var state = md5(Date.now())
  var url = basePath + `/oauth2/authorize?client_id=${process.env.SQ_APPLICATION_ID}&` + `response_type=code&` + `scope=${scopes.join('+')}` + `&state=` + state
  content = `
    <link type="text/css" rel="stylesheet" href="style.css">
    <meta name="viewport" content="width=device-width">
    <div class="wrapper">
      <a class="btn"
       href="${url}">
         <strong>Authorize</strong>
      </a>
    </div>`
  res.cookie("Auth_State", state, { expire: Date.now() + 300000 }).render('base', {
    content: content
  })
});

/**
 * Description:
 *  Serves requests from Square to your application's redirect URL
 *  Note that you need to set your application's Redirect URL to
 *  http://localhost:8000/callback from your application dashboard
 *
 * Query Parameters:
 *  state: the Auth State set in request_token
 *  response_type: the type of the response; should be "code"
 *  code: the authorization code
 */
app.get('/callback', async (req, res) => {
  console.log(req.query);
  // Verify the state to protect against cross-site request forgery.
  if (req.cookies["Auth_State"] !== req.query['state']) {
    content = messages.displayStateError();
    res.render('base', {
      content: content
    });
  }

  else if (req.query['error']) {
    // Check to see if the seller clicked the Deny button and handle it as a special case.
    if (("access_denied" === req.query['error']) && ("user_denied" === req.query["error_description"])) {
      res.render(messages.displayError("Authorization denied", "You chose to deny access to the app."));
    }
    // Display the error and description for all other errors.
    else {
      content = messages.displayError(req.query["error"], req.query["error_description"])
      res.render('base', {
        content: content
      });
    }
  }
  // When the response_type is "code", the seller clicked Allow
  // and the authorization page returned the auth tokens.
  else if ("code" === req.query["response_type"]) {
    // Extract the returned authorization code from the URL
    var { code } = req.query;

    try {
      let { result } = await oauthInstance.obtainToken({
        // Provide the code in a request to the Obtain Token endpoint
        code,
        clientId: process.env.SQ_APPLICATION_ID,
        clientSecret: process.env.SQ_APPLICATION_SECRET,
        grantType: 'authorization_code'
      });

      let {
        // Extract the returned access token from the ObtainTokenResponse object
        accessToken,
        refreshToken,
        expiresAt,
        merchantId
      } = result;

      // Because we want to keep things simple and we're using Sandbox,
      // we call a function that writes the tokens to the page so we can easily copy and use them directly.
      // In production, you should never write tokens to the page. You should encrypt the tokens and handle them securely.
      content = messages.writeTokensOnSuccess(accessToken, refreshToken, expiresAt, merchantId)
      // console.log("callback content: ", content);

      // res.render('base', {
      //   content: content
      // });

      // save these to fb/merchantId
      // admin.database().ref("quickfeedback/"+merchantId).set({accessToken:accessToken,refreshToken: refreshToken,expiresAt: expiresAt, merchantId:merchantId});

      // After getting the access token...
      // const newClient = squareClient.withConfiguration({
      //   accessToken: accessToken,
      // })

      newClient = new Client({
        environment: Environment.Production,
        accessToken: accessToken,
      });
      console.log("newclient with new accessToken: ", accessToken);

      getsites(newClient, res, merchantId);

    } catch (error) {
      // The response from the Obtain Token endpoint did not include an access token. Something went wrong.
      if (error instanceof ApiError) {
        content = messages.displayError('Exception', JSON.stringify(error.result))
        res.render('base', {
          content: content
        });
      } else {
        content = messages.displayError('Exception', JSON.stringify(error))
        res.render('base', {
          content: content
        });
      }
    }
  }
  else {
    // No recognizable parameters were returned.
    content = messages.displayError("Unknown parameters", "Expected parameters were not returned")
    res.render('base', {
      content: content
    });
  }
});

app.listen(port, () => {
  console.log(`Listening to requests on http://localhost:${port}`);
});

async function getsites(newClient, res, merchantId) {
  console.log("getsites start");

// try {
//   const response = await newClient.sitesApi.listSites();

//   console.log(response.result);
// } catch(error) {
//   console.log(error);
// }


  // list user's sites for selection
  const sitesApi = newClient.sitesApi;
  console.log("sitesApi: ", sitesApi);
  try {
    const { result, ...httpResponse } = await sitesApi.listSites();
    // Get more response info...
    // const { statusCode, headers } = httpResponse;
    console.log("listSites result: ", result);
    console.log("# of sites: ", result.sites.length);
    var buttons = ""
    if(result.sites.length == 1){
      var status = "activating quick feedback snippet for " + result.sites[0].siteTitle;
      var sitename = result.sites[0].siteTitle;
      var siteid = result.sites[0].id;
      var activatesnippeturl = "/configuresnippet?siteid="+siteid+"&sitename="+sitename
      buttons += `<a class="btn"
           href="${activatesnippeturl}">
             <strong>"${sitename}"</strong>
          </a>`
      // content += status;
      content = `
        <link type="text/css" rel="stylesheet" href="style.css">
        <meta name="viewport" content="width=device-width">
        <div class="wrapper">
          <p>Logged in successfully as Merchant ID `+ merchantId +`</p>
          <p>Click to Configure Snippet for Site `+ result.sites[0].siteTitle +`</p>
          `+ buttons +`
        </div>`
    } else {
      for (var i = result.sites.length - 1; i >= 0; i--) {
        var sitename = result.sites[i].siteTitle;
        var siteid = result.sites[i].id;
        var activatesnippeturl = "/configuresnippet?siteid="+siteid+"&sitename="+sitename
        buttons += `<a class="btn"
           href="${activatesnippeturl}">
             <strong>"${sitename}"</strong>
          </a>`
      }
      content = `
        <link type="text/css" rel="stylesheet" href="style.css">
        <meta name="viewport" content="width=device-width">
        <div class="wrapper">
          <p>Logged in successfully as Merchant ID `+ merchantId +`</p>
          <p>Select which site you want to configure the snippet for: </p>
        `+ buttons +`
        </div>`
    }
    res.render('base', {
      content: content
    });
  } catch(error) {
    console.log("sitesApi error: ", error);
    if (error instanceof ApiError) {
      const errors = error.result;
      const { statusCode, headers } = error;
      console.log("listSites errors: ", errors);
      res.render('base', {
        content: content
      });
    }
  }

}

async function upsertsnippet(siteid, snippetcontent, res){
  try {
    const response = await newClient.snippetsApi.upsertSnippet(siteid,
    {
      snippet: {
        content: snippetcontent
      }
    });

    console.log("upsertsnippet OK: ", response.result);
    content = messages.displayMessage('Snippet Inserted Successfully', '🚀')
    res.render('base', {
      content: content
    });
  } catch(error) {
    console.log("upsertsnippet error: ", error);
    content = messages.displayMessage('Snippet Insert Failed', error.body)
    res.render('base', {
      content: content
    });
  }
}

async function getsnippet(siteid, sitename, prevcontent, res){
  try {
    const response = await newClient.snippetsApi.retrieveSnippet(siteid);

    let deletesnippeturl = "/deletesnippet?siteid="+siteid
    let button = `<a class="btn"
       href="${deletesnippeturl}">
         <strong>"Delete Snippet for ${sitename}"</strong>
      </a>`

    console.log("getsnippet OK: ", response.result);
    content = messages.displayMessage2('Retrieved Snippet Successfully', button, prevcontent)
    res.render('base', {
      content: content
    });
  } catch(error) {
    console.log("getsnippet error: ", error, error.statusCode, error.body);
    var bodyjson = JSON.parse(error.body);
    // console.log("bodyjson: ", bodyjson);
    if(error.statusCode == 404 && bodyjson.errors[0].code == "NOT_FOUND") {
      // no snippet yet, don't show error
      content = messages.displayMessage2('No Snippets. Yet.', "Configure below to get started", prevcontent)
      res.render('base', {
        content: content
      });
    } else {
      content = messages.displayMessage2('Snippet Retrieve Failed', bodyjson, prevcontent)
      res.render('base', {
        content: content
      });
    }

  }
}

async function deletesnippet(siteid, res){
  try {
    const response = await newClient.snippetsApi.deleteSnippet(siteid);

    console.log("deletesnippet OK: ", response.result);
    content = messages.displayMessage('Deleted Snippet Successfully', '💥')
    res.render('base', {
      content: content
    });
  } catch(error) {
    console.log("deletesnippet error: ", error);
    content = messages.displayMessage('Snippet Delete Failed', error.body)
    res.render('base', {
      content: content
    });
  }
}



