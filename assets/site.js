/* Texas 6 BBQ site script.
   The page ships with complete built-in content, so it is readable instantly and still works if the
   database is unreachable. When the database answers, its text, prices, photos and Facebook posts
   replace the built-in versions. */
(function () {
  'use strict';
  var CFG = window.T6_CONFIG || {};
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  // Admin text supports **bold** and line breaks, nothing else.
  var rich = function (s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); };
  var money = function (n) {
    n = Number(n);
    return '$' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };
  var has = function (v) { return v !== null && v !== undefined && v !== ''; };

  var state = {
    phone: '(979) 627-3285',
    menu: [
      { category: 'meat', name: 'Whole Brisket', whole_price: 200, whole_note: '12–16 lb' },
      { category: 'meat', name: 'Whole Turkey', whole_price: 75, whole_note: '16–20 lb bird' },
      { category: 'meat', name: 'Pork Tenderloin', whole_price: 80, whole_note: '7–9 lb' },
      { category: 'meat', name: 'Turkey Breast', whole_price: 60, whole_note: '3 lb' },
      { category: 'side', name: 'Mac-n-Cheese', whole_price: 36, whole_note: 'half pan' }
    ]  };
  var digits = function () { return state.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); };

  /* ---------- Views: home and #estimate ---------- */
  var home = $('home'), est = $('estimateView');
  function route() {
    var isEst = location.hash === '#estimate';
    home.hidden = isEst; est.hidden = !isEst;
    if (isEst) window.scrollTo(0, 0);
    else if (location.hash) { var t = $(location.hash.slice(1)); if (t) setTimeout(function () { t.scrollIntoView(); }, 0); }
    if (!isEst && reel.place) reel.place();
  }
  addEventListener('hashchange', route);

  /* ---------- Photo reel (same mechanics as lukelackey.com) ---------- */
  var reel = { place: null, abort: null, timer: null };
  function initReel(start, opts) {
    opts = opts || {};
    var el = $('reel'), track = $('reelTrack');
    if (reel.abort) reel.abort.abort();
    if (reel.timer) clearInterval(reel.timer);
    var ac = new AbortController(); reel.abort = ac;
    var on = function (t, ev, fn, o) { t.addEventListener(ev, fn, Object.assign({ signal: ac.signal }, o || {})); };

    var slides = [].slice.call(track.querySelectorAll('.reel-item:not([data-copy])'));
    var count = slides.length;
    var dotsWrap = el.querySelector('.reel-dots');
    dotsWrap.innerHTML = '';
    if (!count) return;
    var pos = count + Math.max(0, Math.min(count - 1, start || 0));
    var dots = slides.map(function (s, i) {
      var b = document.createElement('button'); b.className = 'reel-dot'; b.type = 'button';
      var cap = s.querySelector('figcaption');
      b.setAttribute('aria-label', 'Photo ' + (i + 1) + (cap ? ': ' + cap.textContent : ''));
      on(b, 'click', function () { jumpToIndex(i); });
      dotsWrap.appendChild(b); return b;
    });
    var copy = function (s) {
      var c = s.cloneNode(true); c.setAttribute('aria-hidden', 'true');
      var im = c.querySelector('img'); if (im) { im.alt = ''; im.loading = 'eager'; }
      var v = c.querySelector('video'); if (v) v.removeAttribute('aria-label');
      c.setAttribute('data-copy', ''); c.classList.remove('is-current', 'is-prev', 'is-next'); return c;
    };
    var frames = [];
    slides.forEach(function (s) { frames.push(copy(s)); });
    slides.forEach(function (s) { frames.push(s); });
    slides.forEach(function (s) { frames.push(copy(s)); });
    track.innerHTML = ''; frames.forEach(function (f) { track.appendChild(f); });

    var centreFor = function (i) { var f = frames[i], vp = track.parentNode; return vp.clientWidth / 2 - (f.offsetLeft - frames[0].offsetLeft + f.offsetWidth / 2); };
    var paint = function () {
      var idx = pos % count;
      frames.forEach(function (f, i) { f.classList.toggle('is-current', i === pos); f.classList.toggle('is-prev', i === pos - 1); f.classList.toggle('is-next', i === pos + 1); });
      dots.forEach(function (d, i) { d.setAttribute('aria-selected', String(i === idx)); });
      $('rcNow').textContent = idx + 1; $('rcAll').textContent = count;
      slides.forEach(function (s, i) { s.setAttribute('aria-hidden', String(i !== idx)); });
      frames.forEach(function (f, i) {
        var v = f.querySelector('video'); if (!v) return;
        if (i === pos && !reduceMotion) { var pl = v.play(); if (pl && pl.catch) pl.catch(function () {}); }
        else if (!v.paused) v.pause();
      });
    };
    var place = function (animate) { track.classList.toggle('animate', animate === true && !reduceMotion); track.style.transform = 'translateX(' + centreFor(pos) + 'px)'; };
    reel.place = function () { place(false); };
    var show = function (n, a) { pos = n; place(a); paint(); };
    var snap = function () { if (pos >= count && pos < count * 2) return; pos = count + (pos % count); track.classList.add('instant'); place(false); paint(); void track.offsetWidth; track.classList.remove('instant'); };
    on(track, 'transitionend', function (e) { if (e.target === track && e.propertyName === 'transform') snap(); });
    var stop = function () { if (reel.timer) { clearInterval(reel.timer); reel.timer = null; } };
    var start = function () { stop(); if (!reduceMotion && count > 1 && !opts.still) reel.timer = setInterval(function () { show(pos + 1, true); }, 6000); };
    var jump = function (to) { show(to, true); if (reduceMotion) snap(); start(); };
    var jumpToIndex = function (i) { var here = pos % count, step = i - here; if (step > count / 2) step -= count; if (step < -count / 2) step += count; jump(pos + step); };
    on(track, 'click', function (e) { var c = e.target.closest('.reel-item'); if (!c) return; var at = frames.indexOf(c); if (at !== -1 && at !== pos) jump(at); });
    on(el.querySelector('.reel-nav.next'), 'click', function () { jump(pos + 1); });
    on(el.querySelector('.reel-nav.prev'), 'click', function () { jump(pos - 1); });
    on(el, 'mouseenter', stop); on(el, 'mouseleave', start);
    on(el, 'focusin', stop); on(el, 'focusout', start);
    on(document, 'visibilitychange', function () { document.hidden ? stop() : start(); });
    var rt = null; on(window, 'resize', function () { clearTimeout(rt); rt = setTimeout(function () { place(false); }, 120); });
    var tx = null;
    on(el, 'touchstart', function (e) { tx = e.changedTouches[0].clientX; }, { passive: true });
    on(el, 'touchend', function (e) { if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 45) jump(pos + (dx < 0 ? 1 : -1)); }, { passive: true });
    track.querySelectorAll('img').forEach(function (img) { if (!img.complete) on(img, 'load', function () { place(false); }); });
    track.querySelectorAll('video').forEach(function (v) { on(v, 'loadedmetadata', function () { place(false); }); });
    on(window, 'load', function () { slides.forEach(function (s) { var im = s.querySelector('img'); if (im) im.loading = 'eager'; }); place(false); });
    show(pos, false); start();
  }

  function slideHTML(m, i) {
    var w = m.width || 1200, h = m.height || 900;
    var lazy = i > 1 ? ' loading="lazy"' : '';
    var cap = m.caption ? '<figcaption class="reel-cap">' + esc(m.caption) + '</figcaption>' : '';
    if (m.kind === 'video') {
      var tall = h > w ? ' tall' : '';
      return '<figure class="reel-item" data-id="' + esc(m.id || '') + '"><video class="' + tall + '" src="' + esc(m.url) + '"' + (m.poster_url ? ' poster="' + esc(m.poster_url) + '"' : '') +
        ' width="' + w + '" height="' + h + '" style="aspect-ratio:' + w + '/' + h + '" muted loop playsinline preload="metadata" aria-label="' + esc(m.alt || m.caption) + '"></video>' + cap + '</figure>';
    }
    return '<figure class="reel-item" data-id="' + esc(m.id || '') + '"><img src="' + esc(m.url) + '" width="' + w + '" height="' + h + '" alt="' + esc(m.alt || m.caption) + '"' + lazy + '>' + cap + '</figure>';
  }

  /* ---------- Menu tables ---------- */
  function renderMenu() {
    var meats = state.menu.filter(function (m) { return m.category === 'meat'; });
    var sides = state.menu.filter(function (m) { return m.category === 'side'; });
    var specials = state.menu.filter(function (m) { return m.category === 'special'; });
    $('specialCard').hidden = !specials.length;
    $('special').classList.toggle('solo', !specials.length);
    // With no half or per-lb prices, the meats table drops its third column.
    var twoCol = !meats.some(function (m) { return has(m.half_price) || has(m.lb_price); });
    $('meatsBody').closest('table').classList.toggle('two-col', twoCol);
    $('thWhole').textContent = twoCol ? 'Price' : 'Whole';
    $('specialBody').innerHTML = specials.map(function (m) {
      return '<tr><td>' + esc(m.name) + (m.whole_note ? '<small>' + esc(m.whole_note) + '</small>' : '') + '</td><td class="p r">' + (has(m.whole_price) ? money(m.whole_price) : '—') + '</td></tr>';
    }).join('');
    $('meatsBody').innerHTML = meats.map(function (m) {
      var whole = has(m.whole_price) ? money(m.whole_price) + (m.whole_note ? '<small>' + esc(m.whole_note) + '</small>' : '') : '—';
      var second = '—';
      if (has(m.half_price)) {
        var note = m.half_note || (has(m.lb_price) ? 'half, or ' + money(m.lb_price) + '/lb' : 'half');
        second = money(m.half_price) + '<small>' + esc(note) + '</small>';
      } else if (has(m.lb_price)) {
        second = money(m.lb_price) + '<small>per lb</small>';
      }
      return '<tr><td>' + esc(m.name) + '</td><td class="p">' + whole + '</td><td class="p">' + second + '</td></tr>';
    }).join('');
    // Steps with nothing in them disappear; the rest renumber.
    $('stepMeats').hidden = !meats.length; $('stepSides').hidden = !sides.length;
    var vis = [].slice.call(document.querySelectorAll('.steps .stepblk')).filter(function (b) { return !b.hidden; });
    vis.forEach(function (b, i) { b.querySelector('.stepno').textContent = i + 1; });
    document.querySelector('.steps').classList.toggle('solo', vis.length < 2);
    $('sidesBody').innerHTML = sides.map(function (m) {
      return '<tr><td>' + esc(m.name) + (m.whole_note ? '<small>' + esc(m.whole_note) + '</small>' : '') + '</td><td class="p r">' + (has(m.whole_price) ? money(m.whole_price) : '—') + '</td></tr>';
    }).join('');
  }

  /* ---------- Estimate ---------- */
  var q = {};
  function estimateItems() {
    var meats = [], sides = [], specials = [];
    state.menu.forEach(function (m) {
      if (m.category === 'special') { if (has(m.whole_price)) specials.push([m.name, m.whole_note || '', Number(m.whole_price)]); return; }
      if (m.category === 'side') { if (has(m.whole_price)) sides.push([m.name, m.whole_note || '', Number(m.whole_price)]); return; }
      if (has(m.whole_price)) meats.push([m.name + (has(m.half_price) || has(m.lb_price) ? ', whole' : ''), m.whole_note || '', Number(m.whole_price)]);
      if (has(m.half_price)) meats.push([m.name + ', half', m.half_note || '', Number(m.half_price)]);
      if (has(m.lb_price)) meats.push([m.name, 'per lb', Number(m.lb_price)]);
    });
    return [['Holiday special', specials], ['Meats', meats], ['Sides · half-size foil pans', sides]];
  }
  function renderEstimate() {
    var html = ''; var prev = q; q = {};
    estimateItems().forEach(function (g) {
      if (!g[1].length) return;
      html += '<div class="egrp">' + esc(g[0]) + '</div>';
      g[1].forEach(function (it) {
        var id = (it[0] + it[1]).replace(/\W+/g, '').toLowerCase();
        var n = prev[id] ? prev[id].n : 0;
        q[id] = { it: it, n: n };
        html += '<div class="erow' + (n ? ' on' : '') + '" id="r_' + id + '"><div><span class="nm">' + esc(it[0]) + '</span><span class="pr">' + money(it[2]) + (it[1] ? ' · ' + esc(it[1]) : '') +
          '</span></div><div class="step"><button type="button" data-d="-1" data-k="' + id + '" aria-label="Remove one ' + esc(it[0]) + '">−</button><output id="q_' + id + '">' + n +
          '</output><button type="button" data-d="1" data-k="' + id + '" aria-label="Add one ' + esc(it[0]) + '">+</button></div></div>';
      });
    });
    $('elist').innerHTML = html;
    buildEstimate();
  }
  function buildEstimate() {
    var t = 0, L = [];
    Object.keys(q).forEach(function (k) { var o = q[k]; if (!o.n) return; var sub = o.n * o.it[2]; t += sub; L.push(o.n + ' × ' + o.it[0] + (o.it[1] ? ' (' + o.it[1] + ')' : '') + ' — ' + money(sub)); });
    $('eTotal').textContent = money(t);
    var n = $('eName').value.trim(), d = $('eDate').value ? new Date($('eDate').value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    var s = 'Hi Casey! ' + (n ? 'This is ' + n + '. ' : '') + 'Here’s what I’d like from Texas 6 BBQ' + (d ? ' for ' + d : '') + ':\n' + (L.length ? L.join('\n') : '(nothing picked yet)') + '\nEstimate: ' + money(t);
    $('ePreview').textContent = s;
    $('eSms').href = 'sms:+1' + digits() + '?&body=' + encodeURIComponent(s);
    return s;
  }
  $('elist').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-k]'); if (!b) return;
    var o = q[b.dataset.k]; o.n = Math.max(0, Math.min(50, o.n + Number(b.dataset.d)));
    $('q_' + b.dataset.k).textContent = o.n; $('r_' + b.dataset.k).classList.toggle('on', o.n > 0); buildEstimate();
  });
  ['eName', 'eDate'].forEach(function (id) { $(id).addEventListener('input', buildEstimate); });
  $('eCopy').addEventListener('click', function () {
    var s = buildEstimate();
    var ok = function () { $('eToast').textContent = 'Copied. Paste it into a text to Casey at ' + state.phone + '.'; };
    var fb = function () { var r = document.createRange(); r.selectNodeContents($('ePreview')); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); $('eToast').textContent = 'Selected. Use your device’s copy.'; };
    try { navigator.clipboard.writeText(s).then(ok, fb); } catch (e) { fb(); }
  });

  /* ---------- Facebook ---------- */
  function renderPosts(posts) {
    var grid = $('fbPosts'), embed = $('fbEmbed');
    posts = (posts || []).filter(function (p) { return p.message || p.image_url; }).slice(0, 6);
    if (!posts.length) { grid.hidden = true; embed.hidden = false; $('fbMore').hidden = true; return; }
    grid.innerHTML = posts.map(function (p) {
      var date = new Date(p.created_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return '<a class="fb-card" href="' + esc(p.permalink_url || state.fbUrl || '#') + '" target="_blank" rel="noopener">' +
        (p.image_url ? '<img src="' + esc(p.image_url) + '" alt="" loading="lazy">' : '') +
        '<div class="fb-body"><time datetime="' + esc(p.created_time) + '">' + date + '</time>' + (p.message ? '<p>' + esc(p.message) + '</p>' : '') + '</div></a>';
    }).join('');
    grid.hidden = false; embed.hidden = true; $('fbMore').hidden = false;
  }

  /* ---------- Text from the admin portal ---------- */
  function applyText(map) {
    if (Object.prototype.hasOwnProperty.call(map, 'special_heading')) $('special').hidden = !String(map.special_heading).trim();
    document.querySelectorAll('[data-edit]').forEach(function (el) {
      var k = el.getAttribute('data-edit');
      if (Object.prototype.hasOwnProperty.call(map, k)) el.innerHTML = rich(map[k]);
    });
    if (map.phone) {
      state.phone = map.phone;
      document.querySelectorAll('[data-bind="phone"]').forEach(function (el) { el.textContent = map.phone; });
      document.querySelectorAll('a[href^="tel:"]').forEach(function (a) { a.href = 'tel:+1' + digits(); });
      document.querySelectorAll('a[href^="sms:"]').forEach(function (a) { a.href = 'sms:+1' + digits(); });
    }
    ['email', 'owner_names'].forEach(function (k) {
      if (map[k]) document.querySelectorAll('[data-bind="' + k + '"]').forEach(function (el) { el.textContent = map[k]; });
    });
    if (map.facebook_url) {
      state.fbUrl = map.facebook_url;
      document.querySelectorAll('a[href*="facebook.com"]').forEach(function (a) { a.href = map.facebook_url; });
    }
  }

  /* ---------- Load from the database ---------- */
  function get(path) {
    var ctl = new AbortController(); var to = setTimeout(function () { ctl.abort(); }, 6000);
    return fetch(CFG.supabaseUrl + '/rest/v1/' + path, {
      headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey },
      signal: ctl.signal
    }).then(function (r) { clearTimeout(to); if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function load() {
    if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) return;
    get('site_text?select=key,value').then(function (rows) {
      var map = {}; rows.forEach(function (r) { map[r.key] = r.value; }); applyText(map); buildEstimate();
    }).catch(function () {});
    get('menu_items?select=*&active=eq.true&order=category.asc,sort.asc').then(function (rows) {
      state.menu = rows; renderMenu(); renderEstimate();
    }).catch(function () {});
    get('media?select=*&active=eq.true&order=sort.asc,created_at.asc').then(function (rows) {
      if (!rows.length) return;
      $('reelTrack').innerHTML = rows.map(slideHTML).join('');
      initReel();
    }).catch(function () {});
    get('fb_posts?select=*&hidden=eq.false&order=created_time.desc&limit=6').then(renderPosts).catch(function () {});
  }

  // Hooks for the visual editor (assets/editor.js), which only loads for signed-in admins.
  window.T6 = {
    state: state, esc: esc, rich: rich, money: money,
    renderMenu: renderMenu, renderEstimate: renderEstimate, buildEstimate: buildEstimate,
    initReel: initReel, slideHTML: slideHTML, applyText: applyText, renderPosts: renderPosts,
    currentSlide: function () { var c = document.querySelector('#reelTrack .reel-item.is-current'); var all = [].slice.call(document.querySelectorAll('#reelTrack .reel-item:not([data-copy])')); var id = c && c.getAttribute('data-id'); return Math.max(0, all.findIndex(function (f) { return f.getAttribute('data-id') === id; })); }
  };

  var editMode = /[?&]edit\b/.test(location.search);
  renderMenu();
  renderEstimate();
  initReel();
  route();
  if (editMode) {
    ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js', 'assets/editor.js?v=' + Date.now()].reduce(function (p, src) {
      return p.then(function () { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s); }); });
    }, Promise.resolve()).catch(function () { load(); });
  } else {
    load();
    // Signed-in admins get a small shortcut into edit mode.
    try {
      if (Object.keys(localStorage).some(function (k) { return /^sb-.*-auth-token$/.test(k); })) {
        var a = document.createElement('a'); a.href = '?edit'; a.className = 'edit-pill'; a.textContent = 'Edit this page';
        document.body.appendChild(a);
      }
    } catch (e) {}
  }
})();
