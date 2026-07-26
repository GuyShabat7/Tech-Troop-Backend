const http = require("http");

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`)

    if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('Welcome to my server')
    } else if (req.method === 'GET' && req.url === '/about') {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('This is the about page')
    } else if (req.method === 'GET' && req.url === '/contact') {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('Guy Shabat - g.y.shabat@gmail.com')
    } else {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('404 - Page not found')
    }
})

const port = 3000
server.listen(port, () => {
    console.log(`Node server created at port ${port}`)
})
