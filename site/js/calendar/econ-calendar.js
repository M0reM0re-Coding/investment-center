// Economic calendar (#/econ) + released results.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

// ---------- Forex Factory economic calendar (design round 32 B: box, C: "next up" strip) ----------
const ECONF = { hm: "High + Medium", h: "High only", usd: "USD only" };
const econFilter = () => (ECONF[lsGet("ic_econf")] ? lsGet("ic_econf") : "hm");
const untilTxt = (at) => {
  const m = Math.round((new Date(at) - Date.now()) / 6e4);
  if (m < 60) return `in ${Math.max(1, m)} min`;
  if (m < 24 * 60) return `in ${Math.round(m / 60)} h`;
  const x = new Date(at); return `${wkTxt(x)} ${hhmm(x)}`;
};
// One Forex Factory row: time · currency · impact · event · Actual · Forecast · Previous
function econRow(e, next) {
  const x = new Date(e.at), past = x < Date.now(), nx = e === next;
  const act = e.actual ? `<span class="n a ${resCls(e.result)}">${esc(e.actual)}</span>` : past && (e.forecast || e.previous) ? `<span class="n a">${ffLink(e, "↗")}</span>` : `<span class="n a wait">—</span>`;
  return `<div class="erow${past && !e.actual ? " past" : ""}${nx ? " next" : ""}"><span class="tm tnum">${hhmm(x)}</span><span class="cc">${esc(e.currency)}</span><i class="dot ${e.impact === "High" ? "H" : "M"}" title="${esc(e.impact)} impact"></i>
    <span class="et"><b>${esc(e.title)}</b>${nx ? `<em>NEXT · ${untilTxt(e.at)}</em>` : ""}</span>${act}<span class="n tnum">${esc(e.forecast || "")}</span><span class="n tnum">${esc(e.previous || "")}</span></div>`;
}
const econKeep = () => ({ hm: (e) => e.impact === "High" || e.impact === "Medium", h: (e) => e.impact === "High",
  usd: (e) => e.currency === "USD" && (e.impact === "High" || e.impact === "Medium") }[econFilter()]);
