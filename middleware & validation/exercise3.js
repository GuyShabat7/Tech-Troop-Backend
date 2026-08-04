const express = require('express')
const Ajv = require('ajv')
const { body, param, validationResult } = require('express-validator')

const app = express()

//---------------------------------------------
// ADVANCED MIDDLEWARE (all run before every route)
//---------------------------------------------

//1. Logger with execution time - measures how long the whole request took
const requestLogger = function (req, res, next) {
    const start = Date.now()

    //'finish' fires once the response has been fully sent
    res.on('finish', function () {
        const duration = Date.now() - start
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`)
    })

    next() //don't wait - let the request continue immediately
}

//2. Rate limiting - max 10 requests per IP per minute
const WINDOW_MS = 60 * 1000
const MAX_REQUESTS = 10
const hits = {} //{ ip: [timestamp, timestamp, ...] }

const rateLimiter = function (req, res, next) {
    const now = Date.now()
    const ip = req.ip

    //Keep only the timestamps from within the last minute
    const recent = (hits[ip] || []).filter(function (time) {
        return now - time < WINDOW_MS
    })

    if (recent.length >= MAX_REQUESTS) {
        const oldest = recent[0]
        const retryAfter = Math.ceil((WINDOW_MS - (now - oldest)) / 1000)

        const error = new Error(`Rate limit exceeded: max ${MAX_REQUESTS} requests per minute. Try again in ${retryAfter}s`)
        error.status = 429 //429 Too Many Requests
        hits[ip] = recent //don't count the rejected request itself
        return next(error)
    }

    recent.push(now)
    hits[ip] = recent
    next()
}

//3. Content-Type validation - POST/PUT must send JSON
const requireJson = function (req, res, next) {
    if (req.method === 'POST' || req.method === 'PUT') {
        if (!req.is('application/json')) {
            const error = new Error("Content-Type must be application/json")
            error.status = 415 //415 Unsupported Media Type
            return next(error)
        }
    }

    next()
}

//4. Response formatter - every response gets the same envelope
const responseFormatter = function (req, res, next) {
    //Patch res.json, NOT res.send: express's send() calls json() for objects,
    //and json() then calls send() again - patching send would recurse forever.
    const originalJson = res.json.bind(res)

    res.json = function (payload) {
        const success = res.statusCode < 400

        return originalJson({
            success: success,
            timestamp: new Date().toISOString(),
            ...(success ? { data: payload } : { error: payload })
        })
    }

    next()
}

app.use(requestLogger)
app.use(responseFormatter)
app.use(rateLimiter)
app.use(requireJson)
app.use(express.json()) //runs after the Content-Type check, so bad types get 415 not 400

//---------------------------------------------
// DATA (in memory, resets when the server restarts)
//---------------------------------------------
const posts = []
let nextPostId = 1

const comments = []
let nextCommentId = 1

//---------------------------------------------
// AJV SETUP - describe what a valid Post looks like, as data
//---------------------------------------------
const ajv = new Ajv({ allErrors: true }) //allErrors: report every problem, not just the first

const postSchema = {
    type: "object",
    properties: {
        title:    { type: "string", minLength: 5, maxLength: 100 },
        content:  { type: "string", minLength: 10, maxLength: 1000 },
        tags:     { type: "array", items: { type: "string" } },
        category: { type: "string" }
    },
    required: ["title", "content", "tags"],
    additionalProperties: false //reject anything we didn't list
}

const validatePost = ajv.compile(postSchema) //compile once at startup, reuse per request

//Middleware that runs the compiled validator against req.body
const validatePostBody = function (req, res, next) {
    const valid = validatePost(req.body)

    if (!valid) {
        const error = new Error("Post validation failed")
        error.status = 400
        //Turn AJV's raw output into something readable
        error.details = validatePost.errors.map(function (e) {
            return `${e.instancePath || "body"} ${e.message}`
        })
        return next(error)
    }

    next()
}

//---------------------------------------------
// ROUTES
//---------------------------------------------

app.post('/posts', validatePostBody, function (req, res) {
    const newPost = {
        id: nextPostId,
        title: req.body.title,
        content: req.body.content,
        tags: req.body.tags,
        category: req.body.category
    }

    nextPostId += 1
    posts.push(newPost)

    res.status(201).send(newPost)
})

app.get('/posts', function (req, res) {
    res.send(posts)
})

//---------------------------------------------
// EXPRESS-VALIDATOR SETUP - rules are chained onto each field
//---------------------------------------------

//The rules for creating a comment
const commentRules = [
    body('content')
        .isString().withMessage('content must be a string')
        .isLength({ min: 5, max: 500 }).withMessage('content must be 5-500 characters'),
    body('email')
        .isEmail().withMessage('email must be a valid email address'),
    param('postId')
        .isInt({ min: 1 }).withMessage('postId must be a positive integer')
]

//The rules for just reading comments - only the URL parameter matters
const postIdRule = [
    param('postId')
        .isInt({ min: 1 }).withMessage('postId must be a positive integer')
]

//Collects whatever the rules above found and turns failures into a 400
const handleValidation = function (req, res, next) {
    const result = validationResult(req)

    if (!result.isEmpty()) {
        const error = new Error("Comment validation failed")
        error.status = 400
        error.details = result.array().map(function (e) {
            return `${e.path} ${e.msg}`
        })
        return next(error)
    }

    next()
}

//Does the post in the URL actually exist? (the "postId must reference existing post" rule)
const checkPostExists = function (req, res, next) {
    const postId = Number(req.params.postId)

    const post = posts.find(function (post) {
        return post.id === postId
    })

    if (!post) {
        const error = new Error(`Post with id ${postId} not found`)
        error.status = 404
        return next(error)
    }

    req.post = post
    next()
}

app.post('/posts/:postId/comments', commentRules, handleValidation, checkPostExists, function (req, res) {
    const newComment = {
        id: nextCommentId,
        postId: req.post.id,
        content: req.body.content,
        email: req.body.email
    }

    nextCommentId += 1
    comments.push(newComment)

    res.status(201).send(newComment)
})

app.get('/posts/:postId/comments', postIdRule, handleValidation, function (req, res) {
    const postId = Number(req.params.postId)

    const postComments = comments.filter(function (comment) {
        return comment.postId === postId
    })

    res.send(postComments)
})

//---------------------------------------------
// ERROR HANDLER - four arguments, registered last
//---------------------------------------------
app.use(function (err, req, res, next) {
    console.log(`Error: ${err.message}`)
    res.status(err.status || 500).send({
        error: err.message,
        details: err.details //undefined for errors that don't have any
    })
})

const port = 4003
app.listen(port, function () {
    console.log(`Server running on ${port}`)
})
