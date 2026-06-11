// at-app.js — drives bank theming, viewport mode, and the booking funnel.
(function () {
  var BANKS = window.AT_BANKS,
    VEH = window.AT_VEHICLES,
    FAQ = window.AT_FAQ,
    STEPS = window.AT_STEPS;
  var order = ["ctbc", "cathay", "taishin", "dbs"];
  var holderEn = {
    ctbc: "CHEN, M.",
    cathay: "LIN, Y.",
    taishin: "WANG, T.",
    dbs: "CHANG, H.",
  };
  var fare = { sedan: 1580, business: 2280, van: 2680 };
  var carName = {
    sedan: "Toyota Camry · ARJ-3120",
    business: "Toyota Alphard · ARJ-7720",
    van: "Hyundai Custin · ARJ-5530",
  };

  var FEATURES = [
    {
      t: "準時保證",
      d: "系統預先調度、精準預估到車時間，提前派車不誤機。",
      p: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
    },
    {
      t: "專業認證司機",
      d: "背景查核、定期訓練，平均評分 4.8 星以上。",
      p: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6",
    },
    {
      t: "航班動態追蹤",
      d: "自動同步航班資訊，延誤或提早抵達皆順延接送。",
      p: "M3 11l19-9-9 19-2-8z",
    },
    {
      t: "合併入帳免現付",
      d: "權益內趟次免費，超額費用合併於信用卡帳單。",
      p: "M3 7h18v10H3zM3 11h18",
    },
    {
      t: "即時行程追蹤",
      d: "出發當日查看司機位置與預計抵達時間。",
      p: "M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
    },
    {
      t: "24 小時客服",
      d: "全程專人協助，行程異動與問題即時處理。",
      p: "M4 5h4l2 5-2.5 1.5a11 11 0 005 5L14 14l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 011-1z",
    },
  ];

  var state = { bank: "ctbc", step: 1, dir: "out", veh: "sedan" };
  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };
  function svg(path, sz) {
    return (
      '<svg width="' +
      (sz || 20) +
      '" height="' +
      (sz || 20) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="' +
      path +
      '"/></svg>'
    );
  }
  function nf(n) {
    return "NT$ " + n.toLocaleString("en-US");
  }

  // ── bank pills ──
  function buildPills() {
    var box = $("#bankPills");
    box.innerHTML = order
      .map(function (id) {
        var b = BANKS[id];
        return (
          '<button class="bank-pill" data-bank="' +
          id +
          '" aria-pressed="' +
          (id === state.bank) +
          '">' +
          '<span class="pm" style="background:linear-gradient(150deg,' +
          b.co.primary +
          "," +
          b.co.primaryDark +
          ')">' +
          b.mark.slice(0, 2) +
          "</span>" +
          b.nameZh +
          "</button>"
        );
      })
      .join("");
    $$(".bank-pill", box).forEach(function (el) {
      el.addEventListener("click", function () {
        setBank(el.dataset.bank);
      });
    });
  }

  // ── apply bank theme + content ──
  function setBank(id) {
    state.bank = id;
    var b = BANKS[id];
    var root = $("#siteRoot");
    var c = b.co;
    root.style.setProperty("--primary", c.primary);
    root.style.setProperty("--primary-dark", c.primaryDark);
    root.style.setProperty("--accent", c.accent);
    root.style.setProperty("--accent-soft", c.accentSoft);
    root.style.setProperty("--tint", c.tint);
    // phone chrome uses same vars — set on stage too
    $("#stage").style.setProperty("--primary", c.primary);
    $("#stage").style.setProperty("--primary-dark", c.primaryDark);
    $("#stage").style.setProperty("--accent", c.accent);

    var rem = b.quota.total - b.quota.used;
    var binds = {
      mark: b.mark,
      bankNameZh: b.nameZh,
      bankNameEn: b.nameEn,
      host: b.host,
      hero: b.hero,
      heroSub: b.heroSub,
      tier: b.tier,
      support: b.support,
      cardShort: b.card,
      holderName: b.holder.name,
      holderLast4: b.holder.last4,
      holderNameUp: holderEn[id],
      quotaRemain: rem,
      quotaTotal: b.quota.total,
      airport0: b.airports[0],
      airport1: b.airports[1],
      bookCopy:
        "以您的" +
        b.card +
        "權益，三步驟完成機場接送預約，費用合併入帳、無須現場付款。",
    };
    Object.keys(binds).forEach(function (k) {
      $$('[data-bind="' + k + '"]', root)
        .concat($$('[data-bind="' + k + '"]', $("#phone")))
        .forEach(function (el) {
          el.textContent = binds[k];
        });
    });
    $("#quotaBar").style.width = Math.round((rem / b.quota.total) * 100) + "%";
    root.classList.toggle("serif-head", !!b.serif);
    $$(".bank-pill").forEach(function (el) {
      el.setAttribute("aria-pressed", String(el.dataset.bank === id));
    });

    // hero perks
    $("#heroPerks").innerHTML = b.perks
      .map(function (p) {
        return '<div class="pk">' + svg("M5 12l5 5L20 7", 17) + p + "</div>";
      })
      .join("");
    // coverage list
    $("#covList").innerHTML = b.regions
      .map(function (r) {
        return (
          '<div class="rg">' +
          svg("M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z", 15) +
          r +
          "</div>"
        );
      })
      .join("");

    rebuildConfirm();
    document.title = "機場接送 · " + b.nameZh;
  }

  // ── static-ish sections ──
  function buildFeatures() {
    $("#featGrid").innerHTML = FEATURES.map(function (f) {
      return (
        '<div class="feat"><div class="ic">' +
        svg(f.p, 22) +
        "</div><h3>" +
        f.t +
        "</h3><p>" +
        f.d +
        "</p></div>"
      );
    }).join("");
  }
  function buildVehicles() {
    $("#vehGrid").innerHTML = VEH.map(function (v) {
      var carSvg =
        '<svg width="84" height="44" viewBox="0 0 84 44" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 32h68M14 32l5-13h46l5 13M26 19v13M58 19v13"/><circle cx="24" cy="32" r="5" fill="var(--bg)"/><circle cx="60" cy="32" r="5" fill="var(--bg)"/></svg>';
      return (
        '<div class="veh"><div class="vh"><span class="badge">' +
        v.en +
        "</span>" +
        carSvg +
        "</div>" +
        '<div class="vb"><h3>' +
        v.name +
        '</h3><div class="en">' +
        v.models +
        "</div>" +
        '<div class="specs"><div><span>乘客</span><b>' +
        v.seats +
        "</b></div><div><span>行李</span><b>" +
        v.luggage +
        "</b></div></div>" +
        '<div class="note">' +
        v.note +
        "</div></div></div>"
      );
    }).join("");
  }
  function buildSteps() {
    $("#stepsRow").innerHTML = STEPS.map(function (s) {
      return (
        '<div class="step"><div class="sn">' +
        s.n +
        "</div><h4>" +
        s.t +
        "</h4><p>" +
        s.d +
        "</p></div>"
      );
    }).join("");
  }
  function buildFaq() {
    $("#faqList").innerHTML = FAQ.map(function (f) {
      return (
        '<div class="qa" aria-expanded="false"><button>' +
        f.q +
        '<span class="qi">' +
        svg("M12 5v14M5 12h14", 20) +
        '</span></button><div class="ans"><p>' +
        f.a +
        "</p></div></div>"
      );
    }).join("");
    $$(".qa").forEach(function (qa) {
      qa.querySelector("button").addEventListener("click", function () {
        var open = qa.getAttribute("aria-expanded") === "true";
        qa.setAttribute("aria-expanded", String(!open));
        var ans = qa.querySelector(".ans");
        ans.style.maxHeight = open ? "0" : ans.scrollHeight + 40 + "px";
      });
    });
  }
  function buildVehPick() {
    $("#vehPick").innerHTML = VEH.map(function (v) {
      return (
        '<button data-veh="' +
        v.id +
        '" aria-pressed="' +
        (v.id === state.veh) +
        '"><div class="vn">' +
        v.name +
        '</div><div class="vs">' +
        v.seats +
        "</div></button>"
      );
    }).join("");
    $$("#vehPick button").forEach(function (el) {
      el.addEventListener("click", function () {
        state.veh = el.dataset.veh;
        $$("#vehPick button").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === el));
        });
      });
    });
  }

  // ── booking flow ──
  var titles = {
    1: ["驗證接送資格", "確認您的卡別權益"],
    2: ["填寫行程資訊", "選擇航廈、時間與車型"],
    3: ["確認權益與費用", "送出前請確認資訊"],
    4: ["預約成功", "已收到您的預約"],
    5: ["行程追蹤", "司機前往上車點"],
  };
  function goStep(n) {
    state.step = n;
    $$(".bstep").forEach(function (s) {
      s.classList.toggle("show", +s.dataset.step === n);
    });
    $("#panelTitle").textContent = titles[n][0];
    $("#panelSub").textContent = titles[n][1];
    var dots = $$("#progress .pd");
    dots.forEach(function (d, i) {
      d.classList.toggle("on", i < Math.min(n, 3));
    });
    if (n === 3) rebuildConfirm();
    if (n === 4)
      $("#bkId").textContent = "bk_" + Math.floor(1000 + Math.random() * 8999);
    if (n === 5) $("#trackCar").textContent = carName[state.veh];
    var panel = $("#mybooking");
    if (panel && n !== state.lastScrollStep) {
      /* keep position stable */
    }
  }
  function rebuildConfirm() {
    var b = BANKS[state.bank];
    var term = $("#fTerminal") ? $("#fTerminal").value : "桃園 T2 · 第二航廈";
    var flight = $("#fFlight") ? $("#fFlight").value : "BR198";
    var addr = $("#fAddr") ? $("#fAddr").value : "台北市信義區松仁路 100 號";
    var date = $("#fDate") ? $("#fDate").value : "2026-06-18";
    var time = $("#fTime") ? $("#fTime").value : "05:30";
    var phone = $("#fPhone") ? $("#fPhone").value : "0912-555-401";
    var vname = (
      VEH.filter(function (v) {
        return v.id === state.veh;
      })[0] || VEH[0]
    ).name;
    var out = state.dir === "out";
    var rows = [
      ["服務", "機場接送 · " + (out ? "出境去程" : "入境回程")],
      ["航班 / 航廈", flight + " · " + term],
      [out ? "上車地點" : "下車地點", addr],
      [out ? "前往" : "出發", term.split(" ")[0] + " 機場"],
      ["用車時間", date + " " + time],
      ["車型 / 乘客", vname + " · " + phone],
    ];
    var summ = $("#confirmSumm");
    if (summ)
      summ.innerHTML = rows
        .map(function (r) {
          return (
            '<div class="sr"><span class="k">' +
            r[0] +
            '</span><span class="v">' +
            r[1] +
            "</span></div>"
          );
        })
        .join("");
    var base = fare[state.veh];
    if ($("#baseFare")) $("#baseFare").textContent = nf(base);
    if ($("#discount")) $("#discount").textContent = "− " + nf(base);
  }

  function bindFlow() {
    $$("[data-go]").forEach(function (el) {
      el.addEventListener("click", function () {
        goStep(+el.dataset.go);
      });
    });
    $$("#dirSeg button").forEach(function (el) {
      el.addEventListener("click", function () {
        state.dir = el.dataset.dir;
        $$("#dirSeg button").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === el));
        });
        $("#addrLabel").innerHTML =
          (state.dir === "out" ? "上車地點（市區）" : "下車地點（市區）") +
          ' <span class="rq">*</span>';
      });
    });
    var callBtn = $("[data-call]");
    if (callBtn)
      callBtn.addEventListener("click", function () {
        callBtn.textContent = "撥號中…";
        setTimeout(function () {
          callBtn.textContent = "聯絡司機";
        }, 1400);
      });
    ["#fTerminal", "#fFlight", "#fAddr", "#fDate", "#fTime", "#fPhone"].forEach(
      function (s) {
        var el = $(s);
        if (el) el.addEventListener("change", rebuildConfirm);
      },
    );
  }

  // ── viewport toggle ──
  function setView(mode) {
    var stage = $("#stage"),
      phone = $("#phone"),
      desk = $("#deskHost"),
      site = $("#siteRoot");
    $$("#viewToggle button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.view === mode));
    });
    if (mode === "embed") {
      stage.classList.add("embed");
      desk.style.display = "none";
      phone.style.display = "block";
      $("#webview").appendChild(site);
    } else {
      stage.classList.remove("embed");
      phone.style.display = "none";
      desk.style.display = "block";
      desk.appendChild(site);
    }
  }

  // ── init ──
  buildPills();
  buildFeatures();
  buildVehicles();
  buildSteps();
  buildFaq();
  buildVehPick();
  bindFlow();
  setBank("ctbc");
  goStep(1);
  $$("#viewToggle button").forEach(function (b) {
    b.addEventListener("click", function () {
      setView(b.dataset.view);
    });
  });

  // live clock for phone status bar
  function tick() {
    var d = new Date(),
      t =
        ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    if ($("#sbTime")) $("#sbTime").textContent = t;
  }
  tick();
  setInterval(tick, 30000);
})();
