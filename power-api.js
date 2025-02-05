const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const xml2js = require('xml2js');
var cors = require('cors')
const axios = require('axios');

const WebSocket = require('ws');
const webSocketPort = 4000;
const ws = new WebSocket.Server({ port: webSocketPort });

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json())

const mongoUrl = 'mongodb://127.0.0.1:27017';
const port = 3000;

const powerPort = 8080;
const powerUrl = 'http://127.0.0.1:' + powerPort;

var devices = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                        <devices>
                            <id>MDB1-2</id>
                            <id>MDB1</id>
                            <id>MDB2</id>
                            <id>Solar3</id>
                            <id>Sol3</id>
                        </devices>`;

var devicesId = ['MDB1-2', 'MDB1', 'MDB2', 'Solar3', 'Sol3'];

var realDevices = [];

/*
    1. get devices list then use gotten id to get value from .../variableValue every 3 seconds (export value to web socket)
    2. keep history (from 1.) every 1 minute (1 value/minute)
    3. get history (by filtered)
        - today (00.00 - now) -> 5 mins/15 mins/1 hour/raw (get all values eg. 5mins -> return 5 values, 1 hour -> return 60 values)
        - yesterday (00.00 - 23.59 of yesterday) -> 5 mins/15 mins/1 hour/raw
        - this week -> 1 day/5 mins/15 mins/1 hour/raw
        - this month -> 1 day/1 week/5 mins/15 mins/1 hour/raw
        - specific time (DateTime - DateTime) -> 5 mins/15 mins/1 hour/raw
*/

var insertObjToDatabase = (obj) => {
    MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true },
        function(err, db) {
            if (err) throw err;
            var dbo = db.db("power-api");
            dbo.collection(`${obj.id}`).insertOne(obj, function(err, res) {
                if (err) throw err;
            });
        }
    );
}

var insertMockedUpData = async () => {
    try {
        var responseList = [];
        for(var i = 0; i < devicesId.length; i++) {
            var response = await axios.post(`http://localhost:3000/devices/${devicesId[i]}`);
            responseList.push(response.data);
        }
        console.log(responseList);
        responseList = [];
    } catch (error) {
        console.error(error);
    }
}

var getDevicesFromPowerStudio = async () => {
    try {
        var response = await axios.get(`${powerUrl}/services/chargePointsInterface/devices.xml?api_key=special-key`);
        console.log(response.data)
        xml2js.parseString(dataFromPowerStudio, (err, result) => {
            if(err) {
                throw err;
            }
            const jsonString = JSON.stringify(result, null, 4);
            var json = JSON.parse(jsonString);
            json.devices.id.forEach((device) => {
                console.log(device)
                // add real device to list.
            })
        });
    } catch (error) {
        console.error(error);
    }
}

var readDataFromRealDevicePowerStudio = async () => {
    try {
        var response = await axios.get(`${powerUrl}/services/chargePointsInterface/variableValue.xml?id=MDB1&api_key=special-key`);
        console.log(response.data)
    } catch (error) {
        console.error(error);
    }
}

setInterval(() => {
    insertMockedUpData();
}, 60000);

var insertMockedUpData = async () => {
    try {
        var responseList = [];
        for(var i = 0; i < devicesId.length; i++) {
            var response = await axios.post(`http://localhost:3000/devices/${devicesId[i]}`);
            responseList.push(response.data);
        }
        console.log(responseList);
        responseList = [];
    } catch (error) {
        console.error(error);
    }
}

var isValidDate = (dateString) => {
    const _regExp  = new RegExp('^(-?(?:[1-9][0-9]*)?[0-9]{4})-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])T(2[0-3]|[01][0-9]):([0-5][0-9]):([0-5][0-9])(.[0-9]+)?(Z)?$');
    return _regExp.test(dateString);
}

