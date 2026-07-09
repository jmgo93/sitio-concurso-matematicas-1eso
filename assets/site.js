(function () {
  "use strict";

  var NAV = window.SITE_NAV;
  if (!NAV || !Array.isArray(NAV.pages)) {
    return;
  }

  var pages = NAV.pages.slice().sort(function (a, b) {
    return a.order - b.order;
  });

  var pageById = {};
  pages.forEach(function (page) {
    pageById[page.id] = page;
  });

  // Metadatos de navegación (data-driven desde el navigation.js de cada proyecto).
  var groupOrder = NAV.groupOrder || [
    "Presentación",
    "Contexto",
    "Teoría",
    "Laboratorio",
    "Ejercicios",
    "Evaluación",
    "Material docente"
  ];

  // Etiquetas cortas para la barra superior
  var navLabels = NAV.navLabels || {
    "Presentación": "Inicio",
    "Material docente": "Docentes"
  };

  // Subgrupos que no aportan un título útil en los menús
  var subgroupExcluded = {
    "General": true,
    "Proyecto": true,
    "Práctica": true,
    "Seguimiento": true,
    "Diseño": true,
    "Núcleo": true,
    "Bloques conceptuales": true
  };

  var sectionDescriptions = NAV.sectionDescriptions || {
    "Presentación": "Portada y entrada general al proyecto.",
    "Contexto": "Misión, hoja de ruta y marco social del itinerario.",
    "Teoría": "Contenidos conceptuales y materiales de repaso.",
    "Laboratorio": "Juegos matemáticos y experiencias interactivas.",
    "Ejercicios": "Práctica guiada, problemas y consolidación.",
    "Evaluación": "Tests y simulación de examen en modo local.",
    "Material docente": "Documentación pedagógica para su implementación."
  };

  // Estructura anidada grupo > subgrupo (respetando el orden de páginas)
  var grouped = {};
  pages.forEach(function (page) {
    if (!grouped[page.group]) {
      grouped[page.group] = {};
    }
    if (!grouped[page.group][page.subgroup]) {
      grouped[page.group][page.subgroup] = [];
    }
    grouped[page.group][page.subgroup].push(page);
  });

  function pagesInGroup(name) {
    var out = [];
    var subs = grouped[name] || {};
    Object.keys(subs).forEach(function (sub) {
      out = out.concat(subs[sub]);
    });
    return out;
  }

  function normalizePath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .replace(/^[a-z]+:\/\/[^/]+/i, "")
      .replace(/\/+/g, "/")
      .replace(/^\/+/, "");
  }

  function resolve(root, path) {
    return (root || "") + path;
  }

  function getCurrentPage() {
    var current = normalizePath(window.location.pathname);
    for (var i = 0; i < pages.length; i += 1) {
      if (current.endsWith(pages[i].path)) {
        return pages[i];
      }
    }
    return null;
  }

  var CARET = '<svg class="site-menu__caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';

  /* ---------------------------------------------------------------
     Menú principal de la barra superior
     --------------------------------------------------------------- */
  function buildMenu(nav, root, currentPage) {
    var currentGroup = currentPage ? currentPage.group : null;
    var list = document.createElement("ul");
    list.className = "site-menu";

    groupOrder.forEach(function (group) {
      var groupPages = pagesInGroup(group);
      if (!groupPages.length) {
        return;
      }

      var item = document.createElement("li");
      item.className = "site-menu__item tone-" + (groupPages[0].tone || "mediterraneo");
      if (group === currentGroup) {
        item.classList.add("is-active");
      }

      var label = navLabels[group] || group;

      if (groupPages.length === 1) {
        var link = document.createElement("a");
        link.className = "site-menu__link";
        link.href = resolve(root, groupPages[0].path);
        link.textContent = label;
        if (currentPage && currentPage.id === groupPages[0].id) {
          link.setAttribute("aria-current", "page");
        }
        item.appendChild(link);
      } else {
        item.classList.add("has-panel");

        var toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "site-menu__link site-menu__toggle";
        toggle.setAttribute("aria-expanded", "false");
        toggle.innerHTML = label + CARET;
        item.appendChild(toggle);

        var panel = document.createElement("div");
        panel.className = "site-menu__panel";

        var subs = grouped[group];
        var subKeys = Object.keys(subs);
        var showSubheads = subKeys.length > 1 || subKeys.some(function (key) {
          return !subgroupExcluded[key];
        });
        if (subKeys.length > 2) {
          panel.classList.add("site-menu__panel--mega");
        }

        subKeys.forEach(function (sub) {
          var column = document.createElement("div");
          var colTone = (subs[sub][0] && subs[sub][0].tone) || "mediterraneo";
          column.className = "site-menu__col tone-" + colTone;

          if (showSubheads && !subgroupExcluded[sub]) {
            var head = document.createElement("p");
            head.className = "site-menu__colhead";
            head.textContent = sub;
            column.appendChild(head);
          }

          subs[sub].forEach(function (page) {
            var pageLink = document.createElement("a");
            pageLink.className = "site-menu__panellink";
            pageLink.href = resolve(root, page.path);
            pageLink.textContent = page.label;
            if (currentPage && currentPage.id === page.id) {
              pageLink.setAttribute("aria-current", "page");
            }
            column.appendChild(pageLink);
          });

          panel.appendChild(column);
        });

        item.appendChild(panel);
      }

      list.appendChild(item);
    });

    appendMobileUtilityLinks(list);
    nav.innerHTML = "";
    nav.appendChild(list);
    wireDropdowns(nav);
  }

  function appendMobileUtilityLinks(list) {
    var header = document.querySelector(".site-nav");
    if (!header) {
      return;
    }

    [
      { selector: ".site-nav__switch", label: "Proyectos" },
      { selector: ".site-nav__award", label: "Buena Práctica" }
    ].forEach(function (entry) {
      var source = header.querySelector(entry.selector);
      if (!source || !source.href) {
        return;
      }

      var item = document.createElement("li");
      item.className = "site-menu__item site-menu__item--utility";

      var link = document.createElement("a");
      link.className = "site-menu__utilitylink";
      link.href = source.href;
      link.textContent = source.textContent.trim() || entry.label;

      item.appendChild(link);
      list.appendChild(item);
    });
  }

  function closePanels(nav) {
    var open = nav.querySelectorAll(".site-menu__item.is-open");
    for (var i = 0; i < open.length; i += 1) {
      open[i].classList.remove("is-open");
      var toggle = open[i].querySelector(".site-menu__toggle");
      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
      }
    }
  }

  function wireDropdowns(nav) {
    var toggles = nav.querySelectorAll(".site-menu__toggle");
    for (var i = 0; i < toggles.length; i += 1) {
      toggles[i].addEventListener("click", function (event) {
        event.preventDefault();
        var item = this.parentNode;
        var wasOpen = item.classList.contains("is-open");
        closePanels(nav);
        if (!wasOpen) {
          item.classList.add("is-open");
          this.setAttribute("aria-expanded", "true");
        }
      });
    }

    document.addEventListener("click", function (event) {
      if (!nav.contains(event.target)) {
        closePanels(nav);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closePanels(nav);
      }
    });
  }

  function wireBurger(header, nav) {
    var burger = header.querySelector(".site-nav__burger");
    if (!burger) {
      return;
    }

    burger.addEventListener("click", function () {
      var open = header.classList.toggle("is-menu-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle("has-open-menu", open);
      if (!open) {
        closePanels(nav);
      }
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest && event.target.closest("a")) {
        header.classList.remove("is-menu-open");
        burger.setAttribute("aria-expanded", "false");
        document.body.classList.remove("has-open-menu");
      }
    });
  }

  /* ---------------------------------------------------------------
     Migas de pan + anterior/siguiente
     --------------------------------------------------------------- */
  function buildSubbar(root, currentPage) {
    if (!currentPage) {
      return;
    }

    var breadcrumb = document.querySelector(".site-breadcrumb");
    if (breadcrumb) {
      var trail = [{ label: "Inicio", href: resolve(root, "index.html") }];
      var lead = pagesInGroup(currentPage.group)[0];
      var groupLabel = navLabels[currentPage.group] || currentPage.group;
      if (lead && lead.id !== currentPage.id) {
        trail.push({ label: groupLabel, href: resolve(root, lead.path) });
      } else if (lead && lead.id === currentPage.id && currentPage.group !== "Presentación") {
        trail.push({ label: groupLabel });
      }
      if (currentPage.group === "Laboratorio" && currentPage.subgroup && !subgroupExcluded[currentPage.subgroup]) {
        trail.push({ label: currentPage.subgroup });
      }
      trail.push({ label: currentPage.label });

      breadcrumb.innerHTML = "";
      trail.forEach(function (node, index) {
        if (index > 0) {
          var sep = document.createElement("span");
          sep.className = "site-breadcrumb__sep";
          sep.textContent = "›";
          breadcrumb.appendChild(sep);
        }
        if (node.href && index < trail.length - 1) {
          var a = document.createElement("a");
          a.href = node.href;
          a.textContent = node.label;
          breadcrumb.appendChild(a);
        } else {
          var span = document.createElement("span");
          span.textContent = node.label;
          if (index === trail.length - 1) {
            span.setAttribute("aria-current", "page");
          }
          breadcrumb.appendChild(span);
        }
      });
    }

    var pager = document.querySelector(".site-pager");
    if (pager) {
      var index = -1;
      for (var i = 0; i < pages.length; i += 1) {
        if (pages[i].id === currentPage.id) {
          index = i;
          break;
        }
      }
      var previous = index > 0 ? pages[index - 1] : null;
      var next = index >= 0 && index < pages.length - 1 ? pages[index + 1] : null;

      pager.innerHTML = "";
      if (previous) {
        var prevLink = document.createElement("a");
        prevLink.className = "site-pager__link";
        prevLink.href = resolve(root, previous.path);
        prevLink.innerHTML = '<span aria-hidden="true">‹</span> ' + previous.label;
        prevLink.title = "Anterior: " + previous.label;
        pager.appendChild(prevLink);
      }
      if (next) {
        var nextLink = document.createElement("a");
        nextLink.className = "site-pager__link";
        nextLink.href = resolve(root, next.path);
        nextLink.innerHTML = next.label + ' <span aria-hidden="true">›</span>';
        nextLink.title = "Siguiente: " + next.label;
        pager.appendChild(nextLink);
      }
    }
  }

  /* ---------------------------------------------------------------
     Cabecera fija: reservar espacio con el spacer
     --------------------------------------------------------------- */
  function syncSpacer(header) {
    var spacer = document.querySelector(".indalo-top-spacer");
    if (!header || !spacer) {
      return;
    }
    var update = function () {
      spacer.style.height = Math.ceil(header.getBoundingClientRect().height) + "px";
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("load", update);
    if (window.ResizeObserver) {
      new ResizeObserver(update).observe(header);
    }
  }

  /* ---------------------------------------------------------------
     Portada (landing)
     --------------------------------------------------------------- */
  function createNavLink(page, href, currentId) {
    var link = document.createElement("a");
    link.href = href;
    link.className = "indalo-nav-link tone-" + page.tone + (page.id === currentId ? " is-active" : "");
    link.innerHTML = "<strong>" + page.label + "</strong><span>" + page.summary + "</span>";
    return link;
  }

  function renderGroupedLinks(target, root, compact) {
    target.innerHTML = "";
    groupOrder.forEach(function (group) {
      if (!grouped[group]) {
        return;
      }
      var section = document.createElement("section");
      section.className = "indalo-nav-section";

      var heading = document.createElement("h2");
      heading.className = "indalo-nav-heading";
      heading.textContent = navLabels[group] || group;
      section.appendChild(heading);

      Object.keys(grouped[group]).forEach(function (sub) {
        if (!subgroupExcluded[sub]) {
          var subheading = document.createElement("p");
          subheading.className = "indalo-nav-subheading";
          subheading.textContent = sub;
          section.appendChild(subheading);
        }
        var list = document.createElement("div");
        list.className = compact ? "indalo-nav-list is-compact" : "indalo-nav-list";
        grouped[group][sub].forEach(function (page) {
          list.appendChild(createNavLink(page, resolve(root, page.path), null));
        });
        section.appendChild(list);
      });

      target.appendChild(section);
    });
  }

  function renderFeatured(target, root) {
    if (!target) {
      return;
    }
    var featuredIds = NAV.featured || [
      "inicio",
      "ruta",
      "laboratorio-fracciones-el-igualador-de-fracciones-1-0",
      "laboratorio-proporciones-agro-manager",
      "evaluacion-tests",
      "evaluacion-examen"
    ];
    target.innerHTML = "";
    featuredIds
      .map(function (id) { return pageById[id]; })
      .filter(Boolean)
      .forEach(function (page) {
        var card = document.createElement("a");
        card.href = resolve(root, page.path);
        card.className = "indalo-feature-card tone-" + page.tone;
        card.innerHTML =
          '<span class="indalo-feature-group">' + page.group + "</span>" +
          "<strong>" + page.label + "</strong>" +
          "<p>" + page.summary + "</p>";
        target.appendChild(card);
      });
  }

  function renderLandingSections(target, root) {
    if (!target) {
      return;
    }
    target.innerHTML = "";
    groupOrder.forEach(function (group) {
      if (!grouped[group]) {
        return;
      }
      var card = document.createElement("article");
      card.className = "indalo-group-card";

      var title = document.createElement("h3");
      title.textContent = navLabels[group] || group;
      card.appendChild(title);

      var copy = document.createElement("p");
      copy.className = "indalo-panel-copy";
      copy.style.margin = "0.3rem 0 0.6rem";
      copy.textContent = sectionDescriptions[group] || "";
      card.appendChild(copy);

      Object.keys(grouped[group]).forEach(function (sub) {
        if (!subgroupExcluded[sub]) {
          var subLabel = document.createElement("p");
          subLabel.className = "indalo-group-subheading";
          subLabel.textContent = sub;
          card.appendChild(subLabel);
        }
        var list = document.createElement("div");
        list.className = "indalo-group-links";
        grouped[group][sub].forEach(function (page) {
          var link = document.createElement("a");
          link.href = resolve(root, page.path);
          link.className = "indalo-inline-link";
          link.textContent = page.label;
          list.appendChild(link);
        });
        card.appendChild(list);
      });

      target.appendChild(card);
    });
  }

  function renderLanding() {
    var legacyHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    var requested = legacyHash.get("page");
    if (requested && pageById[requested]) {
      window.location.replace(pageById[requested].path);
      return;
    }

    renderFeatured(document.getElementById("landing-featured"), "");
    renderLandingSections(document.getElementById("landing-sections"), "");

    var nav = document.getElementById("landing-nav");
    if (nav) {
      renderGroupedLinks(nav, "", true);
    }

    var totalNode = document.getElementById("landing-count-pages");
    if (totalNode) {
      totalNode.textContent = String(pages.length);
    }
    // Contadores por grupo: cualquier elemento con [data-count-group].
    document.querySelectorAll("[data-count-group]").forEach(function (node) {
      var group = node.getAttribute("data-count-group");
      node.textContent = String(
        pages.filter(function (p) { return p.group === group; }).length
      );
    });
  }

  /* --------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    var header = document.querySelector(".site-nav");
    var currentPage = document.body.classList.contains("indalo-page") ? getCurrentPage() : null;

    if (header) {
      var root = header.getAttribute("data-indalo-root") || "";
      var menu = header.querySelector(".site-nav__menu");
      if (menu) {
        buildMenu(menu, root, currentPage);
        wireBurger(header, menu);
      }
      syncSpacer(header);
      buildSubbar(root, currentPage);
    }

    if (document.body.classList.contains("indalo-landing")) {
      renderLanding();
    }
  });
})();
