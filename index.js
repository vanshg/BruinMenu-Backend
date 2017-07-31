var _ = require('underscore')
var express = require('express')
var bodyParser = require('body-parser')
var request = require('request')
var util = require('util')
var cheerio = require('cheerio')
var tabletojson = require('tabletojson');
var fs = require('fs');
var app = express()

/* 
    If date is specified: Year-Month-Day (such as 2017-06-23 for June 23, 2017)

    To test with local file:
    var html = fs.readFileSync("test.html");
    parseMenus(res, html);
*/

let hoursUrl = 'http://menu.dining.ucla.edu/Hours/%s' // yyyy-mm-dd
let overviewUrl = 'http://menu.dining.ucla.edu/Menus/%s'
let cafe1919Url = 'http://menu.dining.ucla.edu/Menus/Cafe1919'
// hours testing URL: https://web.archive.org/web/20170509035312/http://menu.dining.ucla.edu/Hours

//TODO: this url has changed let overviewUrl = 'http://menu.ha.ucla.edu/foodpro/default.asp?date=%d%%2F%d%%2F%d'
// let calendarUrl = 'http://www.registrar.ucla.edu/Calendars/Annual-Academic-Calendar'

let hallTitlesHours = [
    'Covel',
    'De Neve',
    'FEAST at Rieber',
    'Bruin Plate',
    'Bruin Café',
    'Café 1919',
    'Rendezvous',
    'De Neve Grab \'n\' Go',
    'The Study at Hedrick'
]

let breakfast_key = 'breakfast'
let lunch_key = 'lunch'
let dinner_key = 'dinner'
let late_night_key = 'late_night'
let limited_key = 'limited_menu'
    
app.set('port', (process.env.PORT || 5000))
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())
app.use(express.static('website'))
app.use(express.static(__dirname + '/images'));
// Spin up the server
app.listen(app.get('port'), function() {
    console.log('running on port', app.get('port'))
})

app.get('/',function(req,res){
  res.sendFile(path.join(__dirname+'/index.html'));
  //__dirname : It will resolve to your project folder.
});

/* Parameters:
    Date (optional)
*/
app.get('/overview', function (req, res) {
    var dateString = getDate(req, res)

    var url = util.format(overviewUrl, dateString)
    request(url, function(error, response, body) {
        if (error) {
            sendError(res, error)
        } else {
            parseOverviewPage(res, body)
        }
    })
})

/* Parameters:
    Date (optional)
*/
app.get('/hours', function (req, res) {
    var dateString = getDate(req, res)
    var url = util.format(hoursUrl, dateString)
    request(url, function(error, response, body) {
        if (error) {
            sendError(res, error)
        } else {
            parseHours(res, body)
        }
    })
})

/* Parameters:
    Date (optional)
*/
app.get('/menus', function (req, res) {
	/*
	var date = getDate(req, res)
    var month = date.getMonth() + 1 //getMonth returns 0 based month
    var day = date.getDate()
    var year = date.getFullYear()
    var url = util.format(overviewUrl, month, day, year)
    request(url, function(error, response, body) {
        if (error) {
            sendError(res, error)
        } else {
            parseMenus(res, body)
        }
    })
	*/
    // temporary cache file since website is down
    var html = fs.readFileSync("test.html");
    parseMenus(res, html);
})

// app.get('/calendarYear', function(req, res){
//     // TODO: get the calendar years for several 
//     var url = util.format(calendarUrl);
//     request(url, function(error, response, body)
//     {
//         if (error)
//         {
//             sendError(res, error)
//         }
//         else{
//             res.send('TODO')
//         }
//     })
//     res.send('TODO');
// })

function parseOverviewPage(res, body) {
    var response = []
    var obj = {}
    
    //     var tag = $(this)
    //     obj[tag.attr('href')] = text

    obj['breakfast'] = parseMealPeriod(body, 0)
    obj['lunch'] = parseMealPeriod(body, 1)
    obj['dinner'] = parseMealPeriod(body, 2)
    response.push(obj)
    res.send(response)
}