var getFilterObject = (filterBy, [minDate, maxDate]) => {
    var date = new Date();
    var today = date.toISOString();
    today = today.substring(0, 10);

    var dateOfTomorrow = new Date();
    dateOfTomorrow.setDate(dateOfTomorrow.getDate() + 1);
    var tomorrow = dateOfTomorrow.toISOString();
    tomorrow = tomorrow.substring(0, 10);

    var dateOfYesterday = new Date();
    dateOfYesterday.setDate(dateOfYesterday.getDate() - 1);
    var yesterday = dateOfYesterday.toISOString();
    yesterday = yesterday.substring(0, 10);

    var isMinDateOrMaxDateIsUndefinded = minDate === undefined && maxDate === undefined

    console.log(`🍪 today = ${today}`);
    console.log(`🍪 yesterday = ${yesterday}`);
    console.log(`🍪 tomorrow = ${tomorrow}`);
    console.log(`🥠 minDate = ${minDate}`);
    console.log(`🥠 maxDate = ${maxDate}`);
    console.log(`🍿 isMinDateOrMaxDateIsUndefinded = ${isMinDateOrMaxDateIsUndefinded}`);

    if (filterBy === 'today') {
        return { created_on: { $gte: new Date(today), $lt: new Date(tomorrow) } };
    } else if (filterBy == 'yesterday') {
        return { created_on: { $gte: new Date(yesterday), $lt: new Date(today) } };
    } else if (filterBy == 'specific') {
        return !isMinDateOrMaxDateIsUndefinded ? { created_on: { $gte: new Date(minDate), $lte: new Date(maxDate) } }: { created_on: new Date('0001-01-01') };
    } else {
        return { created_on: new Date('0001-01-01') };
    }
}

//get devices list
app.get('/devices', cors(), (req, res) => {
    xml2js.parseString(devices, (err, result) => {
        if(err) {
            throw err;
        }
        const jsonString = JSON.stringify(result, null, 4);
        var json = JSON.parse(jsonString);
        res.send(json);
    });
});

//get newest data of device
app.get('/devices/:deviceId', cors(), (req, res) => {
    var deviceId = req.params.deviceId;
    var queryObj = { id: deviceId };

    MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true },
        function(err, db) {
            if (err) throw err;
            var dbo = db.db("power-api");
            dbo.collection(`${deviceId}`).find(queryObj).sort({ _id: -1 }).limit(1).toArray((err, value) => {
                if (err) throw err;
                res.send(value[0]);
            });
        }
    );
});

//fetch data and write in database
app.post('/devices/:deviceId', cors(), (req, res) => {
    var deviceId = req.params.deviceId;

    var dataFromPowerStudio = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <values>
                        <variable>
                            <id>${deviceId}.DESCRIPTION</id>
                        </variable>
                        <variable>
                            <id>${deviceId}.NAME</id>
                            <textValue>${deviceId}</textValue>
                        </variable>
                        <variable>
                            <id>${deviceId}.PTIME</id>
                            <value>${Math.random() * 100000}</value>
                        </variable>
                        <variable>
                            <id>${deviceId}.STATUS</id>
                            <value>1.000000</value>
                        </variable>
                        <variable>
                            <id>${deviceId}.VDTTM</id>
                            <value>${Math.random() * 100000000000000}</value>
                        </variable>
                    </values>`

    xml2js.parseString(dataFromPowerStudio, (err, result) => {
        if(err) {
            throw err;
        }
        const jsonString = JSON.stringify(result, null, 4); //json string data from power studio
        var json = JSON.parse(jsonString); //json data from power studio
        const date = new Date().toISOString()
        const created_on = new Date(date);

        json = { id: deviceId, ...json, created_on };
        if (devicesId.includes(deviceId)) {
            insertObjToDatabase(json);
            // console.log(json.values.variable[1].textValue[0]); //deviceId
            // console.log(json.values.variable[4].value[0]); //value
            res.send(json);
        } else {
            res.status(400).send(`Not has this devices in the system.`);
        }
    });
});

app.get('/devices/:id/history/', (req, res) => {
    var acceptedFilter = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'specific'];
    var acceptedInterval = ['5m', '15m', '1hr', '1d', 'raw'];

    var deviceId = req.params.id;

    var filterBy = req.query.filterBy;
    var interval = req.query.interval;

    var minDate = req.query.minDate
    var maxDate = req.query.maxDate

    var canFilter = acceptedFilter.includes(filterBy);
    var isFilterWithInterval = acceptedInterval.includes(interval);

    console.log(`minDate = ${minDate}`);
    console.log(`maxDate = ${maxDate}`);
    console.log(`isValidDateMinDate = ${isValidDate(minDate)}`);
    console.log(`isValidDateMaxDate = ${isValidDate(maxDate)}`);

    if (canFilter) {
        var filter = {};
        if (filterBy == 'specific' && (isValidDate(minDate) && isValidDate(maxDate))) {
            filter = getFilterObject(filterBy, [minDate, maxDate]);
        } else {
            filter = getFilterObject(filterBy, []);
        }
        console.log(filter)

        MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true },
            function(err, db) {
                if (err) throw err;
                var dbo = db.db("power-api");
                dbo.collection(`${deviceId}`).find(filter).toArray((err, docs) => {
                    if (err) throw err;
                    res.send(docs)
                });
            }
        );
    } else {
        console.log(`can't filter.`);
        res.status(400).send(`Can't filter. (HTTP StatusCode == 400)`);
    }
});

