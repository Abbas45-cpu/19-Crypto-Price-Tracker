const API_URL = "https://api.coingecko.com/api/v3/coins/markets";
const CHART_URL = "https://api.coingecko.com/api/v3/coins";
const REFRESH_INTERVAL = 20000;
const STORAGE_KEYS = {
  theme: "nova_crypto_theme",
  currency: "nova_crypto_currency",
  watchlist: "nova_crypto_watchlist"
};

class CryptoAPI {
  async fetchMarkets(currency) {
    const url = `${API_URL}?vs_currency=${currency}&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch market data");
    }
    return response.json();
  }

  async fetchChart(id, currency) {
    const url = `${CHART_URL}/${id}/market_chart?vs_currency=${currency}&days=7`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch chart");
    }
    return response.json();
  }
}

class WatchlistManager {
  constructor() {
    this.items = new Set(this.load());
  }

  load() {
    const stored = localStorage.getItem(STORAGE_KEYS.watchlist);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch (error) {
      return [];
    }
  }

  save() {
    localStorage.setItem(STORAGE_KEYS.watchlist, JSON.stringify(Array.from(this.items)));
  }

  toggle(id) {
    if (this.items.has(id)) {
      this.items.delete(id);
    } else {
      this.items.add(id);
    }
    this.save();
  }

  has(id) {
    return this.items.has(id);
  }
}

class ThemeManager {
  constructor(toggle) {
    this.toggle = toggle;
  }

  init() {
    const stored = localStorage.getItem(STORAGE_KEYS.theme) || "light";
    this.apply(stored);
    this.toggle?.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      this.apply(next);
      localStorage.setItem(STORAGE_KEYS.theme, next);
    });
  }

  apply(mode) {
    document.documentElement.dataset.theme = mode;
    if (this.toggle) {
      this.toggle.textContent = mode === "dark" ? "Dark" : "Light";
    }
  }
}

class UIManager {
  constructor() {
    this.tableBody = document.querySelector("[data-table-body]");
    this.searchInput = document.querySelector("[data-search]");
    this.lastUpdated = document.querySelector("[data-last-updated]");
    this.loading = document.querySelector("[data-loading]");
    this.modal = document.querySelector("[data-modal]");
    this.modalTitle = document.querySelector("[data-modal-title]");
    this.modalPrice = document.querySelector("[data-modal-price]");
    this.chartCanvas = document.getElementById("coinChart");
    this.currentTab = "all";
    this.sortKey = "market_cap";
    this.sortDirection = "desc";
    this.previousPrices = new Map();
  }

  bindEvents({ onSearch, onSort, onToggleTab, onRowClick, onWatchToggle }) {
    this.searchInput?.addEventListener("input", (event) => onSearch(event.target.value));

    document.querySelectorAll("[data-sort]").forEach((button) => {
      button.addEventListener("click", () => onSort(button.dataset.sort));
    });

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => onToggleTab(button.dataset.tab));
    });

    this.tableBody?.addEventListener("click", (event) => {
      const row = event.target.closest("tr");
      const watch = event.target.closest("[data-watch]");
      if (watch) {
        onWatchToggle(watch.dataset.watch);
        return;
      }
      if (row?.dataset.id) {
        onRowClick(row.dataset.id, row.dataset.name);
      }
    });

    document.querySelector("[data-modal-close]")?.addEventListener("click", () => this.closeModal());
    this.modal?.addEventListener("click", (event) => {
      if (event.target === this.modal) {
        this.closeModal();
      }
    });
  }

  setActiveTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });
  }

  setSort(key) {
    this.sortKey = key;
    this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
  }

  showLoading(state) {
    if (!this.loading) return;
    this.loading.classList.toggle("active", state);
  }

  updateTimestamp() {
    const time = new Date();
    const formatted = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (this.lastUpdated) {
      this.lastUpdated.textContent = `Updated ${formatted}`;
    }
  }

  renderTable({ coins, watchlist, currency }) {
    if (!this.tableBody) return;
    this.tableBody.innerHTML = "";

    coins.forEach((coin) => {
      const prev = this.previousPrices.get(coin.id);
      const changeClass = coin.price_change_percentage_24h >= 0 ? "positive" : "negative";
      const row = document.createElement("tr");
      row.dataset.id = coin.id;
      row.dataset.name = coin.name;

      if (prev && prev !== coin.current_price) {
        row.classList.add("row-flash", coin.current_price > prev ? "positive" : "negative");
      }
      this.previousPrices.set(coin.id, coin.current_price);

      row.innerHTML = `
        <td>${coin.market_cap_rank}</td>
        <td class="coin">
          <img src="${coin.image}" alt="${coin.name}" loading="lazy" />
          <div>
            <strong>${coin.name}</strong>
            <span>${coin.symbol.toUpperCase()}</span>
          </div>
        </td>
        <td>${formatCurrency(coin.current_price, currency)}</td>
        <td class="change ${changeClass}">
          ${coin.price_change_percentage_24h >= 0 ? "+" : ""}${coin.price_change_percentage_24h.toFixed(2)}%
        </td>
        <td>${formatCurrency(coin.market_cap, currency)}</td>
        <td>${formatCurrency(coin.total_volume, currency)}</td>
        <td>${renderSparkline(coin.sparkline_in_7d?.price || [])}</td>
        <td>
          <button class="watch-button ${watchlist.has(coin.id) ? "active" : ""}" type="button" data-watch="${coin.id}">
            ${watchlist.has(coin.id) ? "Watching" : "Watch"}
          </button>
        </td>
      `;
      this.tableBody.appendChild(row);
    });
  }

  openModal({ name, price }) {
    if (this.modalTitle) this.modalTitle.textContent = name;
    if (this.modalPrice) this.modalPrice.textContent = price;
    this.modal?.classList.add("open");
  }

  closeModal() {
    this.modal?.classList.remove("open");
  }
}

const formatCurrency = (value, currency) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: value > 100 ? 0 : 2
  }).format(value);
};

const renderSparkline = (prices) => {
  if (!prices.length) return "";
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const points = prices
    .map((price, index) => {
      const x = (index / (prices.length - 1)) * 120;
      const y = 30 - ((price - min) / (max - min || 1)) * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return `
    <svg class="sparkline" viewBox="0 0 120 30" preserveAspectRatio="none">
      <polyline fill="none" stroke="currentColor" stroke-width="2" points="${points}" />
    </svg>
  `;
};

class App {
  constructor() {
    this.api = new CryptoAPI();
    this.ui = new UIManager();
    this.watchlist = new WatchlistManager();
    this.currency = localStorage.getItem(STORAGE_KEYS.currency) || "usd";
    this.coins = [];
    this.chart = null;
  }

  init() {
    new ThemeManager(document.querySelector("[data-theme-toggle]")).init();
    this.bindHeaderControls();
    this.ui.bindEvents({
      onSearch: (value) => this.handleSearch(value),
      onSort: (key) => this.handleSort(key),
      onToggleTab: (tab) => this.handleTab(tab),
      onRowClick: (id, name) => this.openCoinModal(id, name),
      onWatchToggle: (id) => this.toggleWatch(id)
    });
    this.fetchAndRender();
    this.startAutoRefresh();
    this.initReveal();
    this.initScrollTop();
  }

  bindHeaderControls() {
    document.querySelectorAll("[data-currency]").forEach((button) => {
      button.classList.toggle("active", button.dataset.currency === this.currency);
      button.addEventListener("click", () => {
        this.currency = button.dataset.currency;
        localStorage.setItem(STORAGE_KEYS.currency, this.currency);
        document.querySelectorAll("[data-currency]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.currency === this.currency);
        });
        this.fetchAndRender();
      });
    });

    document.querySelector("[data-refresh]")?.addEventListener("click", () => this.fetchAndRender());
  }

  async fetchAndRender() {
    this.ui.showLoading(true);
    try {
      this.coins = await this.api.fetchMarkets(this.currency);
      this.render();
      this.ui.updateTimestamp();
    } catch (error) {
      if (this.ui.tableBody) {
        this.ui.tableBody.innerHTML = `<tr><td colspan="8">Failed to load data.</td></tr>`;
      }
    } finally {
      this.ui.showLoading(false);
    }
  }

  render() {
    const filtered = this.applyFilters();
    this.ui.renderTable({ coins: filtered, watchlist: this.watchlist, currency: this.currency });
  }

  applyFilters(query = "") {
    let results = [...this.coins];
    if (this.ui.currentTab === "watchlist") {
      results = results.filter((coin) => this.watchlist.has(coin.id));
    }
    if (query) {
      const lower = query.toLowerCase();
      results = results.filter(
        (coin) => coin.name.toLowerCase().includes(lower) || coin.symbol.toLowerCase().includes(lower)
      );
    }
    return this.applySort(results);
  }

  applySort(coins) {
    const keyMap = {
      price: "current_price",
      market: "market_cap",
      change: "price_change_percentage_24h"
    };
    const key = keyMap[this.ui.sortKey] || "market_cap";
    return coins.sort((a, b) => {
      const aValue = a[key] ?? 0;
      const bValue = b[key] ?? 0;
      return this.ui.sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    });
  }

  handleSearch(value) {
    this.renderWithQuery(value);
  }

  renderWithQuery(value) {
    const filtered = this.applyFilters(value);
    this.ui.renderTable({ coins: filtered, watchlist: this.watchlist, currency: this.currency });
  }

  handleSort(key) {
    this.ui.setSort(key);
    this.render();
  }

  handleTab(tab) {
    this.ui.setActiveTab(tab);
    this.render();
  }

  toggleWatch(id) {
    this.watchlist.toggle(id);
    this.render();
  }

  async openCoinModal(id, name) {
    const coin = this.coins.find((item) => item.id === id);
    if (!coin) return;
    this.ui.openModal({ name, price: formatCurrency(coin.current_price, this.currency) });

    try {
      const data = await this.api.fetchChart(id, this.currency);
      const prices = data.prices.map((entry) => entry[1]);
      this.renderChart(prices, name);
    } catch (error) {
      this.renderChart([], name);
    }
  }

  renderChart(prices, name) {
    if (!this.ui.chartCanvas) return;
    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = new Chart(this.ui.chartCanvas, {
      type: "line",
      data: {
        labels: prices.map((_, index) => index + 1),
        datasets: [
          {
            label: `${name} 7d`,
            data: prices,
            borderColor: "#e56b3c",
            backgroundColor: "rgba(229, 107, 60, 0.2)",
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });
  }

  startAutoRefresh() {
    setInterval(() => this.fetchAndRender(), REFRESH_INTERVAL);
  }

  initReveal() {
    const elements = document.querySelectorAll("[data-reveal]");
    elements.forEach((el) => el.classList.add("reveal"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.2 }
    );
    elements.forEach((el) => observer.observe(el));
  }

  initScrollTop() {
    const button = document.querySelector("[data-scroll-top]");
    if (!button) return;
    window.addEventListener("scroll", () => {
      button.classList.toggle("show", window.scrollY > 400);
    });
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }
}

new App().init();