function parseMealPeriod(body, mealNumber) {
    var result = {}
    
    var $ = cheerio.load(body)

    $('.meal-detail-link').each(function(index, element){
        var text = $(this).text().trim()
        if (mealNumber == 0)
            if (text.indexOf('Breakfast') == -1)
                return
        else if (mealNumber == 1)
            if (text.indexOf('Lunch') == -1)
                return
        else if (mealNumber == 2)
            if (text.indexOf('Dinner') == -1)
                return

        var currElem = $(this).next()
        while (currElem.hasClass('menu-block')){
            var name = currElem.find('h3')
            var sections = {}
            var sectionNames = currElem.find('.sect-item')
            for (var h = 0; h < sectionNames.length; h++){
                var sectionName = sectionNames.eq(h).text()
                var match = sectionName.match(/(\r\n[A-Z \ta-z]+\r\n)/g)
                var itemList = currElem.find('.menu-item')
                var items = []
                for (var i = 0; i < itemList.length; i++){
                    var currItem = itemList.eq(i)
                    var itemName = currItem.find('.recipelink').text().trim()
                    var itemRecipe = currItem.find('.recipelink').attr('href')

                    var itemNames = {}
                    var itemCodesArr = []
                    itemNames['name'] = itemName
                    itemNames['recipelink'] = itemRecipe
                    var itemCodes = currItem.find('.tt-prodwebcode').find('img')
                    for (var j = 0; j < itemCodes.length; j++){
                        itemCodesArr[j] = itemCodes.eq(j).attr('alt')
                    }
                    itemNames['itemcodes'] = itemCodesArr
                    items[i] = itemNames
                }
                sections[match[0].trim()] = items
            }

            result[name.text().trim()] = sections
            currElem = currElem.next()    
        }
    })    
    return result
}

function parseHours(res, body) {
    var response = []
    var obj = {}

    var $ = cheerio.load(body)
    $('.hours-location, .hours-range, .hours-closed, .hours-closed-allday').each(function(index, element){
        var text = $(this).text().trim()
        if (hallTitlesHours.indexOf(text) != -1){
            if (!_.isEmpty(obj)){
                response.push(obj)
            }
            obj = {}
            obj['hall_name'] = text
            return
        }
        if (dinner_key in obj) {
            obj[late_night_key] = text
        } else if (lunch_key in obj) {
            obj[dinner_key] = text
        } else if (breakfast_key in obj) {
            obj[lunch_key] = text
        } else {
            obj[breakfast_key] = text
        }
    })

    response.push(obj)
    res.send(response)
}

function parseMenus(res, html)
{
	// store links to nutrition/ingredient pages in map by item name
	// TBD - parse each page to fill out response
	var details = {};
	var $ = cheerio.load(html);
	$('li').each(function(index, element) {
        $(this).find('a').each(function(index, element) {
        	var name = $(this).text();
        	var link = $(this).attr('href');
        	details[name] = link;
            //console.log($(this).text(), $(this).attr('href'));
        });
    });

    var response = 
    {
        "Breakfast" : 
        [
            {
                "name" : "Bruin Plate",
                "menu" : []
            },
            {
                "name" : "De Neve Dining",
                "menu" : []
            }
        ],
        "Lunch" : 
        [
            {
                "name" : "Covel Dining",
                "menu" : []
            },
            {
                "name" : "Bruin Plate",
                "menu" : []
            },
            {
                "name" : "De Neve Dining",
                "menu" : []
            },
            {
                "name" : "FEAST at Rieber",
                "menu" : []
            }
        ],
        "Dinner" : 
        [
            {
                "name" : "Covel Dining",
                "menu" : []
            },
            {
                "name" : "Bruin Plate",
                "menu" : []
            },
            {
                "name" : "De Neve Dining",
                "menu" : []
            },
            {
                "name" : "FEAST at Rieber",
                "menu" : []
            }
        ]
    };

    var tablesAsJson = tabletojson.convert(html);

    for (var i = 1; i <= 5; i++)
    {
        var mealname;
        var nameMap;

        if (i == 1)
        {
            mealname = "Breakfast";
            nameMap = 
            {
                "Bruin Plate" : 0,
                "De Neve Dining" : 1
            }
        }
        else 
        {
            if (i == 2 || i == 3)
                mealname = "Lunch";
            else if (i == 4 || i == 5)
                mealname = "Dinner";
            nameMap = 
            {
                "Covel Dining" : 0,
                "Bruin Plate" : 1,
                "De Neve Dining" : 2,
                "FEAST at Rieber" : 3
            }
        }

        var table = tablesAsJson[i];
        var offset = 0;

        var name1;
        var name2;

        if (i == 3 || i == 5)
        {
            offset = 1;
            name1 = table[0]['0'];
            name2 = table[0]['1'];
        }
        else
        {
            name1 = table[1]['0'];
            name2 = table[1]['1'];
        }
        for (var j = (3-offset); j < table.length; j++)
        {
            var obj1 = 
            {
                "section_name" : "",
                "items" : []
            };

            var obj2 = 
            {
                "section_name" : "",
                "items" : []
            };

            var section1 = table[j]['0'];
            var arr1 = section1.replace(/\t/g, '').split('\n');
            obj1.section_name = arr1[0];
            arr1.shift();
            obj1.items = arr1;
            response[mealname][nameMap[name1]].menu.push(obj1);
            
            var section2 = table[j]['1'];
            var arr2 = section2.replace(/\t/g, '').split('\n');
            obj2.section_name = arr2[0];
            arr2.shift();
            obj2.items = arr2;
            response[mealname][nameMap[name2]].menu.push(obj2);
        }
    }
    // send the response object to the /menus page
    res.send(response);
}

