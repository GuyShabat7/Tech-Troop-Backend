const http = require('http')
const users = require('./users')

const server = http.createServer((req,res) => {
    console.log(`${req.method} ${req.url}`)
    res.setHeader('Content-Type', 'application/json')

    if(req.method === 'GET' && req.url === '/api/users') {
        res.writeHead(200)
        res.end(JSON.stringify(users.getAll()))
    } else if(req.method === 'GET' && req.url.startsWith('/api/users')) {
        const id = Number(req.url.split('/')[3])
        const user = users.getById(id)

        if(user) {
            res.writeHead(200)
            res.end(JSON.stringify(user))
        } else {
            res.writeHead(404)
            res.end(JSON.stringify({ error: 'User not found '}))
        }
    } else if (req.method === 'POST' && req.url === '/api/users') {
        let body = ''
        req.on('data', chunck => { body += chunck })
        req.on('end', () => {
            try {
                const data = JSON.parse(body)
                const newUser = users.add(data)
                res.writeHead(201)
                res.end(JSON.stringify(newUser))
            } catch(err) {
                res.writeHead(400)
                res.end(JSON.stringify({error: 'Invalid JSON'}))
            }
        })
    } else {
        res.writeHead(404)
        res.end(JSON.stringify({error: 'Route not found'}))
    }

})

const port = 3000
server.listen(port, () => {
    console.log(`Node server created as port ${port}`)
})

