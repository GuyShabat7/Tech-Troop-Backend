const express = require('express')

const app = express()
app.use(express.json()) //so POST /users can read req.body

//Test data
const users = [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]

//---------------------------------------------
// MIDDLEWARE
//---------------------------------------------

//1. Is :id actually a number? If not, throw a 400 error
const validateId = function (req, res, next) {
    const id = Number(req.params.id)

    if (!Number.isInteger(id)) {
        const error = new Error(`Invalid ID format: "${req.params.id}" is not a number`)
        error.status = 400
        throw error //Express catches this and jumps to the error handler
    }

    req.userId = id //hand the parsed number to the next middleware
    next()
}

//2. Does that user actually exist? If not, pass a 404 error along
const checkResourceExists = function (req, res, next) {
    const user = users.find(function (user) {
        return user.id === req.userId
    })

    if (!user) {
        const error = new Error(`User with id ${req.userId} not found`)
        error.status = 404
        return next(error) //passing an argument to next() means "this is an error"
    }

    req.user = user //found it - attach it so the route doesn't have to search again
    next()
}

//---------------------------------------------
// ROUTES
//---------------------------------------------

app.get('/users', function (req, res) {
    res.send(users)
})

//The two middlewares run in order, before the handler
app.get('/users/:id', validateId, checkResourceExists, function (req, res) {
    res.send(req.user)
})

app.post('/users', function (req, res) {
    const newUser = { id: users.length + 1, name: req.body.name }
    users.push(newUser)
    res.status(201).send(newUser)
})

//---------------------------------------------
// ERROR HANDLING MIDDLEWARE - always last, and it takes FOUR arguments
//---------------------------------------------
app.use(function (err, req, res, next) {
    console.log(`Error: ${err.message}`)
    res.status(err.status || 500).send({ error: err.message })
})

const port = 4002
app.listen(port, function () {
    console.log(`Server running on ${port}`)
})
