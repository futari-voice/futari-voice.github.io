// テスト用の「にせデータベース」。本物の Firestore（エミュレーター）が使えない場所で、画面の動きをためすためのもの。
// きまり（firestore.rules）はためさない。きまりは CI の本物のエミュレーターでためす。
const CLIENT = `(() => {
  const cbs = new Map();
  window.__fvDbPush = (id, data) => { const c = cbs.get(id); if (c) c(data); };
  const call = (op, a) => window.__fvDb(op, JSON.parse(JSON.stringify(a)));
  const W = (args, cb) => {
    let id = null, dead = false;
    call('watch', args).then(r => { if (dead){ call('unwatch', {id:r.id}); return; } id = r.id; cbs.set(id, cb); cb(r.data); });
    return () => { dead = true; if (id){ cbs.delete(id); call('unwatch', {id}); } };
  };
  window.__fvFakeDB = {
    get: p => call('get', {path:p}),
    set: (p, d, merge) => call('set', {path:p, data:d, merge:!!merge}),
    del: p => call('del', {path:p}),
    batch: ops => call('batch', {ops}),
    watch: (p, cb) => W({kind:'doc', path:p}, cb),
    query: (c, wh, cb, onErr, opt) => W({kind:'query', coll:c, wh, opt}, cb),
    claim: (name, uid, old) => call('claim', {name, uid, old}),
  };
})();`;

export function createFakeDB(){
  const docs = new Map();
  const watchers = new Map();
  let seq = 0;
  const conv = v => v && typeof v === 'object' && v.__now ? Date.now() : Array.isArray(v) ? v.map(conv) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)])) : v;
  const put = (p, d, merge) => docs.set(p, merge && docs.has(p) ? Object.assign({}, docs.get(p), conv(d)) : conv(d));
  const parent = p => p.split('/').slice(0, -1).join('/');
  const idOf = p => p.split('/').pop();
  const match = (coll, wh, p) => {
    if (parent(p) !== coll) return false;
    const d = docs.get(p);
    for (const [f, o, v] of wh){
      const x = f === '__id' ? idOf(p) : d[f];
      if (o === '==' && x !== v) return false;
      if (o === 'array-contains' && !(Array.isArray(x) && x.includes(v))) return false;
      if (o === 'in' && !v.includes(x)) return false;
    }
    return true;
  };
  const result = w => {
    if (w.kind === 'doc') return docs.has(w.path) ? docs.get(w.path) : null;
    let list = [...docs.keys()].filter(p => match(w.coll, w.wh || [], p)).map(p => Object.assign({}, docs.get(p), {id:idOf(p)}));
    if (w.opt && w.opt.last){ list.sort((a, b) => (a[w.opt.order] || 0) - (b[w.opt.order] || 0)); list = list.slice(-w.opt.last); }
    return list;
  };
  const notify = () => {
    for (const [id, w] of watchers){
      const r = JSON.stringify(result(w));
      if (r === w.last) continue;
      w.last = r;
      w.page.evaluate(([i, x]) => window.__fvDbPush && window.__fvDbPush(i, JSON.parse(x)), [id, r]).catch(() => watchers.delete(id));
    }
  };
  async function handle(page, op, a){
    switch (op){
      case 'get': return docs.has(a.path) ? docs.get(a.path) : null;
      case 'set': put(a.path, a.data, a.merge); notify(); return true;
      case 'del': docs.delete(a.path); notify(); return true;
      case 'batch': for (const [o, p, d, m] of a.ops){ if (o === 'del') docs.delete(p); else put(p, d, m); } notify(); return true;
      case 'claim': {
        const k = 'unames/' + a.name, cur = docs.get(k);
        if (cur && cur.uid !== a.uid) return false;
        if (!cur) docs.set(k, {uid:a.uid});
        if (a.old && a.old !== a.name) docs.delete('unames/' + a.old);
        put('users/' + a.uid, {uname:a.name}, true); notify(); return true;
      }
      case 'watch': { const id = ++seq, w = {page, kind:a.kind, path:a.path, coll:a.coll, wh:a.wh, opt:a.opt}; watchers.set(id, w); const r = result(w); w.last = JSON.stringify(r); return {id, data:r}; }
      case 'unwatch': watchers.delete(a.id); return true;
    }
    return null;
  }
  return {
    docs,
    async attach(ctx){ await ctx.exposeBinding('__fvDb', (src, op, a) => handle(src.page, op, a)); await ctx.addInitScript(CLIENT); },
  };
}
