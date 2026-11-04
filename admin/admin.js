/* Texas 6 BBQ admin portal. Talks to Supabase directly; row level security decides what an admin may change. */
(function () {
  'use strict';
  var CFG = window.T6_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var abs = function (u) { return !u ? '' : /^(https?:|blob:|data:)/.test(u) ? u : '../' + u.replace(/^\.?\//, ''); };
  var uuid = function () { return (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })); };

  var toastTimer;
  function toast(msg, isErr) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, isErr ? 6000 : 2600);
  }
  // Two-tap delete: the first tap arms the button, the second within 4 s confirms.
  function armed(btn, label) {
    if (btn.classList.contains('armed')) return true;
    var orig = btn.textContent; btn.classList.add('armed'); btn.textContent = label || 'Tap again to delete';
    setTimeout(function () { btn.classList.remove('armed'); btn.textContent = orig; }, 4000);
    return false;
  }

  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey || !window.supabase) {
    $('cfgWarn').hidden = false; $('liBtn').disabled = true; return;
  }
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);

  /* ---------- Sign in ---------- */
  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    $('liErr').textContent = ''; $('liBtn').disabled = true; $('liBtn').textContent = 'Signing in…';
    var r = await sb.auth.signInWithPassword({ email: CFG.adminEmail || 'admin@texas6bbq.site', password: $('liPass').value });
    $('liBtn').disabled = false; $('liBtn').textContent = 'Sign in';
    if (r.error) { $('liErr').textContent = r.error.message === 'Invalid login credentials' ? 'That password isn’t right. Check it and try again.' : r.error.message; return; }
    enter();
  });
  $('signOut').addEventListener('click', async function () {
    if (dirty.menu || dirty.text) { if (!armed($('signOut'), 'Unsaved! Tap again')) return; }
    await sb.auth.signOut(); location.reload();
  });

  async function enter() {
    var ok = await sb.rpc('is_admin');
    if (ok.error || ok.data !== true) {
      await sb.auth.signOut();
      $('loginView').hidden = false; $('appView').hidden = true;
      $('liErr').textContent = 'That login doesn’t have admin access.';
      return;
    }
    $('loginView').hidden = true; $('appView').hidden = false;
    loadMenu(); loadMedia(); loadText(); loadFacebook();
  }
  sb.auth.getSession().then(function (r) { if (r.data.session) enter(); });

  /* ---------- Tabs ---------- */
  var tabs = [].slice.call(document.querySelectorAll('.tab'));
  function showTab(name) {
    tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.tab === name)); });
    document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    try { localStorage.setItem('t6tab', name); } catch (e) {}
    window.scrollTo(0, 0);
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { showTab(t.dataset.tab); }); });
  try { var last = localStorage.getItem('t6tab'); if (last && document.querySelector('[data-tab="' + last + '"]')) showTab(last); } catch (e) {}

  /* ---------- Save bar (menu + wording) ---------- */
  var dirty = { menu: false, text: false };
  function refreshBar() {
    var n = (dirty.menu ? 1 : 0) + (dirty.text ? 1 : 0);
    $('saveBar').classList.toggle('show', n > 0);
    $('saveMsg').textContent = dirty.menu && dirty.text ? 'Unsaved menu and wording changes' : dirty.menu ? 'Unsaved menu changes' : 'Unsaved wording changes';
  }
  addEventListener('beforeunload', function (e) { if (dirty.menu || dirty.text) { e.preventDefault(); e.returnValue = ''; } });
  $('discard').addEventListener('click', function () { if (dirty.menu) loadMenu(); if (dirty.text) loadText(); });
  $('saveBtn').addEventListener('click', async function () {
    var b = $('saveBtn'); b.disabled = true; b.textContent = 'Saving…';
    try {
      if (dirty.menu) await saveMenu();
      if (dirty.text) await saveText();
      toast('Saved. The live site shows it now.');
    } catch (err) { toast('Couldn’t save: ' + (err.message || err) + '. Your edits are still here; try again.', true); }
    b.disabled = false; b.textContent = 'Save changes';
  });

  /* ---------- Menu ---------- */
  var menu = [], removed = [];
  var num = function (v) { v = String(v).replace(/[$,\s]/g, ''); return v === '' ? null : Number(v); };
  var showNum = function (v) { return v === null || v === undefined ? '' : String(Number(v)); };

  async function loadMenu() {
    var r = await sb.from('menu_items').select('*').order('category').order('sort');
    if (r.error) return toast('Couldn’t load the menu: ' + r.error.message, true);
    menu = r.data; removed = []; dirty.menu = false; refreshBar(); renderMenu();
  }
  function moneyField(i, key, label) {
    return '<label class="f"><span>' + label + '</span><div class="money"><input inputmode="decimal" data-i="' + i + '" data-k="' + key + '" value="' + esc(showNum(menu[i][key])) + '"></div></label>';
  }
  function textField(i, key, label, ph, cls) {
    return '<label class="f' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><input data-i="' + i + '" data-k="' + key + '" value="' + esc(menu[i][key] || '') + '" placeholder="' + esc(ph || '') + '"></label>';
  }
  function renderMenu() {
    ['special', 'meat', 'side'].forEach(function (cat) {
      var list = $(cat + 'List');
      if (!list) return;
      var idx = menu.map(function (m, i) { return i; }).filter(function (i) { return menu[i].category === cat; });
      if (!idx.length) { list.innerHTML = '<div class="empty">No ' + ({ meat: 'meats', side: 'sides', special: 'specials right now' })[cat] + ' yet.</div>'; return; }
      list.innerHTML = idx.map(function (i, n) {
        var m = menu[i];
        var fields = cat === 'meat'
          ? '<div class="item-grid">' + moneyField(i, 'whole_price', 'Whole price') + textField(i, 'whole_note', 'Whole size', 'e.g. 10+ lbs') + moneyField(i, 'lb_price', 'Per lb price') +
            moneyField(i, 'half_price', 'Half price') + textField(i, 'half_note', 'Half size', 'e.g. half rack', 'wide') + '</div>'
          : '<div class="item-grid sides">' + moneyField(i, 'whole_price', cat === 'special' ? 'Price' : 'Pan price') + textField(i, 'whole_note', 'Note (optional)', 'e.g. serves 15') + '</div>';
        return '<div class="card item' + (m.active ? '' : ' off') + '">' +
          '<div class="item-top"><input aria-label="Item name" data-i="' + i + '" data-k="name" value="' + esc(m.name) + '"><span class="pill ' + (m.active ? 'on' : 'off') + '">' + (m.active ? 'On menu' : 'Hidden') + '</span></div>' +
          fields +
          '<div class="item-tools"><div class="left"><label class="toggle"><input type="checkbox" data-i="' + i + '" data-k="active"' + (m.active ? ' checked' : '') + '> Show on site</label></div>' +
          '<div class="right"><button class="btn small" type="button" data-move="-1" data-i="' + i + '"' + (n === 0 ? ' disabled' : '') + ' aria-label="Move up">↑</button>' +
          '<button class="btn small" type="button" data-move="1" data-i="' + i + '"' + (n === idx.length - 1 ? ' disabled' : '') + ' aria-label="Move down">↓</button>' +
          '<button class="btn small danger" type="button" data-del="' + i + '">Delete</button></div></div></div>';
      }).join('');
    });
  }
  function markMenu() { dirty.menu = true; refreshBar(); }
  ['specialList', 'meatList', 'sideList'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', function (e) {
      var t = e.target; if (!t.dataset.k) return;
      var m = menu[+t.dataset.i], k = t.dataset.k;
      if (k === 'active') { m.active = t.checked; markMenu(); renderMenu(); return; }
      m[k] = /price/.test(k) ? num(t.value) : t.value;
      if (/price/.test(k) && t.value !== '' && isNaN(m[k])) { t.classList.add('changed'); return; }
      t.classList.add('changed'); markMenu();
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.move) {
        var i = +b.dataset.i, cat = menu[i].category;
        var same = menu.map(function (m, j) { return j; }).filter(function (j) { return menu[j].category === cat; });
        var p = same.indexOf(i), q = p + Number(b.dataset.move); if (q < 0 || q >= same.length) return;
        var tmp = menu[same[p]]; menu[same[p]] = menu[same[q]]; menu[same[q]] = tmp; markMenu(); renderMenu();
      } else if (b.dataset.del) {
        if (!armed(b)) return;
        var d = menu.splice(+b.dataset.del, 1)[0]; if (d.id) removed.push(d.id); markMenu(); renderMenu();
      }
    });
  });
  document.querySelectorAll('[data-add]').forEach(function (b) {
    b.addEventListener('click', function () {
      menu.push({ id: uuid(), category: b.dataset.add, name: ({ meat: 'New meat', side: 'New side', special: 'New special' })[b.dataset.add], whole_price: null, whole_note: '', half_price: null, half_note: '', lb_price: null, active: true, _new: true });
      markMenu(); renderMenu();
      var list = $(b.dataset.add + 'List'); var inp = list.querySelectorAll('.item-top input'); inp[inp.length - 1].select();
    });
  });
  async function saveMenu() {
    for (var i = 0; i < menu.length; i++) {
      var m = menu[i];
      if (!String(m.name || '').trim()) throw new Error('every item needs a name');
      ['whole_price', 'half_price', 'lb_price'].forEach(function (k) { if (m[k] !== null && isNaN(m[k])) throw new Error('“' + m.name + '” has a price that isn’t a number'); });
    }
    var sorts = { meat: 0, side: 0, special: 0 };
    var rows = menu.map(function (m) {
      return { id: m.id, category: m.category, name: m.name.trim(), whole_price: m.whole_price, whole_note: m.whole_note || '', half_price: m.half_price, half_note: m.half_note || '', lb_price: m.lb_price, active: m.active, sort: sorts[m.category]++ };
    });
    if (removed.length) { var d = await sb.from('menu_items').delete().in('id', removed); if (d.error) throw d.error; }
    var u = await sb.from('menu_items').upsert(rows); if (u.error) throw u.error;
    await loadMenu();
  }

  /* ---------- Wording ---------- */
  var texts = [];
  async function loadText() {
    var r = await sb.from('site_text').select('*').order('sort');
    if (r.error) return toast('Couldn’t load wording: ' + r.error.message, true);
    texts = r.data.map(function (t) { return Object.assign({}, t, { orig: t.value }); });
    dirty.text = false; refreshBar();
    var groups = {}, order = [];
    texts.forEach(function (t, i) { if (!groups[t.section]) { groups[t.section] = []; order.push(t.section); } groups[t.section].push(i); });
    $('textGroups').innerHTML = order.map(function (sec) {
      return '<div class="group"><span class="label">' + esc(sec) + '</span><div class="card stack">' + groups[sec].map(function (i) {
        var t = texts[i], id = 'tx_' + t.key;
        var input = t.multiline ? '<textarea id="' + id + '" data-i="' + i + '">' + esc(t.value) + '</textarea>' : '<input id="' + id + '" data-i="' + i + '" value="' + esc(t.value) + '">';
        return '<label class="f" for="' + id + '"><span>' + esc(t.label) + '</span>' + input + '</label>';
      }).join('') + '</div></div>';
    }).join('');
  }
  $('textGroups').addEventListener('input', function (e) {
    var t = texts[+e.target.dataset.i]; if (!t) return;
    t.value = e.target.value; e.target.classList.toggle('changed', t.value !== t.orig);
    dirty.text = texts.some(function (x) { return x.value !== x.orig; }); refreshBar();
  });
  async function saveText() {
    var changed = texts.filter(function (t) { return t.value !== t.orig; });
    for (var i = 0; i < changed.length; i++) {
      var r = await sb.from('site_text').update({ value: changed[i].value }).eq('key', changed[i].key);
      if (r.error) throw r.error;
    }
    await loadText();
  }

  /* ---------- Photos & videos ---------- */
  var media = [];
  async function loadMedia() {
    var r = await sb.from('media').select('*').order('sort').order('created_at');
    if (r.error) return toast('Couldn’t load photos: ' + r.error.message, true);
    media = r.data; renderMedia();
  }
  function renderMedia() {
    var g = $('mediaGrid');
    if (!media.length) { g.innerHTML = '<div class="empty">No photos yet. Add some above.</div>'; return; }
    g.innerHTML = media.map(function (m, i) {
      var thumb = m.kind === 'video'
        ? '<video src="' + esc(abs(m.url)) + '"' + (m.poster_url ? ' poster="' + esc(abs(m.poster_url)) + '"' : '') + ' muted playsinline preload="metadata" controls></video>'
        : '<img src="' + esc(abs(m.url)) + '" alt="" loading="lazy">';
      return '<div class="mcard' + (m.active ? '' : ' off') + '" data-id="' + m.id + '">' +
        '<div class="thumb">' + thumb + '<span class="n">' + (i + 1) + '</span>' + (m.kind === 'video' ? '<span class="kind">Video</span>' : '') + '</div>' +
        '<div class="mbody"><label class="f"><span>Caption</span><input data-f="caption" data-i="' + i + '" value="' + esc(m.caption) + '" placeholder="Shown under the photo"></label>' +
        '<label class="f"><span>Description for screen readers</span><input data-f="alt" data-i="' + i + '" value="' + esc(m.alt) + '" placeholder="What’s in the picture"></label>' +
        '<label class="toggle"><input type="checkbox" data-f="active" data-i="' + i + '"' + (m.active ? ' checked' : '') + '> Show on site</label></div>' +
        '<div class="mtools"><div style="display:flex;gap:6px"><button class="btn small" type="button" data-mv="-1" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move earlier">←</button>' +
        '<button class="btn small" type="button" data-mv="1" data-i="' + i + '"' + (i === media.length - 1 ? ' disabled' : '') + ' aria-label="Move later">→</button>' +
        (i > 0 ? '<button class="btn small" type="button" data-first="' + i + '">Make first</button>' : '') + '</div>' +
        '<button class="btn small danger" type="button" data-rm="' + i + '">Delete</button></div></div>';
    }).join('');
  }
  async function saveOrder() {
    var rows = media.map(function (m, i) { return { id: m.id, kind: m.kind, url: m.url, sort: i }; });
    var r = await sb.from('media').upsert(rows);
    if (r.error) { toast('Couldn’t reorder: ' + r.error.message, true); return loadMedia(); }
    toast('Order saved.');
  }
  $('mediaGrid').addEventListener('change', async function (e) {
    var t = e.target, m = media[+t.dataset.i]; if (!m || !t.dataset.f) return;
    var patch = {}; patch[t.dataset.f] = t.dataset.f === 'active' ? t.checked : t.value;
    var r = await sb.from('media').update(patch).eq('id', m.id);
    if (r.error) return toast('Couldn’t save: ' + r.error.message, true);
    Object.assign(m, patch); if (t.dataset.f === 'active') renderMedia();
    toast(t.dataset.f === 'active' ? (m.active ? 'Showing on the site.' : 'Hidden from the site.') : 'Saved.');
  });
  $('mediaGrid').addEventListener('click', async function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mv || b.dataset.first) {
      var i = +(b.dataset.i || b.dataset.first), j = b.dataset.first ? 0 : i + Number(b.dataset.mv);
      var item = media.splice(i, 1)[0]; media.splice(j, 0, item); renderMedia(); saveOrder();
    } else if (b.dataset.rm) {
      if (!armed(b)) return;
      var m = media[+b.dataset.rm];
      var r = await sb.from('media').delete().eq('id', m.id);
      if (r.error) return toast('Couldn’t delete: ' + r.error.message, true);
      if (m.storage_path) sb.storage.from('media').remove([m.storage_path, m.storage_path + '.poster.jpg']);
      media.splice(+b.dataset.rm, 1); renderMedia(); toast('Deleted.');
    }
  });

  // Uploads: photos are resized to 1600 px on the long side; videos get a poster frame.
  function canvasBlob(c, q) { return new Promise(function (res) { c.toBlob(res, 'image/jpeg', q || 0.84); }); }
  async function preparePhoto(file) {
    try {
      var bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      var k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return { blob: await canvasBlob(c), w: c.width, h: c.height, ext: 'jpg', type: 'image/jpeg' };
    } catch (e) {
      var dims = await new Promise(function (res) { var im = new Image(); im.onload = function () { res([im.naturalWidth, im.naturalHeight]); }; im.onerror = function () { res([1200, 900]); }; im.src = URL.createObjectURL(file); });
      return { blob: file, w: dims[0], h: dims[1], ext: (file.name.split('.').pop() || 'jpg').toLowerCase(), type: file.type || 'image/jpeg' };
    }
  }
  function prepareVideo(file) {
    return new Promise(function (res) {
      var v = document.createElement('video'), done = false;
      var finish = function (out) { if (!done) { done = true; res(out); } };
      v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(file);
      v.onloadedmetadata = function () { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
      v.onseeked = async function () {
        var c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        finish({ w: v.videoWidth, h: v.videoHeight, poster: await canvasBlob(c, 0.8) });
      };
      v.onerror = function () { finish({ w: 720, h: 1280, poster: null }); };
      setTimeout(function () { finish({ w: v.videoWidth || 720, h: v.videoHeight || 1280, poster: null }); }, 10000);
    });
  }
  async function upload(files) {
    files = [].slice.call(files); if (!files.length) return;
    var prog = $('upProg');
    for (var f = 0; f < files.length; f++) {
      var file = files[f], row = document.createElement('div'); row.textContent = 'Uploading ' + file.name + '…'; prog.appendChild(row);
      try {
        var isVid = /^video\//.test(file.type);
        var id = uuid(), rec = { id: id, kind: isVid ? 'video' : 'photo', caption: '', alt: '', sort: media.length, active: true };
        if (isVid) {
          if (file.size > 50 * 1024 * 1024) throw new Error('it’s over 50 MB; trim it or upload a shorter clip');
          var info = await prepareVideo(file), ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
          rec.storage_path = 'uploads/' + id + '.' + ext;
          var up = await sb.storage.from('media').upload(rec.storage_path, file, { contentType: file.type, upsert: true }); if (up.error) throw up.error;
          rec.url = sb.storage.from('media').getPublicUrl(rec.storage_path).data.publicUrl; rec.width = info.w; rec.height = info.h;
          if (info.poster) {
            var pp = rec.storage_path + '.poster.jpg';
            var pu = await sb.storage.from('media').upload(pp, info.poster, { contentType: 'image/jpeg', upsert: true });
            if (!pu.error) rec.poster_url = sb.storage.from('media').getPublicUrl(pp).data.publicUrl;
          }
        } else {
          var ph = await preparePhoto(file);
          rec.storage_path = 'uploads/' + id + '.' + ph.ext;
          var u2 = await sb.storage.from('media').upload(rec.storage_path, ph.blob, { contentType: ph.type, upsert: true }); if (u2.error) throw u2.error;
          rec.url = sb.storage.from('media').getPublicUrl(rec.storage_path).data.publicUrl; rec.width = ph.w; rec.height = ph.h;
        }
        var ins = await sb.from('media').insert(rec).select().single(); if (ins.error) throw ins.error;
        media.push(ins.data); renderMedia();
        row.textContent = '✓ ' + file.name + ' added at the end. Add a caption below.';
      } catch (err) {
        row.textContent = '✕ ' + file.name + ' wasn’t added: ' + (err.message || err); row.style.color = 'var(--red)';
      }
    }
    setTimeout(function () { prog.innerHTML = ''; }, 8000);
  }
  $('fileIn').addEventListener('change', function (e) { upload(e.target.files); e.target.value = ''; });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { upload(e.dataTransfer.files); });

  /* ---------- Facebook ---------- */
  async function loadFacebook() {
    var log = await sb.from('sync_log').select('*').order('ran_at', { ascending: false }).limit(1);
    var posts = await sb.from('fb_posts').select('*').order('created_time', { ascending: false }).limit(30);
    var last = log.data && log.data[0], list = posts.data || [];
    var connected = last && last.ok;
    $('fbStatus').classList.toggle('ok', !!connected);
    $('fbStatusTitle').textContent = connected ? 'Connected. Posts sync every hour.' : list.length ? 'Last sync had a problem' : 'Showing Facebook’s feed widget';
    $('fbStatusText').textContent = last ? (last.message + ' · ' + new Date(last.ran_at).toLocaleString()) : 'The page isn’t connected for automatic syncing yet. The site still shows new posts through Facebook’s widget.';
    $('fbSetup').hidden = !!connected;
    $('postList').innerHTML = list.length ? list.map(function (p) {
      return '<div class="card post">' + (p.image_url ? '<img src="' + esc(p.image_url) + '" alt="">' : '<img alt="">') +
        '<div><time>' + new Date(p.created_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</time><p>' + esc(p.message || '(photo only)') + '</p></div>' +
        '<label class="toggle"><input type="checkbox" data-post="' + esc(p.id) + '"' + (p.hidden ? '' : ' checked') + '> Show</label></div>';
    }).join('') : '<div class="empty">No posts synced yet.</div>';
  }
  $('postList').addEventListener('change', async function (e) {
    var id = e.target.dataset.post; if (!id) return;
    var r = await sb.from('fb_posts').update({ hidden: !e.target.checked }).eq('id', id);
    toast(r.error ? 'Couldn’t save: ' + r.error.message : e.target.checked ? 'Post showing on the site.' : 'Post hidden from the site.', !!r.error);
  });
  $('syncNow').addEventListener('click', async function () {
    var b = $('syncNow'); b.disabled = true; b.textContent = 'Syncing…';
    var r = await sb.functions.invoke('fb-sync', { body: {} });
    b.disabled = false; b.textContent = 'Sync now';
    var msg = r.data && r.data.message ? r.data.message : r.error ? r.error.message : 'Done.';
    toast(msg, !(r.data && r.data.ok)); loadFacebook();
  });

  /* ---------- Admins ---------- */
  async function callAdmins(body) {
    var r = await sb.functions.invoke('manage-admins', { body: body });
    if (r.error) {
      var detail = '';
      try { detail = (await r.error.context.json()).error; } catch (e) {}
      throw new Error(detail || r.error.message);
    }
    return r.data;
  }
  async function loadAdmins() {
    try {
      var d = await callAdmins({ action: 'list' });
      $('adminList').innerHTML = d.admins.map(function (a) {
        var me = a.email.toLowerCase() === d.me;
        return '<div class="arow"><span><strong>' + esc(a.email) + '</strong>' + (me ? ' <span class="pill on">You</span>' : '') + '</span>' +
          (me ? '' : '<span style="display:flex;gap:6px"><button class="btn small" type="button" data-pw="' + esc(a.email) + '">Set password</button><button class="btn small danger" type="button" data-rmadmin="' + esc(a.email) + '">Remove</button></span>') + '</div>';
      }).join('');
    } catch (err) { $('adminList').innerHTML = '<p class="hint">Couldn’t load admins: ' + esc(err.message) + '</p>'; }
  }
  $('adminList').addEventListener('click', async function (e) {
    var b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.rmadmin) { if (!armed(b, 'Tap again to remove')) return; toast((await callAdmins({ action: 'remove', email: b.dataset.rmadmin })).message); loadAdmins(); }
      if (b.dataset.pw) {
        var row = b.closest('.arow');
        if (row.querySelector('form')) return;
        var f = document.createElement('form'); f.className = 'two'; f.style.width = '100%';
        f.innerHTML = '<input type="text" placeholder="New password, 8+ characters" aria-label="New password"><button class="btn small primary" type="submit">Save password</button>';
        row.appendChild(f); f.querySelector('input').focus();
        f.addEventListener('submit', async function (ev) {
          ev.preventDefault();
          try { toast((await callAdmins({ action: 'password', email: b.dataset.pw, password: f.querySelector('input').value })).message); f.remove(); }
          catch (err) { toast(err.message, true); }
        });
      }
    } catch (err) { toast(err.message, true); }
  });
  $('addAdmin').addEventListener('submit', async function (e) {
    e.preventDefault();
    try { toast((await callAdmins({ action: 'add', email: $('aaEmail').value, password: $('aaPass').value })).message); $('aaEmail').value = ''; $('aaPass').value = ''; loadAdmins(); }
    catch (err) { toast(err.message, true); }
  });
  $('myPass').addEventListener('submit', async function (e) {
    e.preventDefault();
    var p = $('mpPass').value;
    if (p.length < 8) return toast('Use at least 8 characters.', true);
    var r = await sb.auth.updateUser({ password: p });
    toast(r.error ? r.error.message : 'Admin password changed. Share the new one with Casey and Jammie.', !!r.error); if (!r.error) $('mpPass').value = '';
  });
})();
