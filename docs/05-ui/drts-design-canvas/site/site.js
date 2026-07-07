// site.js — injects shared header + footer for the public marketing site,
// wires the mobile drawer + login dropdown. Each page sets window.PAGE = 'home' etc.
(function () {
  var PAGE = window.PAGE || '';
  var ICON = {
    logo: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h18M5 17l2-7h10l2 7M8 10V6h8v4"/><circle cx="7.5" cy="17.5" r="1.5" fill="#fff"/><circle cx="16.5" cy="17.5" r="1.5" fill="#fff"/></svg>',
    driver: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>',
    biz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>',
    platform: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/></svg>',
    fleet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l2-7h14l2 7M3 13v5h2M21 13v5h-2M3 13h18"/><circle cx="7.5" cy="18" r="1.3"/><circle cx="16.5" cy="18" r="1.3"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 4v6c0 5-4 8-9 9-5-1-9-4-9-9V7z"/></svg>',
    ops: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h6l2-3 4 6 2-3h4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
  };
  var NAV = [
    { href: 'drivers.html', key: 'drivers', label: '司機合作' },
    { href: 'enterprise.html', key: 'enterprise', label: '企業與機場接送合作' },
    { href: 'platform.html', key: 'platform', label: '平台導單合作' },
    { href: 'fleet.html', key: 'fleet', label: '車行／車隊合作' },
    { href: 'about.html', key: 'about', label: '關於我們' },
  ];
  var LOGINS = [
    { ic: 'biz', label: '企業／合作方 Portal', sub: 'Tenant / Partner Portal' },
    { ic: 'fleet', label: '車行合作夥伴 Portal', sub: 'Fleet Partner Portal' },
    { ic: 'admin', label: '平台管理後台', sub: 'Platform Admin' },
    { ic: 'ops', label: '營運後台', sub: 'Ops Console' },
    { ic: 'driver', label: '司機 App 入口', sub: 'Driver App' },
  ];

  function brand(dark) {
    return '<a class="brand" href="index.html"><span class="logo">' + ICON.logo + '</span>' +
      '<span style="display:flex;flex-direction:column;line-height:1.12"><span class="zh">智慧運輸科技</span><span class="en">Smart Transit Tech</span></span></a>';
  }

  function header() {
    var dark = !!window.PAGE_DARK_HEADER;
    var links = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.key === PAGE ? ' class="active"' : '') + '>' + n.label + '</a>';
    }).join('');
    var loginItems = LOGINS.map(function (l) {
      return '<a href="contact.html"><span class="lm-ic">' + ICON[l.ic] + '</span><span>' + l.label + '<small>' + l.sub + '</small></span></a>';
    }).join('');
    return '<header class="site-header' + (dark ? ' on-dark' : '') + '"><div class="wrap"><nav class="nav">' +
      brand(dark) +
      '<div class="nav-links">' + links + '</div>' +
      '<div class="nav-right">' +
        '<div class="nav-login"><button class="btn btn-ghost btn-sm">登入 ' + ICON.chev + '</button>' +
          '<div class="login-menu">' +
            '<div style="padding:6px 12px 4px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2)">登入分流</div>' +
            loginItems +
          '</div>' +
        '</div>' +
        '<a class="btn btn-primary btn-sm" href="contact.html">聯絡合作</a>' +
        '<button class="hamburger" aria-label="menu" onclick="window.__toggleDrawer(true)">' + ICON.menu + '</button>' +
      '</div>' +
    '</nav></div></header>';
  }

  function drawer() {
    var links = NAV.map(function (n) { return '<a href="' + n.href + '">' + n.label + '</a>'; }).join('');
    var loginItems = LOGINS.map(function (l) { return '<a href="contact.html">' + l.label + ' <small style="color:var(--muted);font-weight:400">· ' + l.sub + '</small></a>'; }).join('');
    return '<div class="mobile-drawer" id="mdrawer" onclick="if(event.target.id===\'mdrawer\')window.__toggleDrawer(false)">' +
      '<div class="mobile-panel">' +
        '<div class="mp-head">' + brand(false) + '<button class="hamburger" onclick="window.__toggleDrawer(false)">' + ICON.x + '</button></div>' +
        links +
        '<div class="mp-section">登入分流</div>' +
        loginItems +
        '<a class="btn btn-primary btn-lg" style="margin-top:16px;justify-content:center" href="contact.html">聯絡合作</a>' +
      '</div></div>';
  }

  function footer() {
    return '<footer class="site-footer"><div class="wrap">' +
      '<div class="footer-grid">' +
        '<div>' + brand(true) +
          '<p class="f-about">整合第三方叫車平台、企業派車、機場接送、保險代步、旅行社接送與車行供給，為計程車車隊與商務派車打造穩定的營運中樞。</p>' +
          '<div style="margin-top:16px;font-size:13px;color:#93A4C4;line-height:1.9">高雄市左營區重義路 57 號<br>07-7351077 · bd@smarttransit.tw</div></div>' +
        '<div class="f-col"><h4>合作主題</h4>' +
          '<a href="drivers.html">司機合作</a><a href="enterprise.html">企業與機場接送合作</a><a href="platform.html">平台導單合作</a><a href="fleet.html">車行／車隊合作</a></div>' +
        '<div class="f-col"><h4>登入入口</h4>' +
          '<a href="contact.html">企業／合作方 Portal</a><a href="contact.html">車行合作夥伴 Portal</a><a href="contact.html">平台管理後台</a><a href="contact.html">營運後台</a><a href="contact.html">司機 App 入口</a></div>' +
        '<div class="f-col"><h4>公司</h4>' +
          '<a href="about.html">關於我們</a><a href="contact.html">聯絡合作</a><a href="#">隱私權政策</a><a href="#">服務條款</a><a href="#">資安通報</a></div>' +
      '</div>' +
      '<div class="f-bottom"><span>© 2026 智慧運輸科技股份有限公司 · Smart Transit Tech Co., Ltd.</span>' +
        '<span>為台灣商務派車量身打造</span></div>' +
    '</div></footer>';
  }

  window.__toggleDrawer = function (open) {
    var d = document.getElementById('mdrawer');
    if (d) d.classList.toggle('open', open);
  };

  document.addEventListener('DOMContentLoaded', function () {
    var h = document.getElementById('site-header-slot');
    if (h) h.outerHTML = header() + drawer();
    var f = document.getElementById('site-footer-slot');
    if (f) f.outerHTML = footer();
  });
})();
