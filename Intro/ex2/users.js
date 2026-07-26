let users = [
  { id: 1, name: "John Doe", email: "john@example.com" },
  { id: 2, name: "Jane Smith", email: "jane@example.com" }
]

function getAll() {
    return users
}

function getById(id) {
    return users.find(u => u.id === id)
}

function add({ name, email }) {
    const newUser = {
        id: users.length ? users[users.length - 1].id + 1 : 1,
        name,
        email
    }
    users.push(newUser)
    return newUser
}

module.exports = {getAll, getById, add}