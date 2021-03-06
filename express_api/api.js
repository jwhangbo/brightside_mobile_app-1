#!/usr/bin/env node


/** api.js  */
const express = require('express');
const db = require('./db/mysql_db');
const config = require('./cred/secret.json');
const hbs = require('hbs');
const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false });
const cookieParser = require('cookie-parser');


// Initialize express() as app.
const app = express();

// set hbs views
app.set('views', __dirname + '/views');
app.set('view engine', 'hbs');
app.use(express.static(__dirname + '/assets'));
app.use(cookieParser());

// If someone visits the homepage, tell them they are lost
app.get('/', (request, response) => {
    response.send('Hi, nothing here.');
});

// If someone gets the correct address, return json from database
app.get(`/${config.token}`, (request, response) => {
    db.getData().then((resource) => {
        response.json(resource);
    }).catch((error) => {
        response.send(error);
    })
});

// request data with search parameters /search?keyword=<keyword search>
app.get(`/${config.token}/search`, (request, response) => {
    db.searchData(decodeURIComponent(request.query.keyword))
    .then(async (resource) => {
            let orgIdList = []
            for (let i = 0; i < resource.length; i++) {
                orgIdList.push(resource[i].resourceId)
            }
            await db.getResourcesById(orgIdList)
            .then(async (resource) => {
                result = _groupPerk(resource)   
                for (let i = 0; i < result.length; i++) {
                    await db.getSchedule(result[i].resourceId)
                    .then((respond)=>{
                        result[i].schedule = _groupSchedule(respond)
                        delete result[i].resourceId
                    })
                }
                response.json(result)
            })
    })
    .catch((error) => {
        response.send(error);
    })
})

// test the getSchedule function
app.get(`/${config.token}/test`, (request, response) => {
    db.getSchedule(63).then((resource) => {
        response.json(resource);
    }).catch((error) => {
        response.send(error);
    })
})

// request data based on category /category?key=legal
// if no key is provided. (ie /category) it returns a list of all the categories
app.get(`/${config.token}/category`, (request, response) => {
    if (request.query.key == undefined) {
        db.getAllCategory().then((category) => {
            response.json(category);
        }).catch((error) => {
            response.send(error);
        })
    } else {
        let result = []
        db.getByCategory(decodeURIComponent(request.query.key))
        .then(async (resource) => {
            result = _groupPerk(resource)   
            for (let i = 0; i < result.length; i++) {
                if (!result[i].location) {
                    result[i].location = 'Phone Only'
                }
                await db.getSchedule(result[i].resourceId)
                .then((respond)=>{
            	    result[i].schedule = _groupSchedule(respond)
                    delete result[i].resourceId
		        })
            }
	        response.json(result)
        })
    }
})

// admin login for adding more database entries
// app.get(`/${config.token}/manage/:admin`, (request, response) => {
//     if (request.params.admin == 'brightside_admin') {
//         db.getData().then(data => {
//             response.render('admin.hbs', {
//                 data: data
//             });
//         })
//     } else {
//         response.status(404).send('Not Found');
//     }
// })

// app.get(`/${config.token}/login`, (request, response) => {
//     response.render('login.hbs');
// })

// POST request for login
app.post(`/${config.token}/manage`, urlencodedParser, (request, response) => {
    // console.log(request.body.username);
    // console.log(request);
    db.getUser(request.body.username, request.body.password).then(resp => {
        // console.log(resp);
        // console.log(resp.length);
        if (resp.length == 1) {
            response.cookie('isLoggedIn', `${request.body.username}`, { maxAge: 1000 * 60 * 60 * 24, httpOnly: true })
            response.redirect(`/${config.token}/manage`);
        } else {
            response.render('login.hbs', {
                failed: true
            });
        }
    })
})

// POST request for adding data
app.post(`/${config.token}/manage/submit`, urlencodedParser, (request, response) => {
    console.log('submit\n', request.body);
    response.redirect(`/${config.token}/manage`);
})

// GET request to console management page
app.get(`/${config.token}/manage`, (request, response) => {
    // console.log('Cookies', request.cookies.isLoggedIn);
    // console.log('Request', request);
    if (request.cookies.isLoggedIn == undefined) {
        response.render('login.hbs');
    } else if (request.cookies.isLoggedIn != undefined) {
        db.getData().then(data => {
            for (i in data) {
                if (data[i]['hours'] != null) {
                    data[i]['hours'] = data[i].hours.split(',');
                }
                data[i]['keywords'] = data[i].keywords.split(',');
                data[i]['perks'] = data[i].perks.split(',');
                data[i]['type'] = data[i].type.split(',');
            }
            response.render('admin.hbs', {
                data: data
            });
        })
    } else {
        response.status(404).send('Not Found');
    }
})

// If someone enters the wrong address, return 404
app.get('/*', (request, response) => {
    response.status(404).send('Nothing here');
});

function _formatAnswer() {

}

// private function to format perks into a list in the response
function _groupPerk(allData) {
  allData.push({resourceId:-1,perk:''})
  let prevId = undefined
  let curId = undefined
  let orgs = [];
  let perks = [];
    if (allData.length > 0) {
      prevId = allData[0].resourceId
    } else return allData;
    for (let i = 0; i < allData.length; i++){
        curId = allData[i].resourceId
        if (curId == prevId) {
            perks.push(allData[i].perk)
        } else {
            let org = allData[i-1]
            org.perk = perks
            orgs.push(org)
            prevId = allData[i].resourceId
            perks = [allData[i].perk]
        }
    }
    return orgs
}

// private function to format schdule into an object and hours as string in the response
function _groupSchedule(data){
    let schedule = {}
    for (let i = 0; i < data.length; i++) {
        let hours = ''
        if (!data[i].start && !data[i].end){
            hours = 'Not Available'
        } else if (data[i].start == data[i].end) {
            hours = 'Closed'
        } else if (data[i].start == '00:00:00' && data[i].end == '23:59:00') {
            hours = 'Open 24 Hours'
        } else {
            hours = `${data[i].start.substring(0,5)} - ${data[i].end.substring(0,5)}`
        }
        schedule[data[i].weekday] = hours
    }
    return schedule
}













/*---------------------Server Running and Listening---------------------*/
app.listen(80, () => {
    console.log(`Server is up and running...`);
});
