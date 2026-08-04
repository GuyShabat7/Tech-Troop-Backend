const express = require('express')

const app = express()
app.use(express.json()) //Postman will send JSON bodies

// ----- Exercise 1 -----
app.get('/sanity', function (req, res) {
    res.send("Server is up and running")
})

// ----- Exercise 2 -----
const wordCounter = {}

app.get('/word/:word', function (req, res) {
    const word = req.params.word

    if (word in wordCounter) {
        res.send({ count: wordCounter[word] })
    } else {
        res.send({ count: 0 })
    }
})

// ----- Exercise 3 -----
app.post('/word', function (req, res) {
    const word = req.body.word

    if (word in wordCounter) {
        wordCounter[word] += 1
    } else {
        wordCounter[word] = 1
    }

    res.send({ text: `Added ${word}`, currentCount: wordCounter[word] })
})

// ----- Exercise 4 -----
app.post('/sentence', function (req, res) {
    const words = req.body.sentence.split(" ")

    let numNewWords = 0
    let numOldWords = 0

    words.forEach(function (word) {
        if (word in wordCounter) {
            wordCounter[word] += 1
            numOldWords += 1
        } else {
            wordCounter[word] = 1
            numNewWords += 1
        }
    })

    res.send({
        text: `Added ${numNewWords} words, ${numOldWords} already existed`,
        currentCount: -1
    })
})

// ----- Exercise 5 -----
app.delete('/word/:word', function (req, res) {
    const word = req.params.word

    if (!(word in wordCounter)) { //can't delete something that was never counted
        return res.status(404).send({ text: `"${word}" is not in the word counter` })
    }

    delete wordCounter[word]
    res.status(200).send({ text: `Deleted ${word}` })
})

const port = 3001
app.listen(port, function () {
    console.log(`Server running on ${port}`)
})