//get all data of device
app.get('/devices/:id/all', async (req, res) => {
    var deviceId = req.params.id;
    var queryObj = { id: deviceId };
    try {
        MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true },
            function(err, db) {
                if (err) throw err;
                var dbo = db.db("power-api");
                dbo.collection(`${deviceId}`).find(queryObj).toArray((err, docs) => {
                    if (err) throw err;
                    res.send(docs);
                });
            }
        );
    } catch (e) {
        console.log(e);
    }
});

app.post('/alarm/save-history', cors(), (req, res) => {
    var deviceId = req.body.deviceId;
    var alarmType = req.body.alarmType;
    var alertTimeString = req.body.alertDateTime;
    var fixedTimeString = req.body.fixedDateTime;
    var description = req.body.description;
    console.log(alertTimeString)
    console.log(fixedTimeString)
    
    const alertDateTimeString = new Date(alertTimeString).toISOString();
    alertDateTime = new Date(alertDateTimeString);
    const fixedDateTimeString = new Date(fixedTimeString).toISOString();
    fixedDateTime = new Date(fixedDateTimeString);
    
    var json = { id: deviceId, alarmType: alarmType, alertDateTime: alertDateTime, fixedDateTime: fixedDateTime, description: description }; //json data from power studio
    
    if (devicesId.includes(deviceId)) {
        MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true },
            function(err, db) {
                if (err) throw err;
                var dbo = db.db("power-api");
                dbo.collection('alarm').insertOne(json, function(err, res) {
                    if (err) throw err;
                });
            }
        );
        res.send(json);
    } else {
        res.status(400).send(`Not has this devices in the system.`);
    }
    
});

app.get('/alarm/all', (req, res) => {
    MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true },
        function(err, db) {
            if (err) throw err;
            var dbo = db.db("power-api");
            dbo.collection('alarm').find({}).toArray((err, docs) => {
                if (err) throw err;
                res.send(docs);
            });
        }
    );
});

app.get('/alarm/:deviceId', (req, res) => {
    var deviceId = req.params.deviceId;
    MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true },
        function(err, db) {
            if (err) throw err;
            var dbo = db.db("power-api");
            dbo.collection('alarm').find({ id: deviceId }).toArray((err, docs) => {
                if (err) throw err;
                res.send(docs);
            });
        }
    );
});

app.get('/', (req, res) => {
    res.send('Power - API')
});

app.listen(port, () => {
    console.log(`Power API is listening on port ${port}.`);
});

//web socket
// ws.on('connection', (ws) => {
//     var dataFromPowerStudio = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//                                 <values>
//                                     <variable>
//                                         <id>MDB1.DESCRIPTION</id>
//                                     </variable>
//                                     <variable>
//                                         <id>MDB1.NAME</id>
//                                         <textValue>MDB1</textValue>
//                                     </variable>
//                                     <variable>
//                                         <id>MDB1.PTIME</id>
//                                         <value>${Math.random() * 100000}</value>
//                                     </variable>
//                                     <variable>
//                                         <id>MDB1.STATUS</id>
//                                         <value>1.000000</value>
//                                     </variable>
//                                     <variable>
//                                         <id>MDB1.VDTTM</id>
//                                         <value>${Math.random() * 100000000000000}</value>
//                                     </variable>
//                                 </values>`
//     ws.on('message', (deviceId) => {
//         var dataFromPowerStudio = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
//                                 <values>
//                                     <variable>
//                                         <id>${deviceId}.DESCRIPTION</id>
//                                     </variable>
//                                     <variable>
//                                         <id>${deviceId}.NAME</id>
//                                         <textValue>${deviceId}</textValue>
//                                     </variable>
//                                     <variable>
//                                         <id>${deviceId}.PTIME</id>
//                                         <value>${Math.random() * 100000}</value>
//                                     </variable>
//                                     <variable>
//                                         <id>${deviceId}.STATUS</id>
//                                         <value>1.000000</value>
//                                     </variable>
//                                     <variable>
//                                         <id>${deviceId}.VDTTM</id>
//                                         <value>${Math.random() * 100000000000000}</value>
//                                     </variable>
//                                 </values>`

//         xml2js.parseString(dataFromPowerStudio, (err, result) => {
//             if(err) {
//                 throw err;
//             }
//             const jsonString = JSON.stringify(result, null, 4); //json string data from power studio
//             var json = JSON.parse(jsonString); //json data from power studio

