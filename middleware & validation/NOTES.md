# Middleware & Validation — Notes

Explanations for the exercises in this folder.

| File | Port | Topic |
|---|---|---|
| `exercise1.js` | 4001 | Basic custom middleware (logger, request counter) |
| `exercise2.js` | 4002 | Route-specific middleware + error handling |
| `exercise3.js` | 4003 | AJV, express-validator, advanced middleware stack |

Run any of them with `node exercise1.js` (etc.) from this folder. **Every change to a
`.js` file needs a server restart** — Node reads the file once, at startup.

> Setup note: `npm init -y` fails in this folder because npm derives the package name from
> the directory, and `&` is illegal in npm names. `package.json` was written by hand with
> the name `middleware-validation`.

---

## What middleware actually is

A middleware is **a function that sits between the incoming request and your route
handler**. It takes three arguments:

```js
function (req, res, next) { ... }
```

That third one, `next`, is the whole idea: calling it says *"I'm done, pass this request
along."* If you forget to call `next()`, the request stops dead and hangs.

Middleware runs **top to bottom, in the order you register it**. Anything registered
*after* a route never runs for that route, because the route already ended the request
with `res.send`.

---

## Exercise 1 — basic middleware

### The logger

```js
const logger = function (req, res, next) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ${req.method} ${req.url}`)
    next()
}
```

`req.method` is `"GET"`/`"POST"`, `req.url` is the path. `toISOString()` produces the
`2026-08-04T16:53:56.722Z` format. It logs, then steps aside.

### The counter

```js
let totalRequests = 0

const requestCounter = function (req, res, next) {
    totalRequests += 1
    req.requestCount = totalRequests
    next()
}
```

Two things to notice:

- **`totalRequests` lives outside the function**, so it survives between requests. That's
  what makes counting possible.
- **`req.requestCount = totalRequests` attaches data to the request object.** This is the
  key trick: `req` travels down the chain, so anything you hang on it is visible to every
  later middleware and to the route handler. The route reads `req.requestCount` without
  knowing anything about the counter.

### Registering them

```js
app.use(logger)
app.use(requestCounter)
```

`app.use` with no path means "run for every request, whatever the method or URL".

The full journey of one request:
`GET /` → logger prints → counter sets `req.requestCount = 1` → route handler reads it →
`res.send` ends it.

---

## Exercise 2 — route-specific middleware and error handling

### Route-specific instead of global

Exercise 1 used `app.use(logger)` — global. Here the middlewares apply to **one route
only**, by passing them as arguments before the handler:

```js
app.get('/users/:id', validateId, checkResourceExists, function (req, res) {
    res.send(req.user)
})
```

Express runs them left to right: `validateId` → `checkResourceExists` → handler. Each must
call `next()` to advance. `GET /users` and `POST /users` don't list them, so they skip
validation entirely.

### `validateId` — throwing an error

```js
const id = Number(req.params.id)

if (!Number.isInteger(id)) {
    const error = new Error(`Invalid ID format: ...`)
    error.status = 400
    throw error
}

req.userId = id
next()
```

Route params are **always strings** — `"1"`, not `1`. `Number("abc")` gives `NaN`, and
`Number.isInteger(NaN)` is `false`, so we throw. The custom `.status` property tells the
error handler this is a 400, not a generic 500. There's no `next()` after `throw` —
throwing ends the function immediately, and Express catches it.

### `checkResourceExists` — passing an error

```js
if (!user) {
    const error = new Error(`User with id ${req.userId} not found`)
    error.status = 404
    return next(error)
}

