const express = require('express')

const app = express()

//---------------------------------------------
// MIDDLEWARE
//---------------------------------------------

//1. Logging middleware - prints [TIMESTAMP] METHOD URL for every request
const logger = function (req, res, next) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ${req.method} ${req.url}`)
    next() //hand the request to whatever comes next
}

//2. Request counter middleware - counts every request the server has handled
let totalRequests = 0

const requestCounter = function (req, res, next) {
    totalRequests += 1
    req.requestCount = totalRequests //attach it to the request object
    next()
}

//Apply both to ALL routes, in order: log first, then count
app.use(logger)
app.use(requestCounter)

//---------------------------------------------
// ROUTES
//---------------------------------------------

app.get('/', function (req, res) {
    res.send({ message: "Welcome!", requestCount: req.requestCount })
})

app.get('/about', function (req, res) {
    res.send({ message: "About us", requestCount: req.requestCount })
})

const port = 4001
app.listen(port, function () {
    console.log(`Server running on ${port}`)
})