//             if (devicesId.includes(deviceId)) {
//                 // console.log(json.values.variable[1].textValue[0]); //deviceId
//                 // console.log(json.values.variable[4].value[0]); //value
//                 ws.send(jsonString);
//             } else {
//                 ws.send(`Not has this devices in the system.`);
//             }
//         });
//     });
//     ws.on('close', () => {
//         console.log('Disconnected from client web socket.');
//     });
//     ws.send('Connect to Power WebSocket');
    
//     setInterval(() => {
//         xml2js.parseString(dataFromPowerStudio, (err, result) => {
//             if(err) {
//                 throw err;
//             }
//             const jsonString = JSON.stringify(result, null, 4);
//             var json = JSON.parse(jsonString);
//             ws.send(jsonString);
//         });
//     }, 3000);
// });

/* 
    Real::
    
    getDevices -> /services/chargePointsInterface/devices.xml?api_key=special-key
    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <devices>
            <id>MDB1111111111111111</id>
            <id>LOF1</id>
            <id>LC1-1-2</id>
            <id>LF1</id>
            <id>LF2</id>
            <id>LF3</id>
            <id>LF4</id>
            <id>LC1-1</id>
            <id>LW1</id>
            <id>DP-1</id>
            <id>Main1</id>
            <id>Main2</id>
            <id>LC2-1</id>
            <id>LC2-1-2</id>
            <id>LOF2-1-2</id>
            <id>LOF2-1-1</id>
            <id>LC2-1-1</id>
            <id>AirPump</id>
            <id>Solar1</id>
            <id>Solar2</id>
            <id>Welding</id>
            <id>Color1</id>
            <id>Color2</id>
            <id>MDB3</id>
            <id>A1</id>
            <id>A2</id>
            <id>B2</id>
            <id>B1</id>
            <id>MDB4</id>
            <id>DBF2</id>
            <id>Main</id>
            <id>Solar3</id>
            <id>MDB5</id>
            <id>MDB 5</id>
            <id>BAS</id>
            <id>BAS01</id>
            <id>test1</id>
            <id>aaaa</id>
        </devices>

    getVariableValue (WebSocket) -> /services/chargePointsInterface/variableValue.xml?id=LF1&api_key=special-key
    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <values>
        <variable>
            <id>LF1.AE</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.AI1</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.AI2</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.AI3</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.APIS</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.APPIS</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.DESCRIPTION</id>
        </variable>
        <variable>
            <id>LF1.FRE</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.NAME</id>
            <textValue>LF1</textValue>
        </variable>
        <variable>
            <id>LF1.PFIS</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.RPIS</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.STATUS</id>
            <value>18.000000</value>
        </variable>
        <variable>
            <id>LF1.VDTTM</id>
            <value>01011999003545</value>
        </variable>
        <variable>
            <id>LF1.VI1</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.VI12</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.VI2</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.VI23</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.VI3</id>
            <value>0.000000</value>
        </variable>
        <variable>
            <id>LF1.VI31</id>
            <value>0.000000</value>
        </variable>
        </values>

*/


//web socket (Real)
ws.on('connection', (ws) => {
    ws.on('message', async (deviceId) => {
        try {
            var response = await axios.get(`${powerUrl}/services/chargePointsInterface/variableValue.xml?id=${deviceId}&api_key=special-key`);
            console.log(response.data)
        } catch (error) {
            console.error(error);
        }
        xml2js.parseString(response.data, (err, result) => {
            if(err) {
                throw err;
            }
            const jsonString = JSON.stringify(result, null, 4);
            var json = JSON.parse(jsonString);

            if (devicesId.includes(deviceId)) {
                ws.send(jsonString);
            } else {
                ws.send(`Not has this devices in the system.`);
            }
        });
    });

    ws.on('close', () => {
        console.log('Disconnected from client web socket.');
    });

    ws.send('Connect to Power WebSocket');
    
    setInterval( async () => {
        try {
            var response = await axios.get(`${powerUrl}/services/chargePointsInterface/variableValue.xml?id=MDB1&api_key=special-key`);
            console.log(response.data)
        } catch (error) {
            console.error(error);
        }
        xml2js.parseString(response.data, (err, result) => {
            if(err) {
                throw err;
            }
            const jsonString = JSON.stringify(result, null, 4);
            var json = JSON.parse(jsonString);
            ws.send(jsonString);
        });
    }, 3000);
});