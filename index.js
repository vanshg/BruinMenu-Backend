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

    Top of the HTML file MUST contain <!DOCTYPE html> in order to work!
*/

let hoursUrl = 'http://menu.dining.ucla.edu/Hours/%s' // yyyy-mm-dd
let overviewUrl = 'http://menu.dining.ucla.edu/Menus/%s'
let cafe1919Url = 'http://menu.dining.ucla.edu/Menus/Cafe1919'
// hours testing URL: https://web.archive.org/web/20170509035312/http://menu.dining.ucla.edu/Hours
// bcafe test URL:
const bcafeUrl = 'http://web.archive.org/web/20170416221050/http://menu.dining.ucla.edu/Menus/BruinCafe';

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

// Bruin Cafe
app.get('/Bruin-Cafe', function (req, res) {
    var bcafeHTML = fs.readFileSync('bcafe.html');
    parseBruinCafe(res, bcafeHTML);
    // request(bcafeUrl, function(error, response, body) {
    //     if (error) {
    //         sendError(res, error);
    //     } else {
    //         parseBruinCafe(res, body);
    //     }
    // });
});

function parseBruinCafe(res, body) {
    var response = {};

    var $ = cheerio.load(body);
    $('.page-nav-button').each(function(index, element) {
        response[$(this).text()] = {};
    });

    res.send(response);
}

function parseOverviewPage(res, body) {
    var obj = {}
    
    //     var tag = $(this)
    //     obj[tag.attr('href')] = text

    obj['breakfast'] = parseMealPeriod(body, 0)
    obj['lunch'] = parseMealPeriod(body, 1)
    obj['dinner'] = parseMealPeriod(body, 2)
    res.send(obj)
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

// Cafe 1919 never changes, so it is parsed from a local file!
app.get('/Cafe-1919', function (req, res) {
    
    var cf1919 = fs.readFileSync("1919.html")
    parse1919(res, cf1919)
})

function parse1919(res, body) {
    var obj = {}

    obj['breakfast'] = parse1919Swiper(body, 0)
    obj['pizzette'] = parse1919Swiper(body, 1)
    obj['panini'] = parse1919Swiper(body, 2)
    obj['insalate'] = parse1919Swiper(body, 3)
    obj['sides'] = parse1919Swiper(body, 4)
    obj['bibite'] = parse1919Swiper(body, 5)
    obj['dolci'] = parse1919Swiper(body, 6)
    res.send(obj)
}

function parse1919Swiper(body, pos){
    var items = []
    var $ = cheerio.load(body)

    $('.swiper-slide').each(function(index, element){
        if (index == pos){
            var slides = $(this).find('.menu-item')
            for (var i = 0; i < slides.length; i++){
                var itemInfo = {}
                itemInfo['name'] = slides.eq(i).find('.recipelink').text().trim()
                itemInfo['recipelink'] = slides.eq(i).find('.recipelink').attr('href')
                var itemDescript = slides.eq(i).find('.menu-item-description').text().trim()
                if (itemDescript != '')
                    itemInfo['itemDescription'] = itemDescript
                else
                    itemInfo['itemDescription'] = "No description provided"
                var itemCodesArr = []
                var itemCodes = slides.eq(i).find('.webcode')
                for (var j = 0; j < itemCodes.length; j++){
                    itemCodesArr[j] = itemCodes.eq(j).attr('alt')
                }
                itemInfo['itemCodes'] = itemCodesArr
                var itemCost = slides.eq(i).find('.menu-item-price').text().trim()
                if (itemCost != '')
                    itemInfo['itemCost'] = itemCost
                else
                    itemInfo['itemCost'] = "$0.00"
                items[i] = itemInfo
            }
        }
    })

    return items
}

function sendError(res, error) {
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
