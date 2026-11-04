/* Texas 6 BBQ visual editor. Loads only on ?edit for signed-in admins.
   Everything on the page becomes editable in place and saves itself when you tap away. */
(function () {
  'use strict';
  var CFG = window.T6_CONFIG, T6 = window.T6;
  var $ = function (id) { return document.getElementById(id); };
  var esc = T6.esc;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  var uuid = function () { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2); };

  /* ---------- Styles for edit mode ---------- */
  var css = document.createElement('style');
  css.textContent = [
    'body.editing{padding-bottom:calc(78px + env(safe-area-inset-bottom,0px))}',
    '.e-on [data-edit],.e-on [data-bind],.e-on .e-f{outline:1.5px dashed rgba(200,48,44,.55);outline-offset:3px;border-radius:2px;cursor:text;min-width:1ch;display:inline-block}',
    '.e-on p[data-edit],.e-on h2[data-edit],.e-on h3[data-edit]{display:block}',
    '.e-on [data-edit]:hover,.e-on [data-bind]:hover,.e-on .e-f:hover{outline-color:#c8302c;background:rgba(200,48,44,.06)}',
    '.e-on [contenteditable]:focus{outline:2px solid #c8302c;background:rgba(200,48,44,.08)}',
    '.e-on [data-ph]:empty::before{content:attr(data-ph);opacity:.45;font-style:italic}',
    '.e-bar{position:fixed;left:0;right:0;bottom:0;z-index:60;background:#0f0d0d;color:#f6f1ea;border-top:3px solid #c8302c;padding:10px max(14px,env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) max(14px,env(safe-area-inset-left,0px));display:flex;align-items:center;justify-content:space-between;gap:10px;font-family:"Archivo",Arial,sans-serif;box-shadow:0 -10px 30px rgba(0,0,0,.3)}',
    '.e-bar .e-state{display:grid;line-height:1.25;min-width:0}',
    '.e-bar .e-state b{font-family:"Archivo Narrow",Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;font-size:.74rem;color:#e0544b}',
    '.e-bar .e-state span{font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.e-bar .e-btns{display:flex;gap:8px;flex:none}',
    '.e-btn{appearance:none;border:1.5px solid rgba(246,241,234,.3);background:transparent;color:#f6f1ea;font-family:"Archivo Narrow",Arial,sans-serif;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:.76rem;padding:10px 12px;border-radius:4px;cursor:pointer;text-decoration:none;white-space:nowrap;min-height:40px;display:inline-flex;align-items:center;gap:6px}',
    '.e-btn.red{background:#a8201f;border-color:#a8201f}',
    '.e-btn .e-badge{background:#c8302c;color:#fff;border-radius:999px;padding:1px 7px;font-size:.7rem;letter-spacing:0}',
    '.e-tip{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(86px + env(safe-area-inset-bottom,0px));z-index:61;background:#f6f1ea;color:#151212;border-radius:6px;padding:14px 16px;max-width:min(420px,calc(100vw - 28px));box-shadow:0 12px 34px rgba(0,0,0,.35);font-family:"Archivo",Arial,sans-serif;font-size:.95rem;display:grid;gap:10px}',
    '.e-tip button{justify-self:end}',
    '.e-toast{position:fixed;left:50%;transform:translateX(-50%);top:calc(70px + env(safe-area-inset-top,0px));z-index:62;background:#151212;color:#f6f1ea;padding:10px 16px;border-radius:4px;font-family:"Archivo",Arial,sans-serif;font-weight:600;font-size:.92rem;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:calc(100vw - 28px)}',
    '.e-toast.err{background:#a8201f}',
    '.e-tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
    '.e-mini{appearance:none;border:1.5px solid rgba(21,18,18,.18);background:#fffdf9;color:#151212;font-family:"Archivo Narrow",Arial,sans-serif;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:.7rem;padding:6px 9px;border-radius:4px;cursor:pointer;min-height:32px}',
    '.e-mini:disabled{opacity:.35;cursor:default}',
    '.e-mini.danger{color:#a8201f;border-color:rgba(168,32,31,.35)}',
    '.e-mini.armed{background:#a8201f;color:#fff}',
    '.on-dark .e-mini,.reel .e-mini,.special .e-mini{background:#1d1918;color:#f6f1ea;border-color:rgba(246,241,234,.25)}',
    '.e-add{margin-top:10px}',
    '.e-hidden{opacity:.5}',
    '.e-tag{display:inline-block;font-family:"Archivo Narrow",Arial,sans-serif;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:.66rem;padding:3px 7px;border-radius:999px;border:1px solid currentColor;color:#a8201f;margin-left:6px;vertical-align:middle}',
    '.reel .e-tag,.special .e-tag{color:#e0544b}',
    '.e-lbl{font-family:"Archivo Narrow",Arial,sans-serif;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:.66rem;opacity:.6;margin-right:4px}',
    '.e-second{display:grid;gap:4px;justify-items:end}',
    '.e-mbar{display:none;gap:6px;flex-wrap:wrap;padding:0 12px 12px}',
    '.reel-item.is-current .e-mbar{display:flex}',
    '.reel-item.e-hidden{opacity:1}.reel-item.e-hidden img,.reel-item.e-hidden video{opacity:.4}',
    '.e-addmedia{display:inline-flex}',
    '.e-note{font-size:.9rem;opacity:.75;margin-top:14px}',
    '.e-on .mtable.two-col td:nth-child(3),.e-on .mtable.two-col th:nth-child(3){display:table-cell}',
    '.e-on .mtable small.e-f{display:block;width:max-content;margin-top:4px}',
    '.e-on .mtable td.p .e-num{min-width:2ch}',
    '.mtable tr.e-toolrow td{border-top:0;padding-top:0}',
    '.mtable tr.e-toolrow .e-tools{margin-top:0}',
    '.mtable tr.e-hid{display:none}',
    '.mtable.show-hidden tr.e-hid{display:table-row}',
    '.e-hidtoggle{margin:10px 0 0 6px}'
  ].join('\n');
  document.head.appendChild(css);

  var toastTimer;
  function toast(msg, err) {
    var t = document.querySelector('.e-toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'e-toast', role: 'status' }));
    t.textContent = msg; t.classList.toggle('err', !!err); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, err ? 6000 : 2200);
  }
  function armed(btn, label) {
    if (btn.classList.contains('armed')) return true;
    var orig = btn.textContent; btn.classList.add('armed'); btn.textContent = label || 'Tap again';
    setTimeout(function () { btn.classList.remove('armed'); btn.textContent = orig; }, 4000);
    return false;
  }

  /* ---------- Save status ---------- */
  var pending = 0, failed = false;
  function setStatus() {
    var s = document.querySelector('.e-state span'); if (!s) return;
    s.textContent = pending ? 'Saving…' : failed ? 'A change didn’t save. Check your connection and try again.' : 'Tap anything outlined to edit. Saves itself.';
  }
  async function save(promise, okMsg) {
    pending++; setStatus();
    try {
      var r = await promise; if (r && r.error) throw r.error;
      failed = false; if (okMsg) toast(okMsg);
      return r;
    } catch (err) { failed = true; toast('Couldn’t save: ' + (err.message || err), true); throw err; }
    finally { pending--; setStatus(); }
  }

  /* ---------- Boot ---------- */
  var text = {}, menu = [], media = [];
  (async function boot() {
    var s = await sb.auth.getSession();
    if (!s.data.session) { location.replace('admin/?next=edit'); return; }
    var ok = await sb.rpc('is_admin');
    if (ok.data !== true) { location.replace('admin/?next=edit'); return; }
    var r = await Promise.all([
      sb.from('site_text').select('key,value'),
      sb.from('menu_items').select('*').order('category').order('sort'),
      sb.from('media').select('*').order('sort').order('created_at'),
      sb.from('price_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    ]);
    (r[0].data || []).forEach(function (t) { text[t.key] = t.value; });
    menu = r[1].data || []; media = r[2].data || [];
    T6.applyText(text);
    document.body.classList.add('editing', 'e-on');
    buildBar(r[3].count || 0);
    wireText();
    renderMenu();
    renderMedia(0);
    decorateBanner();
    var fb = document.querySelector('#facebook .wrap');
    if (fb) fb.insertAdjacentHTML('beforeend', '<p class="e-note">Facebook posts, flyer price reading and the admin password are under Settings.</p>');
    try { if (!localStorage.getItem('t6EditTip')) showTip(); } catch (e) { showTip(); }
  })();

  function buildBar(suggestions) {
    var bar = document.createElement('div'); bar.className = 'e-bar';
    bar.innerHTML = '<div class="e-state"><b>Editing the site</b><span></span></div><div class="e-btns">' +
      '<a class="e-btn" href="admin/#settings">Settings' + (suggestions ? ' <span class="e-badge" title="New prices to review">' + suggestions + '</span>' : '') + '</a>' +
      '<a class="e-btn red" href="./">Done</a></div>';
    document.body.appendChild(bar); setStatus();
  }
  function showTip() {
    var tip = document.createElement('div'); tip.className = 'e-tip';
    tip.innerHTML = '<div><b>You’re editing the live site.</b><br>Tap any outlined text or price and type. Changes save when you tap away. Use the buttons under a photo to move, hide or delete it.</div><button class="e-btn red" type="button">Got it</button>';
    document.body.appendChild(tip);
    tip.querySelector('button').addEventListener('click', function () { tip.remove(); try { localStorage.setItem('t6EditTip', '1'); } catch (e) {} });
  }

  /* ---------- Text ---------- */
  function readText(el) {
    var c = el.cloneNode(true);
    c.querySelectorAll('b,strong').forEach(function (b) { b.replaceWith('**' + b.textContent + '**'); });
    c.querySelectorAll('br').forEach(function (b) { b.replaceWith('\n'); });
    c.querySelectorAll('div,p').forEach(function (d) { d.replaceWith('\n' + d.textContent); });
    return c.textContent.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  function editable(el, multiline) {
    el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'true');
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (multiline) document.execCommand('insertLineBreak'); else el.blur(); }
      if (e.key === 'Escape') el.blur();
    });
    el.addEventListener('paste', function (e) { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
    // Links and buttons around editable text shouldn't fire while editing.
    el.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); }, true);
  }
  function wireText() {
    document.querySelectorAll('[data-edit]').forEach(function (el) {
      var key = el.getAttribute('data-edit');
      editable(el, el.hasAttribute('data-multiline'));
      el.addEventListener('blur', function () {
        var v = readText(el);
        if (v === (text[key] || '').trim()) return;
        if (key === 'special_heading' && !v) { el.innerHTML = T6.rich(text[key]); return toast('Use “Hide banner” to remove the banner.', true); }
        text[key] = v; el.innerHTML = T6.rich(v);
        save(sb.from('site_text').update({ value: v }).eq('key', key), 'Saved.');
      });
    });
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      var key = el.getAttribute('data-bind');
      editable(el, false);
      el.addEventListener('blur', function () {
        var v = el.textContent.trim();
        if (!v || v === text[key]) { el.textContent = text[key] || el.textContent; return; }
        text[key] = v; var patch = {}; patch[key] = v; T6.applyText(patch);
        save(sb.from('site_text').update({ value: v }).eq('key', key), key === 'phone' ? 'Saved. Call and text buttons use the new number.' : 'Saved.');
      });
    });
  }

  /* ---------- Holiday banner ---------- */
  function decorateBanner() {
    var sp = $('special'); if (!sp) return;
    sp.hidden = false;
    var copy = sp.querySelector('.special-copy');
    var tools = document.createElement('div'); tools.className = 'e-tools';
    copy.appendChild(tools);
    var paint = function () {
      var off = !String(text.special_heading || '').trim();
      sp.classList.toggle('e-hidden', off);
      tools.innerHTML = (off ? '<span class="e-tag">Hidden on the live site</span>' : '') +
        '<button class="e-mini" type="button">' + (off ? 'Show banner' : 'Hide banner') + '</button>';
      if (off) sp.querySelector('[data-edit="special_heading"]').textContent = 'Holiday special';
    };
    tools.addEventListener('click', function (e) {
      if (!e.target.closest('button')) return;
      var off = !String(text.special_heading || '').trim();
      var v = off ? (readText(sp.querySelector('[data-edit="special_heading"]')) || 'Holiday special') : '';
      text.special_heading = v;
      save(sb.from('site_text').update({ value: v }).eq('key', 'special_heading'), off ? 'Banner showing on the site.' : 'Banner hidden from the site.');
      paint();
    });
    paint();
  }

  /* ---------- Menu ---------- */
  var has = function (v) { return v !== null && v !== undefined && v !== ''; };
  var shown = function (v) { return has(v) ? String(Number(v)) : ''; };
  function priceSpan(m, f, ph) { return '$<span class="e-f e-num" data-f="' + f + '" data-ph="' + ph + '">' + shown(m[f]) + '</span>'; }
  function noteSpan(m, f, ph) { return '<small class="e-f" data-f="' + f + '" data-ph="' + ph + '">' + esc(m[f] || '') + '</small>'; }
  function tools(m, i, n, cols) {
    return '<tr class="e-toolrow' + (m.active ? '' : ' e-hidden e-hid') + '" data-id="' + m.id + '"><td colspan="' + cols + '"><div class="e-tools"><button class="e-mini" type="button" data-act="up"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">↑</button>' +
      '<button class="e-mini" type="button" data-act="down"' + (i === n - 1 ? ' disabled' : '') + ' aria-label="Move down">↓</button>' +
      '<button class="e-mini" type="button" data-act="toggle">' + (m.active ? 'Hide' : 'Show') + '</button>' +
      '<button class="e-mini danger" type="button" data-act="delete">Delete</button></div></td></tr>';
  }
  function publish() {
    // The estimate builder and the rest of the page use only what's switched on.
    T6.state.menu = menu.filter(function (m) { return m.active && m.category !== 'special'; });
    T6.renderEstimate();
  }
  function renderMenu() {
    var meats = menu.filter(function (m) { return m.category === 'meat'; });
    var sides = menu.filter(function (m) { return m.category === 'side'; });
    $('meatsBody').closest('table').classList.remove('two-col');
    $('thWhole').textContent = 'Whole';
    $('meatsBody').innerHTML = meats.map(function (m, i) {
      return '<tr data-id="' + m.id + '" class="' + (m.active ? '' : 'e-hidden e-hid') + '"><td><span class="e-f" data-f="name" data-ph="Name">' + esc(m.name) + '</span>' + (m.active ? '' : '<span class="e-tag">Hidden</span>') + '</td>' +
        '<td class="p">' + priceSpan(m, 'whole_price', '—') + noteSpan(m, 'whole_note', 'size') + '</td>' +
        '<td class="p"><div class="e-second"><span><span class="e-lbl">Half</span>' + priceSpan(m, 'half_price', '—') + '</span>' + noteSpan(m, 'half_note', 'half size') +
        '<span><span class="e-lbl">Per lb</span>' + priceSpan(m, 'lb_price', '—') + '</span></div></td></tr>' + tools(m, i, meats.length, 3);
    }).join('') || '<tr><td colspan="3" class="e-note">No meats yet.</td></tr>';
    $('sidesBody').innerHTML = sides.map(function (m, i) {
      return '<tr data-id="' + m.id + '" class="' + (m.active ? '' : 'e-hidden e-hid') + '"><td><span class="e-f" data-f="name" data-ph="Name">' + esc(m.name) + '</span>' + (m.active ? '' : '<span class="e-tag">Hidden</span>') + noteSpan(m, 'whole_note', 'size or note') + '</td>' +
        '<td class="p r">' + priceSpan(m, 'whole_price', '—') + '</td></tr>' + tools(m, i, sides.length, 2);
    }).join('') || '<tr><td colspan="2" class="e-note">No sides yet.</td></tr>';
    ['meatsBody', 'sidesBody'].forEach(function (id) {
      var card = $(id).closest('.menu-card');
      if (!card.parentNode.querySelector('.e-add[data-add="' + (id === 'meatsBody' ? 'meat' : 'side') + '"]')) {
        card.insertAdjacentHTML('afterend', '<button class="e-mini e-add" type="button" data-add="' + (id === 'meatsBody' ? 'meat' : 'side') + '">+ Add a ' + (id === 'meatsBody' ? 'meat' : 'side') + '</button>');
      }
    });
    [['meatsBody', meats], ['sidesBody', sides]].forEach(function (pair) {
      var table = $(pair[0]).closest('table'), card = table.closest('.menu-card');
      var nHid = pair[1].filter(function (m) { return !m.active; }).length;
      var btn = card.parentNode.querySelector('.e-hidtoggle[data-for="' + pair[0] + '"]');
      if (!btn) { card.insertAdjacentHTML('afterend', '<button class="e-mini e-hidtoggle" type="button" data-for="' + pair[0] + '"></button>'); btn = card.nextElementSibling; }
      btn.hidden = !nHid;
      btn.textContent = table.classList.contains('show-hidden') ? 'Hide the ' + nHid + ' hidden items' : 'Show ' + nHid + ' hidden item' + (nHid === 1 ? '' : 's');
    });
    document.querySelectorAll('.steps .stepblk').forEach(function (b, i) { b.hidden = false; b.querySelector('.stepno').textContent = i + 1; });
    document.querySelector('.steps').classList.remove('solo');
    document.querySelectorAll('#meatsBody .e-f, #sidesBody .e-f').forEach(function (el) { editable(el, false); });
    publish();
  }
  var menuArea = document.querySelector('#menu');
  menuArea.addEventListener('focusout', function (e) {
    var el = e.target; if (!el.classList || !el.classList.contains('e-f')) return;
    var tr = el.closest('tr[data-id]'); if (!tr) return;
    var m = menu.find(function (x) { return x.id === tr.getAttribute('data-id'); }); if (!m) return;
    var f = el.getAttribute('data-f'), raw = el.textContent.trim(), v;
    if (el.classList.contains('e-num')) {
      raw = raw.replace(/[$,\s]/g, '');
      v = raw === '' ? null : Number(raw);
      if (raw !== '' && !isFinite(v)) { el.textContent = shown(m[f]); return toast('Prices need to be a number, like 75.', true); }
      if (has(m[f]) && v !== null && Number(m[f]) === v) { el.textContent = shown(v); return; }
      if (!has(m[f]) && v === null) return;
      el.textContent = shown(v);
    } else {
      v = raw;
      if (f === 'name' && !v) { el.textContent = m.name; return toast('Every item needs a name.', true); }
      if ((m[f] || '') === v) return;
    }
    m[f] = v; var patch = {}; patch[f] = v;
    save(sb.from('menu_items').update(patch).eq('id', m.id), 'Saved.').then(publish);
  });
  menuArea.addEventListener('click', async function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('e-hidtoggle')) {
      $(b.dataset.for).closest('table').classList.toggle('show-hidden'); renderMenu(); return;
    }
    if (b.dataset.add) {
      var cat = b.dataset.add, same = menu.filter(function (m) { return m.category === cat; });
      var row = { id: uuid(), category: cat, name: cat === 'meat' ? 'New meat' : 'New side', whole_price: null, whole_note: '', half_price: null, half_note: '', lb_price: null, active: true, sort: same.length ? Math.max.apply(null, same.map(function (m) { return m.sort || 0; })) + 1 : 0 };
      await save(sb.from('menu_items').insert(row));
      menu.push(row); renderMenu();
      var nm = document.querySelector('tr[data-id="' + row.id + '"] [data-f="name"]');
      if (nm) { nm.focus(); document.execCommand('selectAll', false, null); }
      return toast('Added. Type its name and price.');
    }
    var act = b.dataset.act; if (!act) return;
    var tr = b.closest('tr[data-id]'), m = menu.find(function (x) { return x.id === tr.getAttribute('data-id'); });
    if (act === 'toggle') {
      if (m.active) $((m.category === 'meat' ? 'meats' : 'sides') + 'Body').closest('table').classList.add('show-hidden');
      m.active = !m.active; await save(sb.from('menu_items').update({ active: m.active }).eq('id', m.id), m.active ? 'Showing on the site.' : 'Hidden from the site.'); renderMenu();
    } else if (act === 'delete') {
      if (!armed(b, 'Tap to delete')) return;
      await save(sb.from('menu_items').delete().eq('id', m.id), 'Deleted.');
      menu = menu.filter(function (x) { return x !== m; }); renderMenu();
    } else if (act === 'up' || act === 'down') {
      var list = menu.filter(function (x) { return x.category === m.category; });
      var i = list.indexOf(m), j = i + (act === 'up' ? -1 : 1); if (j < 0 || j >= list.length) return;
      list.splice(i, 1); list.splice(j, 0, m);
      list.forEach(function (x, k) { x.sort = k; });
      menu = menu.filter(function (x) { return x.category !== m.category; }).concat(list)
        .sort(function (a, c) { return a.category === c.category ? a.sort - c.sort : a.category < c.category ? -1 : 1; });
      await save(Promise.all(list.map(function (x) { return sb.from('menu_items').update({ sort: x.sort }).eq('id', x.id); })).then(function (rs) { return rs.find(function (r) { return r.error; }) || {}; }), 'Order saved.');
      renderMenu();
    }
  });

  /* ---------- Photos & videos ---------- */
  function renderMedia(start) {
    var track = $('reelTrack');
    track.innerHTML = media.map(function (m, i) {
      var html = T6.slideHTML(m, i).replace(' loading="lazy"', '');
      var cap = '<figcaption class="reel-cap"><span class="e-f" data-mf="caption" data-ph="Add a caption">' + esc(m.caption) + '</span>' + (m.active ? '' : '<span class="e-tag">Hidden</span>') + '</figcaption>';
      html = html.replace(/<figcaption class="reel-cap">.*?<\/figcaption>/, '').replace(/<\/figure>$/, cap +
        '<div class="e-mbar"><button class="e-mini" type="button" data-mact="left"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move earlier">←</button>' +
        '<button class="e-mini" type="button" data-mact="right"' + (i === media.length - 1 ? ' disabled' : '') + ' aria-label="Move later">→</button>' +
        (i > 0 ? '<button class="e-mini" type="button" data-mact="first">Make first</button>' : '') +
        '<button class="e-mini" type="button" data-mact="toggle">' + (m.active ? 'Hide' : 'Show') + '</button>' +
        '<button class="e-mini danger" type="button" data-mact="delete">Delete</button></div></figure>');
      return html.replace('<figure class="reel-item"', '<figure class="reel-item' + (m.active ? '' : ' e-hidden') + '"');
    }).join('');
    T6.initReel(start, { still: true });
    track.querySelectorAll('.reel-item:not([data-copy]) [data-mf]').forEach(function (el) { editable(el, false); });
    track.querySelectorAll('.reel-item[data-copy] [data-mf]').forEach(function (el) { el.removeAttribute('contenteditable'); });
    var bar = document.querySelector('.reel-bar');
    if (!bar.querySelector('.e-addmedia')) {
      bar.insertAdjacentHTML('afterbegin', '<label class="e-btn red e-addmedia">+ Add photos or videos<input type="file" accept="image/*,video/*" multiple hidden></label>');
      bar.querySelector('.e-addmedia input').addEventListener('change', function (e) { upload(e.target.files); e.target.value = ''; });
    }
  }
  var track = $('reelTrack');
  track.addEventListener('focusout', function (e) {
    var el = e.target; if (!el.getAttribute || !el.getAttribute('data-mf')) return;
    var id = el.closest('.reel-item').getAttribute('data-id'), m = media.find(function (x) { return x.id === id; }); if (!m) return;
    var v = el.textContent.trim(); if (v === (m.caption || '')) return;
    m.caption = v; if (!m.alt) m.alt = v;
    track.querySelectorAll('.reel-item[data-id="' + id + '"] [data-mf]').forEach(function (c) { if (c !== el) c.textContent = v; });
    save(sb.from('media').update({ caption: v, alt: m.alt }).eq('id', id), 'Caption saved.');
  });
  track.addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-mact]'); if (!b) return;
    e.stopPropagation();
    var id = b.closest('.reel-item').getAttribute('data-id'), i = media.findIndex(function (x) { return x.id === id; }), m = media[i], act = b.dataset.mact;
    if (act === 'toggle') {
      m.active = !m.active; await save(sb.from('media').update({ active: m.active }).eq('id', id), m.active ? 'Showing on the site.' : 'Hidden from the site.'); renderMedia(i);
    } else if (act === 'delete') {
      if (!armed(b, 'Tap to delete')) return;
      await save(sb.from('media').delete().eq('id', id), 'Deleted.');
      if (m.storage_path) sb.storage.from('media').remove([m.storage_path, m.storage_path + '.poster.jpg']);
      media.splice(i, 1); renderMedia(Math.min(i, media.length - 1));
    } else {
      var j = act === 'first' ? 0 : i + (act === 'left' ? -1 : 1);
      media.splice(i, 1); media.splice(j, 0, m);
      media.forEach(function (x, k) { x.sort = k; });
      await save(Promise.all(media.map(function (x) { return sb.from('media').update({ sort: x.sort }).eq('id', x.id); })).then(function (rs) { return rs.find(function (r) { return r.error; }) || {}; }), act === 'first' ? 'Now the first photo.' : 'Moved.');
      renderMedia(j);
    }
  }, true);

  function canvasBlob(c, q) { return new Promise(function (res) { c.toBlob(res, 'image/jpeg', q || 0.84); }); }
  async function preparePhoto(file) {
    try {
      var bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      var k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return { blob: await canvasBlob(c), w: c.width, h: c.height, ext: 'jpg', type: 'image/jpeg' };
    } catch (e) {
      return { blob: file, w: 1200, h: 900, ext: (file.name.split('.').pop() || 'jpg').toLowerCase(), type: file.type || 'image/jpeg' };
    }
  }
  function prepareVideo(file) {
    return new Promise(function (res) {
      var v = document.createElement('video'), done = false;
      var finish = function (o) { if (!done) { done = true; res(o); } };
      v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(file);
      v.onloadedmetadata = function () { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
      v.onseeked = async function () { var c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); finish({ w: v.videoWidth, h: v.videoHeight, poster: await canvasBlob(c, 0.8) }); };
      v.onerror = function () { finish({ w: 720, h: 1280, poster: null }); };
      setTimeout(function () { finish({ w: v.videoWidth || 720, h: v.videoHeight || 1280, poster: null }); }, 10000);
    });
  }
  async function upload(files) {
    files = [].slice.call(files); if (!files.length) return;
    var added = 0;
    for (var f = 0; f < files.length; f++) {
      var file = files[f];
      toast('Uploading ' + (f + 1) + ' of ' + files.length + '…');
      try {
        var isVid = /^video\//.test(file.type), id = uuid();
        var rec = { id: id, kind: isVid ? 'video' : 'photo', caption: '', alt: '', sort: media.length, active: true };
        if (isVid) {
          if (file.size > 50 * 1024 * 1024) throw new Error('it’s over 50 MB');
          var info = await prepareVideo(file), ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
          rec.storage_path = 'uploads/' + id + '.' + ext;
          var up = await sb.storage.from('media').upload(rec.storage_path, file, { contentType: file.type, upsert: true }); if (up.error) throw up.error;
          rec.url = sb.storage.from('media').getPublicUrl(rec.storage_path).data.publicUrl; rec.width = info.w; rec.height = info.h;
          if (info.poster) {
            var pp = rec.storage_path + '.poster.jpg', pu = await sb.storage.from('media').upload(pp, info.poster, { contentType: 'image/jpeg', upsert: true });
            if (!pu.error) rec.poster_url = sb.storage.from('media').getPublicUrl(pp).data.publicUrl;
          }
        } else {
          var ph = await preparePhoto(file);
          rec.storage_path = 'uploads/' + id + '.' + ph.ext;
          var u2 = await sb.storage.from('media').upload(rec.storage_path, ph.blob, { contentType: ph.type, upsert: true }); if (u2.error) throw u2.error;
          rec.url = sb.storage.from('media').getPublicUrl(rec.storage_path).data.publicUrl; rec.width = ph.w; rec.height = ph.h;
        }
        var ins = await sb.from('media').insert(rec).select().single(); if (ins.error) throw ins.error;
        media.push(ins.data); added++;
      } catch (err) { toast(file.name + ' wasn’t added: ' + (err.message || err), true); }
    }
    if (added) { renderMedia(media.length - 1); toast(added === 1 ? 'Added at the end. Tap “Add a caption” to label it.' : added + ' added at the end.'); }
  }
})();
