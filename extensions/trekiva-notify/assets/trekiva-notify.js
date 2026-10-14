/* Trekiva Notify storefront script. Vanilla JS, no dependencies, no secrets.
 * DOM is built with textContent only (never innerHTML) so merchant copy cannot inject markup.
 * Works on product pages (selected variant), and on collection/search/home product cards. */
(function () {
  "use strict";
  if (window.TrekivaNotify) return;

  var root = document.getElementById("trekiva-notify-root");
  if (!root || root.getAttribute("data-design-mode") === "true") return;

  var base = root.getAttribute("data-proxy-base") || "/apps/notify";
  var pageType = root.getAttribute("data-page-type") || "";
  var extraHide = (root.getAttribute("data-hide-selectors") || "").trim();
  var customCard = (root.getAttribute("data-card-selector") || "").trim();

  var DEFAULT_HIDE =
    'form[action*="/cart/add"] [type="submit"], form[action*="/cart/add"] button[name="add"], ' +
    '.shopify-payment-button, [data-shopify="payment-button"]';
  var DEFAULT_CARD = ".card-wrapper, .product-card, .product-item, .grid-product, .grid__item, article, li";
  var STORAGE_KEY = "trekiva-notify:subscribed";

  var cfg = null;
  var productData = null;
  var modal = null; // { overlay, previousFocus }
  var cardCache = {}; // handle -> Promise<product>

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function readSubscribed() {
    try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); } catch (e) { return []; }
  }
  function rememberSubscribed(variantId) {
    try {
      var list = readSubscribed();
      if (list.indexOf(String(variantId)) === -1) list.push(String(variantId));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-200)));
    } catch (e) { /* storage blocked: the button just will not remember */ }
  }
  function isSubscribed(variantId) { return readSubscribed().indexOf(String(variantId)) !== -1; }

  function applyTheme() {
    var b = cfg.button;
    root.style.setProperty("--tn-fg", b.textColor);
    root.style.setProperty("--tn-bg", b.background);
    root.style.setProperty("--tn-radius", b.borderRadius + "px");
    root.style.setProperty("--tn-sub", b.subtextColor);
  }

  /* ---------- display rules ---------- */
  function pageKey() {
    if (pageType === "product") return "product";
    if (pageType === "collection" || pageType === "list-collections") return "collection";
    if (pageType === "search") return "search";
    if (pageType === "index") return "home";
    return "";
  }

  function lower(list) { return (list || []).map(function (t) { return String(t).toLowerCase(); }); }
  function intersects(a, b) { return lower(a).some(function (t) { return lower(b).indexOf(t) !== -1; }); }

  /* product: { id, tags, collections|null }. Collection membership is only known on the product page,
   * so a COLLECTIONS rule never matches a card. */
  function ruleAllows(product) {
    var rule = cfg.productRule || { mode: "ALL" };
    var ids = (rule.ids || []).map(String);
    var id = String(product.id);
    switch (rule.mode) {
      case "EXCLUDE_PRODUCTS": return ids.indexOf(id) === -1;
      case "EXCLUDE_TAGS": return !intersects(product.tags, rule.tags);
      case "SPECIFIC": return ids.indexOf(id) !== -1;
      case "COLLECTIONS":
        return !!product.collections && product.collections.some(function (c) { return ids.indexOf(String(c)) !== -1; });
      case "TAGS": return intersects(product.tags, rule.tags);
      default: return true;
    }
  }

  /* ---------- modal ---------- */
  function closeModal() {
    if (!modal) return;
    document.removeEventListener("keydown", onKey, true);
    modal.overlay.remove();
    if (modal.previousFocus && modal.previousFocus.focus) modal.previousFocus.focus();
    modal = null;
  }
  function onKey(e) { if (e.key === "Escape") closeModal(); }

  /* ctx: { productId, variants: [{id,title}] (sold-out choices), pageType } */
  function openModal(ctx, opener) {
    if (modal) return;
    var f = cfg.form;
    var overlay = el("div", "tn-overlay");
    var box = el("div", "tn-modal");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", f.header);

    var close = el("button", "tn-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", closeModal);

    box.appendChild(close);
    box.appendChild(el("h2", "tn-head", f.header));
    box.appendChild(el("p", "tn-desc", f.description));

    var form = el("form");
    form.noValidate = true;

    var select = null;
    var single = ctx.variants.length === 1 ? ctx.variants[0] : null;
    if (single && single.title && single.title !== "Default Title") {
      var label = el("div", "tn-field tn-variant", single.title);
      form.appendChild(label);
    } else if (ctx.variants.length > 1) {
      select = el("select", "tn-field");
      ctx.variants.forEach(function (v) {
        var o = el("option", null, v.title);
        o.value = String(v.id);
        select.appendChild(o);
      });
      form.appendChild(select);
    }

    var email = el("input", "tn-field");
    email.type = "email";
    email.name = "email";
    email.placeholder = f.emailPlaceholder;
    email.autocomplete = "email";
    email.required = true;
    email.setAttribute("aria-label", f.emailPlaceholder);
    form.appendChild(email);

    var error = el("p", "tn-error");
    error.setAttribute("role", "alert");
    error.hidden = true;
    form.appendChild(error);

    // Honeypot: invisible to people, tempting to bots.
    var hpWrap = el("div", "tn-hp");
    hpWrap.setAttribute("aria-hidden", "true");
    var hp = el("input");
    hp.type = "text";
    hp.name = "website";
    hp.tabIndex = -1;
    hp.autocomplete = "off";
    hpWrap.appendChild(hp);
    form.appendChild(hpWrap);

    var optIn = null;
    if (f.marketingOptIn) {
      var row = el("label", "tn-check");
      optIn = el("input");
      optIn.type = "checkbox";
      row.appendChild(optIn);
      row.appendChild(el("span", null, f.marketingLabel));
      form.appendChild(row);
    }

    var submit = el("button", "tn-btn", f.buttonText);
    submit.type = "submit";
    form.appendChild(submit);
    form.appendChild(el("p", "tn-terms", f.terms));
    box.appendChild(form);
    overlay.appendChild(box);

    function showError(message) {
      error.textContent = message;
      error.hidden = false;
    }

    function showDone(message) {
      box.textContent = "";
      var done = el("div", "tn-done");
      if (!message) done.appendChild(el("h2", null, f.confirmHeader));
      done.appendChild(el("p", null, message || f.confirmDescription));
      box.appendChild(close);
      box.appendChild(done);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      error.hidden = true;
      var value = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) { showError(f.emailError); email.focus(); return; }

      var variantId = select ? select.value : String((single || ctx.variants[0]).id);
      submit.disabled = true;
      fetch(base + "/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: ctx.productId,
          variantId: variantId,
          email: value,
          pageType: ctx.pageType,
          marketingOptIn: optIn ? optIn.checked : false,
          website: hp.value,
        }),
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
        })
        .then(function (r) {
          var status = r.data && r.data.status;
          if (status === "subscribed" || status === "already") {
            rememberSubscribed(variantId);
            showDone();
            refresh();
          } else if (status === "available") {
            showDone("Good news: this item is back in stock. Reload the page to buy it.");
          } else if (status === "invalid_email") {
            submit.disabled = false;
            showError(f.emailError);
          } else {
            submit.disabled = false;
            showError((r.data && r.data.message) || "Something went wrong. Please try again.");
          }
        })
        .catch(function () {
          submit.disabled = false;
          showError("Something went wrong. Please try again.");
        });
    });

    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(overlay);
    modal = { overlay: overlay, previousFocus: opener || document.activeElement };
    email.focus();
  }

  /* ---------- button ---------- */
  function buildButton(ctx, opts) {
    var wrap = el("div", "tn-wrap" + (opts.card ? " tn-wrap--card" : ""));
    wrap.setAttribute("data-trekiva-notify-button", "");
    var btn = el("button", "tn-btn", cfg.button.text);
    btn.type = "button";
    var firstId = ctx.variants[0] && ctx.variants[0].id;
    if (ctx.variants.length === 1 && isSubscribed(firstId)) {
      btn.textContent = "You'll be notified";
      btn.disabled = true;
    } else {
      btn.addEventListener("click", function () { openModal(ctx, btn); });
    }
    wrap.appendChild(btn);
    if (opts.subtext) wrap.appendChild(el("p", "tn-sub", opts.subtext));
    return wrap;
  }

  /* ---------- product page ---------- */
  var currentVariant = null;
  var hiddenEls = [];

  function productForm() {
    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    for (var i = 0; i < forms.length; i++) if (forms[i].querySelector('[name="id"]')) return forms[i];
    return null;
  }

  function selectedVariantId(form) {
    var input = form && form.querySelector('[name="id"]');
    var fromUrl = new URLSearchParams(window.location.search).get("variant");
    return String((input && input.value) || fromUrl || (productData.variants[0] && productData.variants[0].id));
  }

  function setPurchaseButtonsHidden(hide) {
    hiddenEls.forEach(function (n) { n.removeAttribute("data-trekiva-hidden"); });
    hiddenEls = [];
    if (!hide) return;
    var selector = extraHide ? DEFAULT_HIDE + ", " + extraHide : DEFAULT_HIDE;
    var nodes;
    try { nodes = document.querySelectorAll(selector); } catch (e) { return; } // a bad merchant selector must not break the page
    Array.prototype.forEach.call(nodes, function (n) {
      if (n.closest("[data-trekiva-notify-button]")) return;
      n.setAttribute("data-trekiva-hidden", "");
      hiddenEls.push(n);
    });
  }

  function renderProduct() {
    var form = productForm();
    if (!form) return;
    var id = selectedVariantId(form);
    var variant = productData.variants.filter(function (v) { return String(v.id) === id; })[0];

    var existing = document.querySelector("[data-trekiva-notify-button]");
    if (existing) existing.remove();
    setPurchaseButtonsHidden(false);

    if (!variant || variant.available) return;

    var othersAvailable = productData.variants.some(function (v) { return v.available; });
    var wrap = buildButton(
      { productId: String(productData.id), variants: [{ id: variant.id, title: variant.title }], pageType: "product" },
      { subtext: othersAvailable ? cfg.button.mixedSubtext : "" },
    );

    var anchor = document.querySelector("[data-trekiva-notify-anchor]");
    if (anchor) {
      anchor.appendChild(wrap);
    } else {
      var submit = form.querySelector('[type="submit"]');
      var target = form.querySelector(".product-form__buttons") || (submit && submit.parentElement) || form;
      if (target === form) form.appendChild(wrap);
      else target.insertAdjacentElement("afterend", wrap);
    }
    if (cfg.hidePurchaseButtons) setPurchaseButtonsHidden(true);
  }

  function startProductPage() {
    var node = document.getElementById("trekiva-notify-product");
    if (!node) return;
    try { productData = JSON.parse(node.textContent); } catch (e) { return; }
    if (!ruleAllows(productData)) return;

    // Themes change the selected variant by setting the hidden id input without firing a reliable
    // DOM event, so the selection is polled: cheap, and independent of the theme.
    renderProduct();
    window.setInterval(function () {
      var id = selectedVariantId(productForm());
      var needsButton = !document.querySelector("[data-trekiva-notify-button]");
      var variant = productData.variants.filter(function (v) { return String(v.id) === id; })[0];
      if (id !== currentVariant || (variant && !variant.available && needsButton)) {
        currentVariant = id;
        renderProduct();
      }
    }, 400);
  }

  /* ---------- cards (collection, search, home) ---------- */
  function fetchProduct(handle) {
    if (!cardCache[handle]) {
      cardCache[handle] = fetch("/products/" + encodeURIComponent(handle) + ".js", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return cardCache[handle];
  }

  function scanCards() {
    var cardSelector = customCard || DEFAULT_CARD;
    var links = document.querySelectorAll('a[href*="/products/"]');
    Array.prototype.forEach.call(links, function (a) {
      var m = /\/products\/([^/?#]+)/.exec(a.getAttribute("href") || "");
      if (!m) return;
      var card = a.closest(cardSelector);
      if (!card || card.hasAttribute("data-trekiva-notify-card")) return;
      card.setAttribute("data-trekiva-notify-card", m[1]);

      fetchProduct(m[1]).then(function (p) {
        if (!p || !card.isConnected) return;
        // Cards only offer the button for fully sold-out products; a partly sold-out product is
        // handled on its own page where the customer has picked a variant.
        if (p.available !== false || !ruleAllows({ id: p.id, tags: p.tags, collections: null })) return;
        if (card.querySelector("[data-trekiva-notify-button]")) return;
        var variants = p.variants.map(function (v) { return { id: v.id, title: v.title }; });
        card.appendChild(buildButton({ productId: String(p.id), variants: variants, pageType: pageKey() === "home" ? "index" : pageKey() }, { card: true }));
      });
    });
  }

  function startCards() {
    scanCards();
    var timer = null;
    new MutationObserver(function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(scanCards, 300);
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- attribution ---------- */
  // A customer who lands from a restock email carries ?notify=<id>. It is copied onto the cart so
  // the paid order can be traced back to the email (revenue converted).
  function captureAttribution() {
    var id = new URLSearchParams(window.location.search).get("notify");
    if (!id || !/^[a-z0-9]{20,40}$/i.test(id)) return;
    try {
      if (window.sessionStorage.getItem("trekiva-notify:attr") === id) return;
      window.sessionStorage.setItem("trekiva-notify:attr", id);
    } catch (e) { /* storage blocked: attribute is simply set again on the next page */ }
    fetch("/cart/update.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attributes: { trekiva_notify: id } }),
    }).catch(function () { /* attribution is best effort */ });
  }

  /* ---------- boot ---------- */
  function refresh() {
    // After a signup the product-page button flips to "You'll be notified"; cards re-render the same way.
    var buttons = document.querySelectorAll("[data-trekiva-notify-button]");
    Array.prototype.forEach.call(buttons, function (b) { b.remove(); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-trekiva-notify-card]"), function (c) {
      c.removeAttribute("data-trekiva-notify-card");
    });
    if (productData) renderProduct();
    else scanCards();
  }

  function loadCss() {
    return new Promise(function (resolve) {
      var href = root.getAttribute("data-css");
      if (!href) return resolve();
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = link.onerror = function () { resolve(); };
      document.head.appendChild(link);
      window.setTimeout(resolve, 3000);
    });
  }

  function start() {
    fetch(base + "/config", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) {
        if (!c || !c.enabled) return;
        var key = pageKey();
        if (!key || (c.showOn || []).indexOf(key) === -1) return;
        cfg = c;
        applyTheme();
        return loadCss().then(function () {
          if (key === "product") startProductPage();
          else startCards();
        });
      })
      .catch(function () { /* the storefront must never break because the app is unreachable */ });
  }

  captureAttribution();
  window.TrekivaNotify = { refresh: refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
