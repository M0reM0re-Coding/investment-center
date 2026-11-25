// Search: stories, notes, topics, any stock.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// Search across all saved stories (not just the last 3 days) and your notes
async function searchStories(q) {
  const term = q.replace(/[%_,().*"\\]/g, " ").trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const { data, error } = await sb.from("stories").select("*").or(`headline.ilike.${like},what_it_means.ilike.${like},event.ilike.${like}`)
    .order("created_at", { ascending: false }).limit(40);
  if (error) throw error;
  const found = new Map((data || []).map((s) => [s.id, s]));
  const noteIds = [...state.notes].filter(([, n]) => n.toLowerCase().includes(term.toLowerCase())).map(([id]) => id).filter((id) => !found.has(id));
  if (noteIds.length) {
    const r = await sb.from("stories").select("*").in("id", noteIds.slice(0, 30));
    (r.data || []).forEach((s) => found.set(s.id, s));
  }
  found.forEach((s, id) => state.more.set(id, s));
  // World Brief stories too (shown as their own group). Missing table before 008_world.sql = just no world results.
  const w = await sb.from("world_stories").select("*").or(`headline.ilike.${like},why_matters.ilike.${like},country.ilike.${like}`)
    .order("created_at", { ascending: false }).limit(20);
  state.searchWorld = w.error ? [] : w.data || [];
  if (state.searchWorld.length) {   // so a result opens even if it's older than the 2 days World Brief loads
    state.world = state.world || [];
    const have = new Set(state.world.map((x) => x.id));
    state.searchWorld.forEach((x) => { if (!have.has(x.id)) state.world.push({ ...x, _old: true }); });
  }
  return [...found.values()];
}


const typeName = (t) => ({ EQUITY: "Stock", ETF: "ETF", INDEX: "Index", CRYPTOCURRENCY: "Crypto", MUTUALFUND: "Fund" }[t] || t || "");
// Thai stocks come back from Yahoo as PTT.BK; the robot and the rest of the site use plain PTT.
// Thai stocks come back as PTT.BK; ones the robot already knows are stored as plain PTT, others keep .BK so prices still work
const cleanSym = (s) => { const u = String(s || "").toUpperCase(), base = u.replace(/\.BK$/, ""); return CFG.tickers.includes(base) ? base : u; };
const cleanName = (n) => String(n || "").replace(/^[A-Z0-9&.-]+_/, ""); // Yahoo's Thai names: "PTT_PTT" -> "PTT"

// Built-in topics that match what you typed: by name or by one of the robot's keywords ("bitcoin" -> Crypto)
function topicMatches(q) {
  const s = q.trim().toLowerCase(), words = CFG.topic_words || {};
  if (!s) return CFG.topics.map((t) => ({ t, hit: "" }));
  // short searches match from the start of a word only ("ai" finds "AI in finance", not "Thai")
  const fits = (text) => { const x = text.toLowerCase(); return x.split(/[^a-z0-9฀-๿]+/).some((w) => w.startsWith(s)) || (s.length >= 3 && x.includes(s)); };
  return CFG.topics.map((t) => {
    if (fits(t)) return { t, hit: "" };
    const k = (words[t] || []).find(fits);
    return k ? { t, hit: k } : null;
  }).filter(Boolean);
}
function topicRows(q, start = 0) {
  const d = state.draft;
  return topicMatches(q).map(({ t, hit }, i) => {
    const have = d.topics.includes(t);
    return `<div class="row ${have ? "dim" : ""}" style="--i:${start + i}" ${have ? "" : `data-stopic-add="${esc(t)}"`}>
      <span class="sym">#</span><span class="nm">${esc(t)}<small>${hit ? `Matches “${esc(hit)}” · ` : ""}${(CFG.topic_words?.[t] || []).length} keywords the robot watches</small></span>
      <span class="kind t">${have ? "ADDED" : "+ TOPIC"}</span></div>`;
  }).join("");
}
// Empty search box: list every built-in topic, so you can browse them like the old checklist
const viewBrowse = () => `<div class="results"><div class="head">TOPICS</div>${topicRows("")}</div>`;

function viewResults(q, list, note = "") {
  const d = state.draft;
  const topic = q.trim().replace(/\s+/g, " ").slice(0, 40);
  const builtIn = topicMatches(topic);
  let i = builtIn.length;
  const stockRows = note
    ? `<div class="row dim"><span class="sym">…</span><span class="nm">${esc(note)}</span><span></span></div>`
    : list.length
      ? list.map((r) => {
          const sym = cleanSym(r.symbol), have = d.watchlist.includes(sym), full = d.watchlist.length >= MAX_WATCHLIST;
          return `<div class="row ${have || full ? "dim" : ""}" style="--i:${i++}" ${have || full ? "" : `data-add="${esc(sym)}" data-name="${esc(cleanName(r.name))}"`}>
            <span class="sym">${esc(sym)}</span><span class="nm">${esc(cleanName(r.name))}<small>${esc(r.exchange)} · ${esc(typeName(r.type))}</small></span>
            <span class="kind">${have ? "ADDED" : full ? "LIST FULL" : "+ WATCH"}</span></div>`;
        }).join("")
      : `<div class="row dim"><span class="sym">—</span><span class="nm">No stock matches “${esc(topic)}”</span><span></span></div>`;
  const haveT = d.custom_topics.some((t) => t.toLowerCase() === topic.toLowerCase()) || d.topics.includes(topic);
  const fullT = d.custom_topics.length >= MAX_CUSTOM_TOPICS;
  const sameAsBuiltIn = CFG.topics.some((t) => t.toLowerCase() === topic.toLowerCase());
  return `<div class="results">${builtIn.length ? `<div class="head">TOPICS</div>${topicRows(topic)}` : ""}
    <div class="head">STOCKS FOUND ONLINE</div>${stockRows}
    ${sameAsBuiltIn ? "" : `<div class="head">OR FOLLOW AS YOUR OWN TOPIC</div>
    <div class="row ${haveT || fullT ? "dim" : ""}" style="--i:${i}" ${haveT || fullT ? "" : `data-topic-add="${esc(topic)}"`}>
      <span class="sym">#</span><span class="nm">${esc(topic)}<small>${fullT && !haveT ? `You already follow ${MAX_CUSTOM_TOPICS} of your own topics. Remove one first.` : "The robot searches the news for this exact phrase"}</small></span>
      <span class="kind t">${haveT ? "ADDED" : "+ TOPIC"}</span></div>`}</div>`;
}

let searchTimer = null, searchSeq = 0;
async function runSearch(q) {
  const seq = ++searchSeq;
  const res = document.getElementById("res");
  if (!res) return;
  res.innerHTML = viewResults(q, [], "Searching…");
  const { data, error } = await sb.rpc("search_symbols", { q });
  if (seq !== searchSeq || !document.getElementById("res")) return; // a newer search started
  document.getElementById("res").innerHTML = viewResults(q, Array.isArray(data) ? data : [],
    error ? "Stock search isn't switched on yet: run supabase/003_search.sql in Supabase." : "");
}

