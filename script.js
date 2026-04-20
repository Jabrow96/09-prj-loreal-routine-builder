/* ===== DOM REFERENCES ===== */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

/* ===== APPLICATION STATE ===== */
let productDatabase = []; // Store all products from JSON
let userSelections = []; // Track currently selected products
let messageHistory = []; // Track API conversation

/* ===== CLOUDFLARE WORKER CONFIG ===== */
const WORKER_ENDPOINT = "https://loreal-worker.jabrow96.workers.dev";

/* ===== INITIALIZE APP ===== */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

// Restore selections from localStorage on page load
restorePersistedSelections();

/* ===== FETCH AND STORE ALL PRODUCT DATA ===== */
async function fetchProductCatalog() {
  const response = await fetch("products.json");
  const data = await response.json();
  productDatabase = data.products;
  return productDatabase;
}

/* ===== RENDER PRODUCT GRID WITH INTERACTIVE FEATURES ===== */
function renderProductGrid(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No products in this category
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isInCart = userSelections.some((item) => item.id === product.id);
      const cartClass = isInCart ? "selected" : "";

      return `
        <div class="product-card ${cartClass}" data-product-id="${product.id}">
          <div class="check-badge">✓</div>
          <img src="${product.image}" alt="${product.name}" class="product-image">
          <div class="product-info">
            <h3>${product.name}</h3>
            <p class="brand">${product.brand}</p>
            <button class="details-btn" data-id="${product.id}">
              <i class="fa-solid fa-expand"></i> View Details
            </button>
            <div class="details-panel" style="display: none;">
              <p>${product.description}</p>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  // Wire up event listeners for this batch of cards
  attachCardEventListeners();
  attachDetailsPanelToggle();
}

/* ===== CATEGORY FILTER HANDLER ===== */
categoryFilter.addEventListener("change", async (e) => {
  const products = await fetchProductCatalog();
  const chosenCategory = e.target.value;

  const matching = products.filter((p) => p.category === chosenCategory);

  renderProductGrid(matching);
});

/* ===== PRODUCT CARD CLICK HANDLER ===== */
function attachCardEventListeners() {
  const cards = document.querySelectorAll(".product-card");

  cards.forEach((card) => {
    card.addEventListener("click", (event) => {
      // Don't select card if user clicked the details button
      if (event.target.closest(".details-btn")) return;

      const productId = parseInt(card.dataset.productId);
      addOrRemoveProduct(productId);
    });
  });
}

/* ===== TOGGLE PRODUCT IN SELECTION ===== */
function addOrRemoveProduct(id) {
  const product = productDatabase.find((p) => p.id === id);
  if (!product) return;

  const idx = userSelections.findIndex((p) => p.id === id);

  if (idx !== -1) {
    userSelections.splice(idx, 1);
  } else {
    userSelections.push(product);
  }

  refreshSelectedDisplay();
  updateCardHighlights();
  persistSelectionsLocally();
}

/* ===== REFRESH SELECTED PRODUCTS UI ===== */
function refreshSelectedDisplay() {
  if (userSelections.length === 0) {
    selectedProductsList.innerHTML =
      '<p class="no-products">No products selected</p>';
    return;
  }

  selectedProductsList.innerHTML = userSelections
    .map(
      (product) => `
      <div class="product-chip">
        <span>${product.name}</span>
        <button class="chip-close" data-id="${product.id}" aria-label="Remove">
          ×
        </button>
      </div>
    `,
    )
    .join("");

  // Attach click handlers to remove buttons
  document.querySelectorAll(".chip-close").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id);
      addOrRemoveProduct(id);
    });
  });
}

/* ===== UPDATE VISUAL INDICATORS ON CARDS ===== */
function updateCardHighlights() {
  document.querySelectorAll(".product-card").forEach((card) => {
    const id = parseInt(card.dataset.productId);
    const selected = userSelections.some((p) => p.id === id);

    if (selected) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  });
}

/* ===== DETAILS PANEL TOGGLE ===== */
function attachDetailsPanelToggle() {
  const buttons = document.querySelectorAll(".details-btn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const card = btn.closest(".product-card");
      const panel = card.querySelector(".details-panel");

      if (panel.style.display === "none") {
        panel.style.display = "block";
        btn.innerHTML = '<i class="fa-solid fa-compress"></i> Hide Details';
      } else {
        panel.style.display = "none";
        btn.innerHTML = '<i class="fa-solid fa-expand"></i> View Details';
      }
    });
  });
}

/* ===== GENERATE ROUTINE FROM SELECTION ===== */
generateRoutineBtn.addEventListener("click", async () => {
  if (userSelections.length === 0) {
    alert("Please select at least one product to create a routine!");
    return;
  }

  chatWindow.innerHTML =
    '<div class="msg ai">✨ Crafting your personalized routine...</div>';

  // Prepare product data for API
  const selectedData = userSelections.map((prod) => ({
    name: prod.name,
    brand: prod.brand,
    category: prod.category,
    description: prod.description,
  }));

  // System instruction for the AI
  const systemInstruction = {
    role: "system",
    content: `You are an expert L'Oréal beauty consultant specializing in skincare, haircare, makeup, and fragrance recommendations. 
    
    Your task is to create a customized daily routine using the provided products. 

    Guidelines:
    - Incorporate all selected products into the routine
    - Structure the response with clear morning, evening, or both routines
    - Explain the purpose of each product and application order
    - Keep advice practical and beginner-friendly
    - Use conversational, engaging language
    - Only reference the provided products
    - Avoid medical claims`,
  };

  // User request with product info
  const userRequest = {
    role: "user",
    content: `Build a personalized beauty routine using these products:\n\n${JSON.stringify(
      selectedData,
      null,
      2,
    )}`,
  };

  // Initialize chat history
  messageHistory = [systemInstruction, userRequest];

  try {
    // Send to Cloudflare Worker
    const result = await fetch(WORKER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messageHistory }),
    });

    if (!result.ok) {
      throw new Error(`Worker responded with status ${result.status}`);
    }

    const responseData = await result.json();
    const aiText = responseData.choices[0].message.content;

    // Store in history
    messageHistory.push({
      role: "assistant",
      content: aiText,
    });

    // Display
    appendChatMessage(aiText, "ai");
  } catch (error) {
    console.error("Routine generation failed:", error);
    chatWindow.innerHTML =
      '<div class="msg ai">⚠️ Unable to generate routine. Please try again.</div>';
  }
});

/* ===== FOLLOW-UP CONVERSATION ===== */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userText = userInput.value.trim();
  if (!userText) return;

  // Verify a routine exists
  if (messageHistory.length === 0) {
    alert("Generate a routine first!");
    return;
  }

  // Show user message
  appendChatMessage(userText, "user");
  userInput.value = "";

  // Add to history
  messageHistory.push({
    role: "user",
    content: userText,
  });

  // Show thinking indicator
  chatWindow.innerHTML += '<div class="msg ai">⏳ Thinking...</div>';

  try {
    const result = await fetch(WORKER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messageHistory }),
    });

    if (!result.ok) {
      throw new Error(`Worker error: ${result.status}`);
    }

    const data = await result.json();
    const responseText = data.choices[0].message.content;

    // Append to history
    messageHistory.push({
      role: "assistant",
      content: responseText,
    });

    // Remove thinking message and add response
    const thinkingMsg = chatWindow.querySelector(".msg.ai:last-child");
    if (thinkingMsg && thinkingMsg.textContent.includes("Thinking")) {
      thinkingMsg.remove();
    }

    appendChatMessage(responseText, "ai");
  } catch (error) {
    console.error("Chat error:", error);
    appendChatMessage(
      "I encountered an issue. Please rephrase your question.",
      "ai",
    );
  }
});

/* ===== APPEND MESSAGE TO CHAT DISPLAY ===== */
function appendChatMessage(text, sender) {
  const msgElement = document.createElement("div");
  msgElement.classList.add("msg", sender);
  msgElement.textContent = text;
  chatWindow.appendChild(msgElement);

  // Auto-scroll
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* ===== PERSIST USER SELECTIONS TO LOCALSTORAGE ===== */
function persistSelectionsLocally() {
  localStorage.setItem("cart", JSON.stringify(userSelections));
}

/* ===== RESTORE PREVIOUS SELECTIONS FROM STORAGE ===== */
async function restorePersistedSelections() {
  const stored = localStorage.getItem("cart");
  if (!stored) return;

  userSelections = JSON.parse(stored);

  // Load all products
  await fetchProductCatalog();

  // Update UI to show restored items
  refreshSelectedDisplay();
  updateCardHighlights();
}

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  chatWindow.innerHTML = "Connect to the OpenAI API for a response!";
});