req.user = user
next()
```

**The rule that trips people up:** `next()` with no arguments means "continue normally";
`next(error)` means "something went wrong, skip to the error handler". Any argument at all
is treated as an error.

`throw` and `next(err)` land in the same place. Use **`next(err)` inside async code**,
where a `throw` can escape Express.

### The error handler — four arguments

```js
app.use(function (err, req, res, next) {
    console.log(`Error: ${err.message}`)
    res.status(err.status || 500).send({ error: err.message })
})
```

Two non-negotiable rules:

- **It must take exactly four parameters.** That's how Express identifies it as an error
  handler rather than a normal middleware. Drop the unused `next` and it silently becomes
  a regular middleware that never fires.
- **It must be registered last**, after all routes. Errors flow *forward*.

`err.status || 500` means "use the status I attached, or fall back to 500 Internal Server
Error" — the right default for an unexpected crash.

The payoff: every route funnels its failures into **one place** with **one consistent
response shape**. No `try/catch` scattered through handlers.

### Results

```
GET  /users      -> 200  [{"id":1,"name":"John"},{"id":2,"name":"Jane"}]
GET  /users/1    -> 200  {"id":1,"name":"John"}
GET  /users/999  -> 404  {"error":"User with id 999 not found"}
GET  /users/abc  -> 400  {"error":"Invalid ID format: \"abc\" is not a number"}
POST /users      -> 201  {"id":3,"name":"Alice"}
```

---

## Exercise 3, step 1 — posts with AJV

AJV validates data against a **JSON Schema** — you *describe* the valid shape as data,
rather than writing `if` statements.

```js
const postSchema = {
    type: "object",
    properties: {
        title:    { type: "string", minLength: 5, maxLength: 100 },
        content:  { type: "string", minLength: 10, maxLength: 1000 },
        tags:     { type: "array", items: { type: "string" } },
        category: { type: "string" }
    },
    required: ["title", "content", "tags"],
    additionalProperties: false
}
```

Two keywords worth calling out:

- **`required`** — `properties` alone only says *"if present, it must look like this"*.
  Without `required`, an empty `{}` would pass.
- **`additionalProperties: false`** — rejects unlisted fields. This stops a client sneaking
  in `{"id": 999}` or `{"isAdmin": true}`.

### Compile once, validate per request

```js
const validatePost = ajv.compile(postSchema)
```

`compile` turns the schema into an optimized JS function — the expensive step, so it
happens **once at startup**, not per request. `validatePost(data)` returns `true`/`false`
and fills `validatePost.errors` on failure.

`new Ajv({ allErrors: true })` reports *every* problem; without it AJV stops at the first.

### Wrapping it as middleware

```js
const validatePostBody = function (req, res, next) {
    const valid = validatePost(req.body)

    if (!valid) {
        const error = new Error("Post validation failed")
        error.status = 400
        error.details = validatePost.errors.map(function (e) {
            return `${e.instancePath || "body"} ${e.message}`
        })
        return next(error)
    }

    next()
}
```

Same pattern as Exercise 2: attach `.status`, call `next(error)`, let the single error
handler respond. `e.instancePath` is where the problem is (`/title`, `/tags/0`) — empty for
a missing top-level field, hence the `|| "body"` fallback.

**The handler never checks anything** — by the time it runs, the data is guaranteed valid.
That's the payoff.

### Results

```
valid post       -> 201  {"id":1,"title":"My First Post",...}
title too short  -> 400  ["/title must NOT have fewer than 5 characters"]
missing content  -> 400  ["body must have required property 'content'"]
tags not strings -> 400  ["/tags/0 must be string","/tags/1 must be string"]
```

---

## Exercise 3, step 2 — comments with express-validator

### Two different philosophies

**AJV:** write a schema object describing the shape, validate the whole body at once.
**express-validator:** chain rules onto individual fields; each chain is itself a middleware.

```js
const commentRules = [
    body('content')
        .isString().withMessage('content must be a string')
        .isLength({ min: 5, max: 500 }).withMessage('content must be 5-500 characters'),
    body('email')
        .isEmail().withMessage('email must be a valid email address'),
    param('postId')
        .isInt({ min: 1 }).withMessage('postId must be a positive integer')
]
```

- **`body('content')`** targets `req.body.content`; **`param('postId')`** targets
  `req.params.postId`. AJV only ever saw the body — express-validator can validate the URL,
  query string, and headers too. That's its advantage here, since `postId` lives in the path.
- **`.withMessage(...)`** overrides the message for the check immediately before it.
- **This is an array of middlewares**, so it drops straight into the route. Express
  flattens arrays of middleware automatically.

### The rules don't reject anything

The crucial bit: **each rule just records its findings on `req` and calls `next()`.**
Nothing 400s on its own. A second middleware reads the verdict:

```js
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
```

Forget this middleware and invalid data sails straight through to your handler.

### Ordering is the design

```js
app.post('/posts/:postId/comments', commentRules, handleValidation, checkPostExists, handler)
```

Read left to right: **check the data is well-formed → reject if not → check the post
exists → reject if not → handle it.**

`checkPostExists` runs *after* `handleValidation` on purpose. It does
`Number(req.params.postId)` and searches an array — pointless work if `postId` is `"abc"`.

That's why the two failures get different codes:

```
POST /posts/abc/comments -> 400  (malformed input)
POST /posts/99/comments  -> 404  (well-formed, but no such post)
```

`checkPostExists` is the third rule of the Comment model — *"postId must reference existing
post"* — which **no schema library can check**, because it requires looking at your data.
Format validation and existence validation are separate jobs.

### Results

```
valid comment       -> 201  {"id":1,"postId":1,"content":"Great post!","email":"user@example.com"}
bad email           -> 400  ["email email must be a valid email address"]
content too short   -> 400  ["content content must be 5-500 characters"]
post doesn't exist  -> 404  "Post with id 99 not found"
postId not a number -> 400  ["postId postId must be a positive integer"]
```

---

## Exercise 3, step 3 — the advanced middleware stack

### 1. Logger with execution time

```js
const requestLogger = function (req, res, next) {
    const start = Date.now()

    res.on('finish', function () {
        const duration = Date.now() - start
        console.log(`[...] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`)
    })

    next()
}
```

The trick: you **can't log the status and duration right away** — when the middleware runs,
the response hasn't happened yet. Register a listener for the `'finish'` event, which Node
fires once the response is fully sent, then call `next()` immediately. The callback runs
later, when the answer is known.

### 2. Rate limiter — sliding window

```js
const hits = {} //{ ip: [timestamp, ...] }

