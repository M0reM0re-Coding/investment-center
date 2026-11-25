// Login page.
// Part of the website code: index.html loads every file in site/js in a fixed order (see README.md).
"use strict";

function viewLogin(msg = "", err = false, email = "") {   // design round 31, split 3: market chart on the left, form on the right
  const q = lastQuotes().slice(0, 3);
  const quotes = (q.length ? q : MARKETS.slice(0, 3).map((m) => [m[1], "", ""])).map((x) =>
    `<div class="lq">${esc(x[0])}<b>${esc(x[1] || "·")}</b>${x[2] ? `<span class="${String(x[2]).startsWith("-") ? "d" : "u"}">${esc(x[2])}</span>` : ""}</div>`).join("");
  const line = "M0 240 L50 230 L100 236 L150 200 L200 210 L250 170 L300 182 L350 140 L400 150 L450 96 L500 110 L560 60 L600 50";
  return `<div class="login2 enter">
    <div class="lart"><div class="a"><h2>Markets, news and alerts in one place.</h2><p>Live prices, the stories behind them, and a calendar of what's next.</p></div>
      <svg class="lch" viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="lga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff4500" stop-opacity=".3"/><stop offset="1" stop-color="#ff4500" stop-opacity="0"/></linearGradient></defs>
        <line x1="0" y1="75" x2="600" y2="75"/><line x1="0" y1="150" x2="600" y2="150"/><line x1="0" y1="225" x2="600" y2="225"/>
        <path class="ar" d="${line} L600 300 L0 300Z" fill="url(#lga)"/><path class="ln" d="${line}"/></svg>
      <div class="lqs">${quotes}</div></div>
    <div class="lform"><div class="logo a"><i class="lmark" aria-hidden="true"></i><span>investment <em>center</em></span></div>
    <p class="why a" style="margin-top:6px">Sign in to your news.</p>
    <form id="login" class="login-form">
      <input class="a" type="email" id="email" placeholder="Email" autocomplete="username" required value="${esc(email)}">
      <div class="pw a"><input type="password" id="password" placeholder="Password" autocomplete="current-password">
        <button type="button" class="eye" data-act="eye" title="Show password" aria-label="Show password" aria-pressed="false">${EYE}</button></div>
      <label class="remember a"><input type="checkbox" id="remember" ${remember() ? "checked" : ""}> Remember me</label>
      <button class="btn a" type="submit">Sign in</button>
    </form>
    <p class="msg ${err ? "err" : ""}">${esc(msg)}</p>
    <button class="linkbtn a" data-act="magic">Email me a login link instead</button></div></div>`;
}

const friendly = (m) => /invalid login credentials/i.test(m) ? "Wrong email or password."
  : /rate limit/i.test(m) ? "Too many login emails were sent. Wait about an hour, or sign in with your password."
  : /expired|invalid/i.test(m) ? "That login link was already used or has expired. Sign in with your password, or request a new link."
  : m;