const econChips = () => `<div class="echips">${Object.entries(ECONF).map(([k, l]) => `<button class="${k === econFilter() ? "on" : ""}" data-econf="${k}">${l}</button>`).join("")}</div>`;
const econHead = `<div class="ehead"><span>TIME</span><span></span><span></span><span>EVENT</span><span>ACTUAL</span><span>FCST</span><span>PREV</span></div>`;
function econPanel() {
  const keep = econKeep(), t0 = today0(), now = Date.now();
  const today = (state.econ || []).filter((e) => isoDay(new Date(e.at)) === isoDay(t0) && keep(e)).sort((a, b) => (a.at < b.at ? -1 : 1));
  const next = (state.econ || []).filter((e) => keep(e) && new Date(e.at) >= now).sort((a, b) => (a.at < b.at ? -1 : 1))[0];
  const body = !state.econ.length ? `<p class="note" style="margin-top:10px">No calendar yet. It arrives with the robot's next run (every 3 hours).</p>`
    : today.length ? `<div class="eday today">TODAY · ${wkTxt(t0).toUpperCase()} ${t0.getDate()}</div>${econHead}${today.map((e) => econRow(e, next)).join("")}`
    : `<p class="note" style="margin-top:10px">Nothing today.${next ? ` Next: <b>${esc(next.currency)} ${esc(next.title)}</b>, ${wkTxt(new Date(next.at))} ${hhmm(new Date(next.at))}.` : ""}</p>`;
  return `<div class="calp econp a" data-ecal><div class="mh"><h2>Economic calendar</h2><a href="#/econ">Full calendar →</a></div>${body}
    <p class="esrc">Forex Factory · Bangkok time · Actual: US from FRED, others ↗ Forex Factory · green = better than forecast for that currency</p></div>`;
}
// ---------- Round 35: released results. US numbers from FRED (robot/econ_actuals.py); others link to Forex Factory ----------
const RES_TXT = { better: "BETTER THAN EXPECTED", worse: "WORSE THAN EXPECTED", inline: "AS EXPECTED" };
const RES_SHORT = { better: "BETTER", worse: "WORSE", inline: "AS EXPECTED" };
const resCls = (r) => ({ better: "good", worse: "bad", inline: "inl" }[r] || "");
const released = (e) => new Date(e.at) <= Date.now();
const ffLink = (e, txt = "Result ↗") => (e.url ? `<a class="ffl" href="${esc(e.url)}" target="_blank" rel="noopener" title="See the result on Forex Factory">${txt}</a>` : "—");
// A: "Just released" cards on My News: High/Medium events released in the last 6 hours (big card = the newest High one)
function econCards() {
  const list = (state.econ || []).filter((e) => (e.impact === "High" || e.impact === "Medium") && released(e) && hoursAgo(e.at) <= 6 && (e.forecast || e.previous || e.actual))
    .sort((a, b) => (a.impact === "High") - (b.impact === "High") || (a.at < b.at ? -1 : 1)).reverse();
  if (!list.length) return "";
  const [h, ...more] = list[0].impact === "High" ? list : [null, ...list];
  const big = h ? `<div class="ear eres ${resCls(h.result)}"><div class="hd"><span class="ccb">${esc(h.currency)}</span><div class="tt"><b>${esc(h.title)}</b>
      <small>Released ${hhmm(new Date(h.at))} · ${agoAt(h.at)} · High impact</small></div>${h.result ? `<span class="vd ${resCls(h.result)}">${RES_TXT[h.result]}</span>` : ""}</div>
      <div class="nums"><div><small>ACTUAL</small><b class="tnum ${resCls(h.result)}">${h.actual ? esc(h.actual) : ffLink(h)}</b></div><div><small>FORECAST</small><b class="tnum">${esc(h.forecast || "—")}</b></div><div><small>PREVIOUS</small><b class="tnum">${esc(h.previous || "—")}</b></div></div>
      <div class="ft">${h.actual ? "Actual: FRED (St. Louis Fed) · " : "The actual is on Forex Factory · "}Forecast and previous: Forex Factory${h.url ? ` · <a href="${esc(h.url)}" target="_blank" rel="noopener">Forex Factory page ↗</a>` : ""}</div></div>` : "";
  const small = more.slice(0, 4).map((e) => `<div class="ear2"><i class="dot ${e.impact === "High" ? "H" : "M"}"></i><b>${esc(e.currency)}</b><span>${esc(e.title)} · ${e.actual
      ? `<b class="${resCls(e.result)}">${esc(e.actual)}</b> vs ${esc(e.forecast || "—")}` : `F ${esc(e.forecast || "—")} · ${ffLink(e)}`}</span>${e.result ? `<span class="vd ${resCls(e.result)}">${RES_SHORT[e.result]}</span>` : ""}</div>`).join("");
  return `<div class="earns econres a${big ? "" : " only-small"}">${big}${small ? `<div class="ear2s">${small}</div>` : ""}</div>`;
}

// C: dark strip under the brief bar: the next high-impact release with a countdown, then the next two
function econStrip() {
  const now = Date.now(), up = (state.econ || []).filter((e) => new Date(e.at) >= now);
  const hi = up.filter((e) => e.impact === "High"), list = (hi.length >= 3 ? hi : [...hi, ...up.filter((e) => e.impact === "Medium")]
    .sort((a, b) => (a.at < b.at ? -1 : 1))).slice(0, 3);
  const out = (state.econ || []).filter((e) => e.impact === "High" && released(e) && hoursAgo(e.at) <= 2 && (e.forecast || e.previous || e.actual)).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  if (!list.length && !out) return "";
  const just = out ? `<div class="lab">JUST<br>OUT</div><div class="ei jout"><b><i class="dot H"></i>${esc(out.currency)} ${esc(out.title)}</b><small>${out.actual
      ? `<span class="${resCls(out.result) === "good" ? "g" : resCls(out.result) === "bad" ? "r" : ""}">${esc(out.actual)}</span> vs ${esc(out.forecast || "—")} forecast` : `F ${esc(out.forecast || "—")} · ${ffLink(out)}`} · ${agoAt(out.at)}</small></div>` : "";
  if (!list.length) return `<div class="estrip a">${just}</div>`;
  return `<div class="estrip a" data-sig="${esc((out ? out.at + (out.actual || "") : "") + list.map((e) => e.at + e.title + untilTxt(e.at)).join("|"))}">${just}<div class="lab${out ? " sep" : ""}">NEXT<br>UP</div>${list.slice(0, out ? 2 : 3).map((e, k) => {
    const x = new Date(e.at);
    return `<div class="ei${k === 0 ? " first" : ""}"><b><i class="dot ${e.impact === "High" ? "H" : "M"}"></i>${esc(e.currency)} ${esc(e.title)}</b>
      <small><span class="cd">${untilTxt(e.at)}</span>${k ? "" : ` · ${wkTxt(x)} ${hhmm(x)}`}${e.forecast ? ` · F ${esc(e.forecast)}` : ""}${e.previous ? ` · P ${esc(e.previous)}` : ""}</small></div>`;
  }).join("")}<a class="ff" href="https://www.forexfactory.com/calendar" target="_blank" rel="noopener" title="Open Forex Factory">↗</a></div>`;
}


