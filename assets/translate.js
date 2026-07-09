/* ====================================================================
   Traducción automática con Google Translate.
   - Botón de idioma en la cabecera (por defecto español).
   - Traducción in situ con aviso de carga y mensaje sin conexión.
   - Ventana emergente para valorar la calidad de la traducción.
   - Al volver al español se recarga la página sin traducir.
   ==================================================================== */
(function () {
  "use strict";

  var LANGS = [
    { code: "es", name: "Español", short: "ES", flag: "🇪🇸" },
    { code: "en", name: "English", short: "EN", flag: "🇬🇧" },
    { code: "fr", name: "Français", short: "FR", flag: "🇫🇷" },
    { code: "de", name: "Deutsch", short: "DE", flag: "🇩🇪" },
    { code: "ar", name: "العربية", short: "AR", flag: "🇸🇦", rtl: true },
    { code: "ary", name: "الدارجة المغربية", short: "DARIJA", flag: "🇲🇦", rtl: true },
    { code: "zh-CN", name: "中文 (简体)", short: "中文", flag: "🇨🇳" },
    { code: "ru", name: "Русский", short: "RU", flag: "🇷🇺" },
    { code: "ro", name: "Română", short: "RO", flag: "🇷🇴" }
  ];

  var INCLUDED = "en,fr,de,ar,ary,zh-CN,ru,ro";
  var scriptState = "idle"; // idle | loading | ready | error
  var scriptCallbacks = [];
  var LANG_STORAGE_KEY = "ltdi-site-lang";
  var refreshTimer = 0;
  var settleTimers = [];
  var chromeTimers = [];
  var contentObserver = null;
  var translationLockUntil = 0;

  /* --------------------------- Utilidades cookies -------------------- */
  function setCookie(name, value) {
    var host = location.hostname;
    document.cookie = name + "=" + value + ";path=/";
    if (host && host.indexOf(".") > -1) {
      document.cookie = name + "=" + value + ";path=/;domain=" + host;
      document.cookie = name + "=" + value + ";path=/;domain=." + host;
    }
  }

  function eraseCookie(name) {
    var expires = ";expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    var host = location.hostname;
    document.cookie = name + "=" + expires;
    if (host) {
      document.cookie = name + "=" + expires + ";domain=" + host;
      document.cookie = name + "=" + expires + ";domain=." + host;
    }
  }

  function rememberLang(code) {
    try {
      if (code && code !== "es") {
        localStorage.setItem(LANG_STORAGE_KEY, code);
      } else {
        localStorage.removeItem(LANG_STORAGE_KEY);
      }
    } catch (e) {}
  }

  function storedLangCode() {
    try {
      return localStorage.getItem(LANG_STORAGE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function langByCode(code) {
    for (var i = 0; i < LANGS.length; i += 1) {
      if (LANGS[i].code === code) {
        return LANGS[i];
      }
    }
    return LANGS[0];
  }

  function normalizeLangCode(code) {
    return langByCode(code || "es").code;
  }

  function cookieLangCode() {
    var match = document.cookie.match(/googtrans=\/[^/]+\/([^;]+)/);
    if (match && match[1]) {
      return normalizeLangCode(decodeURIComponent(match[1]));
    }
    return "es";
  }

  function currentLangCode() {
    var cookieCode = cookieLangCode();
    if (cookieCode !== "es") {
      rememberLang(cookieCode);
      return cookieCode;
    }

    var savedCode = normalizeLangCode(storedLangCode());
    if (savedCode !== "es") {
      setCookie("googtrans", "/es/" + savedCode);
      return savedCode;
    }

    return "es";
  }

  function syncDocumentLanguage(lang) {
    document.documentElement.setAttribute("dir", lang.rtl ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", lang.code);
  }

  function lockTranslation(ms) {
    translationLockUntil = Date.now() + ms;
  }

  function clearSettleTimers() {
    while (settleTimers.length) {
      window.clearTimeout(settleTimers.pop());
    }
  }

  function clearChromeTimers() {
    while (chromeTimers.length) {
      window.clearTimeout(chromeTimers.pop());
    }
  }

  function markNotranslate(node) {
    if (!node || node.nodeType !== 1) {
      return;
    }
    node.setAttribute("translate", "no");
    node.classList.add("notranslate");
  }

  function isAcademicTokenProtected(node) {
    var parent = node && node.parentElement;
    if (!parent) {
      return true;
    }
    return !!parent.closest(".notranslate, [translate='no'], script, style, noscript, textarea");
  }

  function wrapAcademicToken(textNode) {
    var value = textNode && textNode.nodeValue;
    var pattern = /1\.\s*º\s*ESO/g;
    if (!value || !pattern.test(value)) {
      return;
    }

    pattern.lastIndex = 0;
    var fragment = document.createDocumentFragment();
    var lastIndex = 0;

    value.replace(pattern, function (match, offset) {
      if (offset > lastIndex) {
        fragment.appendChild(document.createTextNode(value.slice(lastIndex, offset)));
      }

      var token = document.createElement("span");
      token.textContent = match;
      markNotranslate(token);
      fragment.appendChild(token);
      lastIndex = offset + match.length;
      return match;
    });

    if (lastIndex < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
    }

    if (textNode.parentNode) {
      textNode.parentNode.replaceChild(fragment, textNode);
    }
  }

  function protectAcademicTokens(root) {
    if (!root || !window.NodeFilter || !document.createTreeWalker) {
      return;
    }

    var pattern = /1\.\s*º\s*ESO/;
    var walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (!node.nodeValue || node.nodeValue.indexOf("ESO") === -1) {
            return NodeFilter.FILTER_REJECT;
          }
          if (isAcademicTokenProtected(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          return pattern.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    var nodes = [];
    var current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }

    nodes.forEach(wrapAcademicToken);
  }

  function protectLanguageUi(root) {
    if (!root) {
      return;
    }
    markNotranslate(root);
    markNotranslate(root.querySelector(".site-lang__btn"));
    markNotranslate(root.querySelector(".site-lang__current"));
    markNotranslate(root.querySelector(".site-lang__menu"));
    root.querySelectorAll(".site-lang__globe, .site-menu__caret").forEach(markNotranslate);
  }

  function isIgnoredMutation(node) {
    var element = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!element) {
      return false;
    }
    if (element.nodeName === "SCRIPT" || element.nodeName === "STYLE") {
      return true;
    }
    return !!element.closest(
      "#google_translate_element, .skiptranslate, .goog-te-banner-frame, .goog-te-menu-frame, [data-site-lang]"
    );
  }

  function hasRelevantAddedNode(nodes) {
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node.nodeType === 1 && !isIgnoredMutation(node)) {
        return true;
      }
      if (node.nodeType === 3 && /\S/.test(node.nodeValue || "") && !isIgnoredMutation(node)) {
        return true;
      }
    }
    return false;
  }

  function scheduleTranslationSettling(lang) {
    clearSettleTimers();
    [900, 2200].forEach(function (delay) {
      settleTimers.push(
        window.setTimeout(function () {
          if (scriptState === "ready" && currentLangCode() === lang.code) {
            applyTranslationSilently(lang);
          }
        }, delay)
      );
    });
    scheduleChromeCleanup();
  }

  function hideGoogleNode(node) {
    if (!node || node.nodeType !== 1) {
      return;
    }
    node.style.setProperty("display", "none", "important");
    node.style.setProperty("visibility", "hidden", "important");
    node.style.setProperty("height", "0px", "important");
    node.style.setProperty("min-height", "0px", "important");
    node.style.setProperty("max-height", "0px", "important");
    node.style.setProperty("opacity", "0", "important");
    node.style.setProperty("pointer-events", "none", "important");
  }

  function normalizeGoogleTranslateChrome() {
    document.documentElement.style.setProperty("top", "0px", "important");
    document.documentElement.style.setProperty("margin-top", "0px", "important");
    if (document.body) {
      document.body.style.setProperty("top", "0px", "important");
      document.body.style.setProperty("margin-top", "0px", "important");
    }

    [
      ".goog-te-banner-frame",
      "iframe.goog-te-banner-frame",
      ".VIpgJd-ZVi9od-ORHb-OEVmcd",
      "iframe.VIpgJd-ZVi9od-ORHb-OEVmcd",
      ".VIpgJd-ZVi9od-aZ2wEe-wOHMyf",
      "#goog-gt-tt",
      ".VIpgJd-yAWNEb-L7lbkb"
    ].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(hideGoogleNode);
    });
  }

  function scheduleChromeCleanup() {
    clearChromeTimers();
    [0, 150, 700, 1800, 3200].forEach(function (delay) {
      chromeTimers.push(
        window.setTimeout(function () {
          normalizeGoogleTranslateChrome();
        }, delay)
      );
    });
  }

  function scheduleTranslationRefresh() {
    if (Date.now() < translationLockUntil) {
      return;
    }
    normalizeGoogleTranslateChrome();
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(function () {
      var code = currentLangCode();
      if (scriptState === "ready" && code !== "es") {
        applyTranslationSilently(langByCode(code));
      }
    }, 650);
  }

  function watchTranslatedContent() {
    if (contentObserver || !window.MutationObserver || !document.body) {
      return;
    }

    contentObserver = new MutationObserver(function (mutations) {
      if (Date.now() < translationLockUntil) {
        return;
      }

      for (var i = 0; i < mutations.length; i += 1) {
        var mutation = mutations[i];
        if (mutation.type === "characterData") {
          if (!isIgnoredMutation(mutation.target) && /\S/.test(mutation.target.nodeValue || "")) {
            scheduleTranslationRefresh();
            return;
          }
          continue;
        }

        if (hasRelevantAddedNode(mutation.addedNodes)) {
          scheduleTranslationRefresh();
          return;
        }
      }
    });

    contentObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  /* --------------------------- Avisos (toast) ------------------------ */
  function toast(kind, html, autoHide) {
    var node = document.getElementById("site-translate-toast");
    if (!node) {
      node = document.createElement("div");
      node.id = "site-translate-toast";
      node.className = "site-translate-toast";
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      document.body.appendChild(node);
    }
    node.className = "site-translate-toast is-visible kind-" + kind;
    node.innerHTML =
      (kind === "loading"
        ? '<span class="site-translate-toast__spin" aria-hidden="true"></span>'
        : '<span class="site-translate-toast__icon" aria-hidden="true">' +
          (kind === "offline" ? "📡" : kind === "error" ? "⚠️" : "✓") +
          "</span>") +
      '<span class="site-translate-toast__text">' + html + "</span>";
    if (autoHide) {
      window.clearTimeout(node._t);
      node._t = window.setTimeout(hideToast, autoHide);
    }
  }

  function hideToast() {
    var node = document.getElementById("site-translate-toast");
    if (node) {
      node.classList.remove("is-visible");
    }
  }

  /* --------------------------- Popup de calidad ---------------------- */
  function qualityPopup(lang) {
    var back = document.createElement("div");
    back.className = "site-translate-modal";
    back.innerHTML =
      '<div class="site-translate-modal__card" role="dialog" aria-modal="true" aria-label="Valorar la traducción">' +
      '<button type="button" class="site-translate-modal__close" aria-label="Cerrar">×</button>' +
      '<span class="site-translate-modal__flag">' + lang.flag + "</span>" +
      "<h3>Página traducida al " + lang.name + "</h3>" +
      "<p>La traducción es automática (Google Translate) y puede contener errores. " +
      "¿Cómo valorarías su calidad?</p>" +
      '<div class="site-translate-modal__rate">' +
      '<button type="button" data-rate="buena">👍 Buena</button>' +
      '<button type="button" data-rate="regular">😐 Regular</button>' +
      '<button type="button" data-rate="mejorable">👎 Mejorable</button>' +
      "</div>" +
      '<p class="site-translate-modal__hint">Vuelve al <strong>Español</strong> en cualquier momento desde el botón de idioma.</p>' +
      "</div>";

    function close() {
      if (back.parentNode) {
        back.parentNode.removeChild(back);
      }
    }

    back.addEventListener("click", function (event) {
      if (event.target === back || event.target.closest(".site-translate-modal__close")) {
        close();
      }
      var rate = event.target.getAttribute && event.target.getAttribute("data-rate");
      if (rate) {
        try {
          localStorage.setItem("ltdi-translate-rating-" + lang.code, rate);
        } catch (e) {}
        toast("done", "¡Gracias por tu valoración!", 2200);
        close();
      }
    });

    document.body.appendChild(back);
  }

  /* --------------------------- Carga del script ---------------------- */
  window.googleTranslateElementInit = function () {
    /* eslint-disable no-undef */
    new google.translate.TranslateElement(
      { pageLanguage: "es", includedLanguages: INCLUDED, autoDisplay: false },
      "google_translate_element"
    );
    /* eslint-enable no-undef */
  };

  function ensureScript(onReady, onError) {
    if (scriptState === "ready") {
      onReady();
      return;
    }
    scriptCallbacks.push({ ok: onReady, err: onError });
    if (scriptState === "loading") {
      return;
    }
    scriptState = "loading";

    if (!document.getElementById("google_translate_element")) {
      var holder = document.createElement("div");
      holder.id = "google_translate_element";
      holder.setAttribute("aria-hidden", "true");
      document.body.appendChild(holder);
    }

    var script = document.createElement("script");
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;

    var failed = false;
    var timer = window.setTimeout(function () {
      if (scriptState !== "ready") {
        failed = true;
        finishScript(false);
      }
    }, 9000);

    // Espera a que el motor esté listo y el combo disponible.
    var poll = window.setInterval(function () {
      if (failed) {
        window.clearInterval(poll);
        return;
      }
      if (window.google && window.google.translate && document.querySelector(".goog-te-combo")) {
        window.clearInterval(poll);
        window.clearTimeout(timer);
        finishScript(true);
      }
    }, 250);

    script.onerror = function () {
      window.clearInterval(poll);
      window.clearTimeout(timer);
      finishScript(false);
    };

    document.body.appendChild(script);
  }

  function finishScript(ok) {
    scriptState = ok ? "ready" : "error";
    var callbacks = scriptCallbacks.slice();
    scriptCallbacks = [];
    callbacks.forEach(function (cb) {
      if (ok) {
        cb.ok();
      } else if (cb.err) {
        cb.err();
      }
    });
    if (!ok) {
      scriptState = "idle"; // permite reintentar en el siguiente clic
    }
  }

  /* --------------------------- Aplicar idioma ------------------------ */
  function applyTranslation(lang) {
    var combo = document.querySelector(".goog-te-combo");
    if (!combo) {
      toast("error", "No se pudo iniciar el traductor. Inténtalo de nuevo.", 4200);
      return;
    }
    lockTranslation(4500);
    combo.value = lang.code;
    combo.dispatchEvent(new Event("change"));

    syncDocumentLanguage(lang);

    var done = false;
    function ready() {
      if (done) {
        return;
      }
      done = true;
      hideToast();
      updateButton(lang);
      normalizeGoogleTranslateChrome();
      qualityPopup(lang);
      scheduleTranslationSettling(lang);
    }

    // Detecta cuando el <html> queda marcado como traducido.
    var observer = new MutationObserver(function () {
      if (/translated/.test(document.documentElement.className)) {
        observer.disconnect();
        window.setTimeout(ready, 400);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    window.setTimeout(function () {
      observer.disconnect();
      ready();
    }, 3500);
  }

  function selectLanguage(code) {
    var lang = langByCode(code);

    if (code === "es") {
      eraseCookie("googtrans");
      rememberLang("es");
      clearSettleTimers();
      toast("loading", "Restaurando el español…");
      window.setTimeout(function () {
        window.location.reload();
      }, 200);
      return;
    }

    if (!navigator.onLine) {
      toast(
        "offline",
        "Sin conexión a internet. La traducción automática de Google necesita conexión; vuelve a intentarlo cuando estés en línea.",
        6000
      );
      return;
    }

    rememberLang(code);
    setCookie("googtrans", "/es/" + code);
    updateButton(lang);
    syncDocumentLanguage(lang);
    toast("loading", "Traduciendo la página al " + lang.name + "… <em>esperando los textos traducidos</em>");

    ensureScript(
      function () {
        applyTranslation(lang);
      },
      function () {
        toast(
          "error",
          "No se ha podido contactar con Google Translate. Comprueba tu conexión a internet e inténtalo de nuevo.",
          6000
        );
      }
    );
  }

  /* --------------------------- Botón e interfaz ---------------------- */
  function updateButton(lang) {
    document.querySelectorAll("[data-site-lang]").forEach(function (root) {
      protectLanguageUi(root);
      var current = root.querySelector(".site-lang__current");
      if (current) {
        current.textContent = lang.short;
      }
      root.querySelectorAll(".site-lang__option").forEach(function (opt) {
        var active = opt.getAttribute("data-lang") === lang.code;
        opt.classList.toggle("is-active", active);
        if (active) {
          opt.setAttribute("aria-current", "true");
        } else {
          opt.removeAttribute("aria-current");
        }
      });
    });
  }

  function buildMenu(root) {
    var menu = root.querySelector(".site-lang__menu");
    if (!menu) {
      return;
    }
    protectLanguageUi(root);
    menu.innerHTML = "";
    LANGS.forEach(function (lang) {
      var option = document.createElement("button");
      option.type = "button";
      option.className = "site-lang__option";
      option.setAttribute("role", "menuitem");
      option.setAttribute("data-lang", lang.code);
      markNotranslate(option);
      option.innerHTML =
        '<span class="site-lang__flag" aria-hidden="true">' + lang.flag + "</span>" +
        "<span>" + lang.name + "</span>";
      option.addEventListener("click", function () {
        closeMenu(root);
        selectLanguage(lang.code);
      });
      menu.appendChild(option);
    });
  }

  function openMenu(root) {
    root.classList.add("is-open");
    var btn = root.querySelector(".site-lang__btn");
    if (btn) {
      btn.setAttribute("aria-expanded", "true");
    }
  }

  function closeMenu(root) {
    root.classList.remove("is-open");
    var btn = root.querySelector(".site-lang__btn");
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
    }
  }

  function wire(root) {
    protectLanguageUi(root);
    buildMenu(root);
    var btn = root.querySelector(".site-lang__btn");
    if (btn) {
      btn.addEventListener("click", function (event) {
        event.stopPropagation();
        if (root.classList.contains("is-open")) {
          closeMenu(root);
        } else {
          openMenu(root);
        }
      });
    }
  }

  document.addEventListener("click", function (event) {
    document.querySelectorAll("[data-site-lang].is-open").forEach(function (root) {
      if (!root.contains(event.target)) {
        closeMenu(root);
      }
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      document.querySelectorAll("[data-site-lang].is-open").forEach(closeMenu);
    }
  });

  window.addEventListener("DOMContentLoaded", function () {
    protectAcademicTokens(document.body);

    var roots = document.querySelectorAll("[data-site-lang]");
    if (!roots.length) {
      return;
    }
    roots.forEach(wire);
    watchTranslatedContent();
    normalizeGoogleTranslateChrome();

    // Si el usuario ya tenía un idioma activo (cookie), reflejarlo y reactivarlo.
    var active = currentLangCode();
    var lang = langByCode(active);
    updateButton(lang);
    syncDocumentLanguage(lang);
    if (active !== "es" && navigator.onLine) {
      ensureScript(function () {
        applyTranslationSilently(lang);
        scheduleTranslationSettling(lang);
      });
    }
  });

  function applyTranslationSilently(lang) {
    var combo = document.querySelector(".goog-te-combo");
    if (combo) {
      lockTranslation(4000);
      combo.value = lang.code;
      combo.dispatchEvent(new Event("change"));
    }
    updateButton(lang);
    syncDocumentLanguage(lang);
    scheduleChromeCleanup();
  }
})();
