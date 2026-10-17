/* Trekiva Notify storefront script. Vanilla JS, no dependencies, no secrets.
 * DOM is built with textContent only (never innerHTML) so merchant copy cannot inject markup.
 * Works on product pages (selected variant), and on collection/search/home product cards. */
(function () {
  "use strict";
  if (window.TrekivaNotify) return;

  var cfgNode = document.getElementById("trekiva-notify-config");
  if (!cfgNode) return;
  var boot;
  try { boot = JSON.parse(cfgNode.textContent); } catch (e) { return; }
  if (boot.designMode) return;

  var rootEl = document.documentElement;
  var base = boot.proxyBase || "/apps/notify";
  var pageType = boot.pageType || "";
  var extraHide = (boot.hideSelectors || "").trim();
  var customCard = (boot.cardSelector || "").trim();
  var hideEnabled = boot.hide !== false;
  var EARLY_ID = "trekiva-notify-early";

  /* The theme embed hides the purchase buttons before first paint for a sold-out variant. Once this
   * script owns the buttons (or decides not to touch them) that early style has to go. */
  function releaseEarly() {
    var n = document.getElementById(EARLY_ID);
    if (n) n.remove();
  }

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
    rootEl.style.setProperty("--tn-fg", b.textColor);
    rootEl.style.setProperty("--tn-bg", b.background);
    rootEl.style.setProperty("--tn-radius", b.borderRadius + "px");
    rootEl.style.setProperty("--tn-sub", b.subtextColor);
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

    // Honeypot: invisible to people, tempting to bots. Its name is deliberately not one a browser
    // recognises ("website", "phone", ...): autofill would otherwise fill it along with the email and
    // the signup would be thrown away as spam.
    var hpWrap = el("div", "tn-hp");
    hpWrap.setAttribute("aria-hidden", "true");
    var hp = el("input");
    hp.type = "text";
    hp.name = "tn_trap";
    hp.tabIndex = -1;
    hp.autocomplete = "off";
    hp.setAttribute("data-lpignore", "true");
    hp.setAttribute("data-1p-ignore", "true");
    hp.setAttribute("data-form-type", "other");
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
          tnTrap: hp.value,
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
  var customHideReady = false;

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

  function variantById(id) {
    return productData.variants.filter(function (v) { return String(v.id) === id; })[0];
  }

  /* One rule per merchant selector: a single bad selector then only loses itself, not the others. */
  function ensureCustomHide() {
    if (customHideReady || !extraHide) return;
    customHideReady = true;
    var style = document.createElement("style");
    document.head.appendChild(style);
    extraHide.split(",").forEach(function (sel) {
      sel = sel.trim();
      if (!sel) return;
      ["html[data-tn-soldout] ", "form[data-tn-soldout] "].forEach(function (scope) {
        try { style.sheet.insertRule(scope + sel + " { display: none !important; }", style.sheet.cssRules.length); } catch (e) { /* invalid selector: skipped */ }
      });
    });
  }

  function setSoldOutMode(on) {
    if (on && hideEnabled) {
      ensureCustomHide();
      rootEl.setAttribute("data-tn-soldout", "");
    } else {
      rootEl.removeAttribute("data-tn-soldout");
    }
  }

  function renderProduct() {
    var form = productForm();
    if (!form) return;
    var id = selectedVariantId(form);
    var variant = variantById(id);

    var existing = document.querySelector("[data-trekiva-notify-button]");
    if (existing) existing.remove();

    if (!variant || variant.available) {
      setSoldOutMode(false);
      return;
    }

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
    setSoldOutMode(true);
  }

  /* Re-renders only when the selection (or the theme re-drawing the form) makes it necessary. */
  function checkVariant() {
    var form = productForm();
    if (!form) return;
    var id = selectedVariantId(form);
    var variant = variantById(id);
    var soldOut = !!variant && !variant.available;
    var hasButton = !!document.querySelector("[data-trekiva-notify-button]");
    if (id !== currentVariant || soldOut !== hasButton) {
      currentVariant = id;
      renderProduct();
    }
  }

  function startProductPage() {
    var node = document.getElementById("trekiva-notify-product");
    if (!node) { releaseEarly(); return; }
    try { productData = JSON.parse(node.textContent); } catch (e) { releaseEarly(); return; }
    if (!ruleAllows(productData)) { releaseEarly(); return; }

    renderProduct();
    // Our own state (data-tn-soldout, the button) now covers the buttons: the early style is not needed.
    releaseEarly();

    // Themes change the selected variant by setting the hidden id input, often without a DOM event. So
    // react to the events that do exist (form changes, the URL changing) and keep a fast poll as backup.
    document.addEventListener("change", function () { window.setTimeout(checkVariant, 0); }, true);
    ["pushState", "replaceState"].forEach(function (m) {
      var original = window.history[m];
      window.history[m] = function () {
        var result = original.apply(this, arguments);
        window.setTimeout(checkVariant, 0);
        return result;
      };
    });
    window.addEventListener("popstate", checkVariant);
    window.setInterval(checkVariant, 150);
  }

  /* ---------- cards (collection, search, home) ---------- */
  var productNow = {}; // handle -> product, once loaded: lets a drawer render in the same tick it appears

  function fetchProduct(handle) {
    if (!cardCache[handle]) {
      cardCache[handle] = fetch("/products/" + encodeURIComponent(handle) + ".js", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (p) { if (p) productNow[handle] = p; return p; })
        .catch(function () { return null; });
    }
    return cardCache[handle];
  }

  /* The block of a card that holds its text (title, price, swatches). The button goes at the end of that
   * block so it flows under the swatches. Appended to the card itself, a theme's grid or absolutely
   * positioned layout can drop it on top of the title. */
  function infoBlockOf(card) {
    var links = card.querySelectorAll('a[href*="/products/"]');
    for (var i = 0; i < links.length; i++) {
      if (!links[i].textContent.trim()) continue; // an image link has no text; the title link does
      var node = links[i];
      while (node.parentElement && node.parentElement !== card) node = node.parentElement;
      return node === links[i] ? card : node;
    }
    return card;
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
        infoBlockOf(card).appendChild(buildButton({ productId: String(p.id), variants: variants, pageType: pageKey() === "home" ? "index" : pageKey() }, { card: true }));
      });
    });
  }

  /* ---------- quick-buy drawers and popups (collection, search, home) ---------- */
  // Themes open a drawer with a variant picker and an Add to cart form when a card is clicked. Each such
  // form gets what the product page gets: while the picked variant is sold out, the purchase buttons in
  // that form are replaced by Notify me.
  var lastCard = null; // { handle, at }: the product whose card was clicked last
  var quickForms = []; // { form, product, current }
  var quickTimer = null;

  function handleOfLink(root) {
    var a = root && root.querySelector && root.querySelector('a[href*="/products/"]');
    var m = a && /\/products\/([^/?#]+)/.exec(a.getAttribute("href") || "");
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* Which product a drawer's form belongs to: what the theme says, a product link in the drawer, or the card that was just clicked. */
  function handleForForm(form) {
    var tagged = form.closest("[data-product-handle]");
    if (tagged && tagged.getAttribute("data-product-handle")) return tagged.getAttribute("data-product-handle");
    var url = form.getAttribute("data-product-url") || form.getAttribute("data-product-handle");
    if (url) { var m = /\/products\/([^/?#]+)/.exec(url); return m ? m[1] : url; }
    var shell = form.closest('dialog, [role="dialog"], [aria-modal="true"], [class*="drawer"], [class*="modal"], [class*="quick"]');
    var fromShell = handleOfLink(shell);
    if (fromShell) return fromShell;
    if (lastCard && Date.now() - lastCard.at < 15000) return lastCard.handle;
    return null;
  }

  function quickVariantId(q) {
    var input = q.form.querySelector('[name="id"]');
    return input ? String(input.value) : "";
  }

  function visible(el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }

  function renderQuick(q) {
    var id = quickVariantId(q);
    var variant = q.product.variants.filter(function (v) { return String(v.id) === id; })[0];
    var existing = q.form.querySelector("[data-trekiva-notify-button]");
    if (existing) existing.remove();

    if (!variant || variant.available) {
      q.form.removeAttribute("data-tn-soldout");
      return;
    }

    var others = q.product.variants.some(function (v) { return v.available; });
    var wrap = buildButton(
      { productId: String(q.product.id), variants: [{ id: variant.id, title: variant.title }], pageType: pageKey() === "home" ? "index" : pageKey() },
      { subtext: others ? cfg.button.mixedSubtext : "" },
    );
    var submit = q.form.querySelector('[type="submit"]');
    var target = (submit && submit.parentElement) || q.form;
    if (target === q.form) q.form.appendChild(wrap);
    else target.insertAdjacentElement("afterend", wrap);
    ensureCustomHide();
    if (hideEnabled) q.form.setAttribute("data-tn-soldout", "");
  }

  function tickQuickForms() {
    quickForms = quickForms.filter(function (q) { return q.form.isConnected; });
    quickForms.forEach(function (q) {
      if (!visible(q.form)) return; // a drawer that is closed costs nothing
      var id = quickVariantId(q);
      var variant = q.product.variants.filter(function (v) { return String(v.id) === id; })[0];
      var soldOut = !!variant && !variant.available;
      var hasButton = !!q.form.querySelector("[data-trekiva-notify-button]");
      if (id !== q.current || soldOut !== hasButton) {
        q.current = id;
        renderQuick(q);
      }
    });
    if (quickForms.length === 0) { window.clearInterval(quickTimer); quickTimer = null; }
  }

  function attachQuickForm(form, p) {
    if (!p || !form.isConnected || !ruleAllows({ id: p.id, tags: p.tags, collections: null })) return;
    var q = { form: form, product: p, current: null };
    quickForms.push(q);
    renderQuickNow(q);
    if (!quickTimer) quickTimer = window.setInterval(tickQuickForms, 120);
  }

  /* First render happens at once, before the next paint: the theme's own button never gets a moment on screen. */
  function renderQuickNow(q) {
    q.current = quickVariantId(q);
    renderQuick(q);
  }

  function scanQuickForms() {
    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    Array.prototype.forEach.call(forms, function (form) {
      if (form.hasAttribute("data-trekiva-notify-form") || !form.querySelector('[name="id"]')) return;
      if (pageType === "product" && form === productForm()) return; // the page's own form is handled by the product page code
      var handle = handleForForm(form);
      if (!handle) return; // not sure which product this is: better to leave the theme's button alone
      form.setAttribute("data-trekiva-notify-form", handle);
      if (productNow[handle]) attachQuickForm(form, productNow[handle]); // already loaded: no waiting at all
      else fetchProduct(handle).then(function (p) { attachQuickForm(form, p); });
    });
  }

  /* Cards (collection, search, home) and quick-buy drawers are switched on separately; one observer serves both. */
  function startListing(opts) {
    if (opts.cards) scanCards();
    if (opts.drawers) {
      scanQuickForms();
      // Remember which card was clicked: that is the product of the drawer that opens next.
      document.addEventListener("click", function (e) {
        var card = e.target.closest && e.target.closest(customCard || DEFAULT_CARD);
        var handle = handleOfLink(card);
        if (handle) {
          lastCard = { handle: handle, at: Date.now() };
          fetchProduct(handle); // start loading the variants now, while the drawer is still opening
        }
        // A variant pick changes the form a moment later: look again right after, not on the next poll.
        window.setTimeout(tickQuickForms, 40);
      }, true);
      document.addEventListener("change", function () { window.setTimeout(tickQuickForms, 0); }, true);
    }

    // Drawers are looked for on every change, without the delay the card scan uses.
    var timer = null;
    new MutationObserver(function () {
      if (opts.drawers) scanQuickForms();
      if (opts.cards) {
        window.clearTimeout(timer);
        timer = window.setTimeout(scanCards, 250);
      }
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

  /* ---------- settings: cached copy first, refreshed in the background ---------- */
  var CFG_KEY = "trekiva-notify:cfg";
  var CFG_MAX_AGE = 7 * 86400000;

  function readCachedCfg() {
    try {
      var raw = JSON.parse(window.localStorage.getItem(CFG_KEY));
      if (raw && raw.c && Date.now() - raw.t < CFG_MAX_AGE) return raw.c;
    } catch (e) { /* no cache */ }
    return null;
  }

  function fetchCfg() {
    return fetch(base + "/config", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) {
        if (c) {
          try { window.localStorage.setItem(CFG_KEY, JSON.stringify({ t: Date.now(), c: c })); } catch (e) { /* ignore */ }
        }
        return c;
      });
  }

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function start() {
    // With a cached copy there is nothing to wait for; the fresh copy is stored for the next page.
    // Without one (first visit) the settings have to be fetched first.
    var cached = readCachedCfg();
    var ready;
    if (cached) {
      fetchCfg().catch(function () { /* the cached copy keeps working */ });
      ready = Promise.resolve(cached);
    } else {
      ready = fetchCfg();
    }

    ready
      .then(function (c) {
        var key = pageKey();
        var showOn = (c && c.showOn) || [];
        var onPage = !!key && showOn.indexOf(key) !== -1;
        var onDrawers = showOn.indexOf("drawer") !== -1;
        if (!c || !c.enabled || (!onPage && !onDrawers)) { releaseEarly(); return; }
        cfg = c;
        applyTheme();
        onReady(function () {
          if (key === "product") {
            if (onPage) startProductPage(); else releaseEarly();
            if (onDrawers) startListing({ cards: false, drawers: true });
          } else if (key) {
            startListing({ cards: onPage, drawers: onDrawers });
          } else if (onDrawers) {
            startListing({ cards: false, drawers: true });
          }
        });
      })
      .catch(function () {
        // The storefront must never break, or lose its buttons, because the app is unreachable.
        releaseEarly();
      });
  }

  captureAttribution();
  window.TrekivaNotify = { refresh: refresh };
  start();
})();