function viewEconCal() {
  const c = state.ecal, keep = econKeep(), ev = econEvents().filter((e) => keep(e.raw)), t0 = today0(), now = Date.now();
  const on = (d) => ev.filter((e) => e.day === d).sort((a, b) => (a.at < b.at ? -1 : 1));
  const st = addDays(monday(), c.wk * 35), cells = [...Array(35)].map((_, k) => addDays(st, k));
  const cell = (x) => {
    const d = isoDay(x), list = on(d);
    return `<div class="c ${x < t0 ? "o" : ""} ${d === isoDay(t0) ? "today" : ""} ${d === c.sel ? "sel" : ""} ${list.length ? "h-" + topLvl(list) : ""}" data-ecalsel="${d}">
      <span class="n">${x.getDate() === 1 ? monTxt(x) + " " : ""}${x.getDate()}</span>${list.slice(0, 6).map((e) => `<span class="pill ${e.i.lvl}">${evLogo(e.i, 18)}<span>${esc(e.raw.title)}</span></span>`).join("")}${list.length > 6 ? `<span class="more">+${list.length - 6} more</span>` : ""}</div>`;
  };
  const sd = dayOf(c.sel), raw = (state.econ || []).filter((e) => isoDay(new Date(e.at)) === c.sel && keep(e)).sort((a, b) => (a.at < b.at ? -1 : 1));
  const next = (state.econ || []).filter((e) => keep(e) && new Date(e.at) >= now).sort((a, b) => (a.at < b.at ? -1 : 1))[0];
  return `${header("news")}<div class="wrap calv">
    <a class="back a" href="#/">← Back to My News</a>
    <h1 class="ttl a">Economic calendar</h1>
    <p class="why a">Economic releases from Forex Factory (High and Medium impact), in Bangkok time. US actuals come from FRED; for others press ↗ to see the result on Forex Factory. Your stock dates are in the <a href="#/calendar">Stock calendar</a>.</p>
    ${econStrip()}
    ${econCards()}
    <div class="a" style="margin-top:14px">${econChips()}</div>
    <div class="calgrid a"><div>
      <div class="mtop"><h2>${cells[0].getDate()} ${monTxt(cells[0])} – ${cells[34].getDate()} ${monTxt(cells[34])} ${cells[34].getFullYear()}</h2>
        <button data-ecalwk="-1" ${c.wk <= 0 ? "disabled" : ""} aria-label="Earlier">‹</button><button data-ecalwk="1" ${c.wk >= 1 ? "disabled" : ""} aria-label="Later">›</button></div>
      <div class="big">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div class="w">${d}</div>`).join("")}${cells.map(cell).join("")}</div>
      <div class="legend"><span class="heat"><i class="h0"></i><i class="h-mid"></i><i class="h-key"></i></span> quiet → Medium → High impact day</div>
    </div>
    <aside class="sidecol">${keyDates(ev, 4)}
      <div class="dayb econp"><h3>${wkTxt(sd)} ${sd.getDate()} ${monTxt(sd)}</h3><p class="note" style="margin:2px 0 8px">${daysTo(c.sel) >= 0 ? cdTxt(c.sel) : "past"}</p>
      ${raw.length ? econHead + raw.map((e) => econRow(e, next)).join("") : `<div class="it empty1"><p>No releases on this day.</p></div>`}</div></aside></div>
    <p class="note">Forex Factory publishes one week at a time: next week's events appear when the new week starts, and past weeks stay here for 90 days. Green = better than forecast for that currency (lower is better for unemployment and jobless claims).</p></div>`;
}

