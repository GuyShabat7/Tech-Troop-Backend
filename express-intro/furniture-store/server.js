const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

const store = [
  { name: "table", inventory: 3, price: 800 },
  { name: "chair", inventory: 16, price: 120 },
  { name: "couch", inventory: 1, price: 1200 },
  { name: "picture frame", inventory: 31, price: 70 },
];

app.use(express.static(path.join(__dirname, "dist")));

app.get("/priceCheck/:name", (req, res) => {
  const item = store.find((product) => product.name === req.params.name);
  res.send({ price: item ? item.price : null });
});

app.get("/buy/:name", (req, res) => {
  const item = store.find((product) => product.name === req.params.name);

  if (!item) {
    return res.status(404).send({ error: `We don't sell "${req.params.name}".` });
  }

  if (item.inventory === 0) {
    return res.status(400).send({ error: `${item.name} is out of stock.` });
  }

  item.inventory -= 1;
  res.send(item);
});

// The original price of every item, so a repeated sale doesn't discount twice.
const fullPrices = new Map(store.map((product) => [product.name, product.price]));

app.get("/sale", (request, response) => {
  if (request.query.admin === "true") {
    store.forEach((product) => {
      if (product.inventory > 10) {
        product.price = fullPrices.get(product.name) / 2;
      }
    });
  }

  response.send(store);
});

app.listen(PORT, () => {
  console.log(`Furniture store server is running on http://localhost:${PORT}`);
});
