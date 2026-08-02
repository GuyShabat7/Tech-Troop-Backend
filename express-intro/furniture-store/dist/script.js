const priceForm = document.getElementById("price-check-form");
const priceInput = document.getElementById("name-input");
const priceResult = document.getElementById("result");

const buyForm = document.getElementById("buy-form");
const buyInput = document.getElementById("buy-input");
const buyResult = document.getElementById("buy-result");

const saleButton = document.getElementById("sale-button");
const storeList = document.getElementById("store-list");

priceForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = priceInput.value.trim();
  if (!name) return;

  const response = await fetch(`/priceCheck/${encodeURIComponent(name)}`);
  const data = await response.json();

  if (data.price === null) {
    priceResult.textContent = `We don't sell "${name}".`;
  } else {
    priceResult.textContent = `The price of ${name} is $${data.price}.`;
  }
});

buyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = buyInput.value.trim();
  if (!name) return;

  const response = await fetch(`/buy/${encodeURIComponent(name)}`);
  const item = await response.json();

  if (item.error) {
    buyResult.textContent = item.error;
    return;
  }

  buyResult.textContent = `Congratulations, you've just bought ${item.name} for $${item.price}. There are ${item.inventory} left now in the store.`;
});

saleButton.addEventListener("click", async () => {
  const response = await fetch("/sale?admin=true");
  const store = await response.json();

  storeList.innerHTML = "";

  store.forEach((product) => {
    const li = document.createElement("li");
    li.textContent = `${product.name} - $${product.price} (${product.inventory} in stock)`;
    storeList.appendChild(li);
  });
});