/* Parameters:
    Date (optional)
*/
app.get('/Cafe-1919', function (req, res) {
    
    var cf1919 = fs.readFileSync("1919.html")
    parse1919(res, cf1919)

    // request(cafe1919Url, function(error, response, body) {
    //     if (error) {
    //         sendError(res, error)
    //     } else {
    //         parse1919(res, body)
    //     }
    // })
})

function parse1919(res, body) {
    var response = []
    var obj = {}

    obj['breakfast'] = parse1919Swiper(body, 0)
    obj['pizzette'] = parse1919Swiper(body, 1)
    obj['panini'] = parse1919Swiper(body, 2)
    obj['insalate'] = parse1919Swiper(body, 3)
    obj['sides'] = parse1919Swiper(body, 4)
    obj['bibite'] = parse1919Swiper(body, 5)
    obj['dolci'] = parse1919Swiper(body, 6)
    response.push(obj)
    res.send(response)
}

function parse1919Swiper(body, pos){
    var result = {}

    var $ = cheerio.load(body)

    $('.swiper-slide').each(function(index, element){
        if (index == pos){
            var slides = $(this).find('.menu-item')
            // console.log(slides.find('.recipelink').attr('href'))
            result['recipelink'] = slides.find('.recipelink').attr('href')        
        }
    })
    // $('.meal-detail-link').each(function(index, element){
    //     var text = $(this).text().trim()
    //     if (mealNumber == 0)
    //         if (text.indexOf('Breakfast') == -1)
    //             return
    //     else if (mealNumber == 1)
    //         if (text.indexOf('Lunch') == -1)
    //             return
    //     else if (mealNumber == 2)
    //         if (text.indexOf('Dinner') == -1)
    //             return

    //     var currElem = $(this).next()
    //     while (currElem.hasClass('menu-block')){
    //         var name = currElem.find('h3')
    //         var sections = {}
    //         var sectionNames = currElem.find('.sect-item')
    //         for (var h = 0; h < sectionNames.length; h++){
    //             var sectionName = sectionNames.eq(h).text()
    //             var match = sectionName.match(/(\r\n[A-Z \ta-z]+\r\n)/g)
    //             var itemList = currElem.find('.menu-item')
    //             var items = []
    //             for (var i = 0; i < itemList.length; i++){
    //                 var currItem = itemList.eq(i)
    //                 var itemName = currItem.find('.recipelink').text().trim()
                    // var itemRecipe = currItem.find('.recipelink').attr('href')

    //                 var itemNames = {}
    //                 var itemCodesArr = []
    //                 itemNames['name'] = itemName
    //                 itemNames['recipelink'] = itemRecipe
    //                 var itemCodes = currItem.find('.tt-prodwebcode').find('img')
    //                 for (var j = 0; j < itemCodes.length; j++){
    //                     itemCodesArr[j] = itemCodes.eq(j).attr('alt')
    //                 }
    //                 itemNames['itemcodes'] = itemCodesArr
    //                 items[i] = itemNames
    //             }
    //             sections[match[0].trim()] = items
    //         }

    //         result[name.text().trim()] = sections
    //         currElem = currElem.next()    
    //     }
    // })    

    return result
}

function sendError(res, error) {
    //TODO: send JSON with the returned error message
    console.log(error)
    res.send(error)
}

function getDate(req, res) {
    let dateText = req.query['date']
    if (dateText) {
        return dateText //new Date(dateText)
        // TODO: Catch invalid dateText format and send appropriate error message on incorrect format
    }
    let date = new Date()
    let month = date.getMonth() + 1 //getMonth returns 0 based month
    let day = date.getDate()
    let year = date.getFullYear()
    return '' + year + '-' + minTwoDigits(month) + '-' + minTwoDigits(day)
}
 
function minTwoDigits(n) {
  return (n < 10 ? '0' : '') + n;
}

// TODO: Have a job that runs every hour that refreshes all the menus
// TODO: Store about a week's worth of menu info