const recent = (hits[ip] || []).filter(function (time) {
    return now - time < WINDOW_MS
})

if (recent.length >= MAX_REQUESTS) { ... 429 ... }

recent.push(now)
hits[ip] = recent
```

Store a timestamp per request; on each new one, throw away anything older than 60 seconds.
If 10 survive, block. **No timers or cleanup jobs — the filter does the expiring.**

**429 Too Many Requests** is the correct status. `retryAfter` is computed from the oldest
surviving timestamp. Blocked requests are deliberately *not* recorded — otherwise hammering
the API would keep extending your own ban.

Note the limit is **per IP across all routes**: in testing, blocking started at GET #8
because three earlier POSTs also counted (3 + 7 = 10, so the 11th request was refused).

### 3. Content-Type validation

```js
if (req.method === 'POST' || req.method === 'PUT') {
    if (!req.is('application/json')) { ... 415 ... }
}
```

`req.is()` checks the incoming `Content-Type` header. **415 Unsupported Media Type** is the
precise code — the request isn't malformed (400), the format just isn't one we accept.

Placement matters:

```js
app.use(requireJson)
app.use(express.json()) //after the check
```

`express.json()` only parses bodies when the Content-Type matches; with `text/plain` it
silently leaves `req.body` empty, and AJV would then report a confusing *"must have
required property 'title'"* 400. Checking first turns that into an honest 415.

### 4. Response formatter (monkey-patching)

```js
const originalJson = res.json.bind(res)

res.json = function (payload) {
    const success = res.statusCode < 400

    return originalJson({
        success: success,
        timestamp: new Date().toISOString(),
        ...(success ? { data: payload } : { error: payload })
    })
}
```

**Monkey-patching**: keep a reference to the real method, replace it with your own, do your
work, then delegate. Every route keeps calling plain `res.send(...)` and knows nothing about
the envelope. `res.statusCode < 400` decides the shape, so the error handler needs no
special treatment.

> **Patch `res.json`, never `res.send`.** Express's `send()` calls `json()` for objects, and
> `json()` calls `send()` again — patching `send` recurses infinitely until Node dies with
> `RangeError: Invalid string length`. This happened on the first attempt.

### The ordering, top to bottom

```js
app.use(requestLogger)      //start the clock first, so it times everything
app.use(responseFormatter)  //patch res.json before anyone can respond
app.use(rateLimiter)        //reject floods before doing real work
app.use(requireJson)        //cheap header check before parsing
app.use(express.json())     //parse the body last
```

Each one is cheap and general; the expensive, specific work happens after. **That ordering
is the design.**

### Results

```
valid post           -> 201  {"success":true, "timestamp":"...", "data":{...}}
validation error     -> 400  {"success":false,"timestamp":"...","error":{...}}
wrong Content-Type   -> 415  {"success":false,...,"error":{"error":"Content-Type must be application/json"}}
rate limit           -> 200 x7 then 429 x5
```

```
[2026-08-04T19:08:51.321Z] POST /posts -> 201 (27ms)
[2026-08-04T19:08:51.378Z] POST /posts -> 400 (2ms)
[2026-08-04T19:08:51.411Z] POST /posts -> 415 (1ms)
[2026-08-04T19:08:51.677Z] GET  /posts -> 429 (1ms)
```

### Known wart

Error responses come out double-nested — `"error": {"error": "...", "details": [...]}` —
because the error handler sends an object that already has an `error` key, and the formatter
wraps it again. Consistent and harmless, but it could be flattened to
`{"success":false,"error":"...","details":[...]}`.

---

## Status codes used here

| Code | Meaning | Used for |
|---|---|---|
| 200 | OK | successful GET |
| 201 | Created | successful POST |
| 400 | Bad Request | malformed input (bad ID format, failed validation) |
| 404 | Not Found | well-formed request, resource doesn't exist |
| 415 | Unsupported Media Type | wrong Content-Type |
| 429 | Too Many Requests | rate limit exceeded |
| 500 | Internal Server Error | fallback for unexpected errors |
