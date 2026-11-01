// Renders a leaderboard (the JSON written by battleship.tournament) as HTML tables.
// Pure presentation: every number here was computed in Python.

import { esc, th } from "./html.js";
import { t } from "./i18n.js";

// "semifinal" -> "Semi-finals"; "round_of_16" -> "Round of 16".
export function stageName(name) {
  const round = /^round_of_(\d+)$/.exec(name ?? "");
  return round ? t("stage_round_of", { n: round[1] }) : t(`stage_${name}`);
}

function percent(rate) {
  return rate == null ? "–" : `${(100 * rate).toFixed(1)}%`;
}

function standingsTable(lb) {
  const primary = lb.format === "simple" ? "points" : "elo";
  const rows = lb.standings
    .map((row) => {
      const reasons = Object.entries(row.forfeit_reasons || {})
        .map(([reason, n]) => `${reason}: ${n}`)
        .join(", ");
      return `
        <tr>
          <td class="num">${row.rank}</td>
          <td class="who" title="${esc(row.description || "")}">${esc(row.icon)} <b>${esc(row.name)}</b>
            <small>${esc((row.authors || []).join(", "))}</small></td>
          <td class="num strong">${esc(row[primary])}</td>
          <td class="num">${row.played}</td>
          <td class="num">${row.wins}-${row.losses}-${row.draws}</td>
          <td class="num"${reasons ? ` title="${esc(reasons)}"` : ""}>${row.forfeits}</td>
          <td class="num">${row.avg_shots_to_win ?? "–"}</td>
          <td class="num">${percent(row.hit_rate)}</td>
          <td class="num">${row.wins_first}/${row.wins_second}</td>
        </tr>`;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table class="standings">
        <thead><tr>
          <th>#</th><th>${th("col_player")}</th><th>${th(primary === "elo" ? "col_elo" : "col_points")}</th>
          <th>${th("col_played")}</th><th>${th("col_wld")}</th><th>${th("col_forfeits")}</th>
          <th>${th("col_avg_shots")}</th><th>${th("col_hit_rate")}</th><th>${th("col_first")}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Head to head: the cell at (row p, column q) is how many games p won against q.
function crossTable(lb) {
  const names = lb.standings.map((row) => row.name);
  const wins = {};
  for (const pair of lb.pairs || []) {
    wins[`${pair.a}|${pair.b}`] = pair.wins_a;
    wins[`${pair.b}|${pair.a}`] = pair.wins_b;
  }
  const icon = Object.fromEntries(lb.standings.map((row) => [row.name, row.icon]));
  const head = names.map((n) => `<th title="${esc(n)}">${esc(icon[n])}</th>`).join("");
  const body = names
    .map((p) => {
      const cells = names
        .map((q) => (p === q ? `<td class="self"></td>` : `<td class="num">${wins[`${p}|${q}`] ?? "–"}</td>`))
        .join("");
      return `<tr><th class="who">${esc(icon[p])} ${esc(p)}</th>${cells}</tr>`;
    })
    .join("");
  return `
    <h3>${th("crosstable")}</h3>
    <div class="table-wrap"><table class="cross"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// The bracket: one column per round, each match with its score; the winner in bold.
function knockoutHtml(lb) {
  const ko = lb.knockout;
  if (!ko) return "";
  const icon = Object.fromEntries(lb.standings.map((row) => [row.name, row.icon]));
  const side = (name, wins, winner) =>
    `<div class="ko-side${name === winner ? " won" : ""}"><span>${esc(icon[name] ?? "")} ${esc(name)}</span><b>${wins}</b></div>`;
  const rounds = ko.rounds
    .map(
      (round) => `
        <div class="ko-round">
          <h4>${esc(stageName(round.name))}</h4>
          ${round.matches
            .map((m) => `<div class="ko-match">${side(m.a, m.wins_a, m.winner)}${side(m.b, m.wins_b, m.winner)}</div>`)
            .join("")}
        </div>`,
    )
    .join("");
  return `
    <h3>${th("knockout_title")}</h3>
    <div class="ko">${rounds}
      <div class="ko-round ko-champion"><div class="trophy">🏆</div><b>${th("champion", { name: `${icon[ko.champion] ?? ""} ${ko.champion}` })}</b></div>
    </div>
    <p class="help">${th("knockout_tiebreak")}</p>`;
}

export function leaderboardHtml(lb) {
  const c = lb.config || {};
  const meta = th("ranking_meta", {
    games: c.games_per_pair,
    size: c.size,
    fleet: (c.fleet || []).join(","),
    seed: c.seed,
  });
  const generated = lb.generated_at ? ` · ${th("ranking_generated", { date: lb.generated_at.replace("T", " ") })}` : "";
  const rejected = (lb.rejected || []).length
    ? `<h3>${th("rejected_title")}</h3><ul class="rejected">${lb.rejected
        .map((item) => `<li><code>${esc(item.source)}</code>: ${esc(item.error)}</li>`)
        .join("")}</ul>`
    : "";
  return `<p class="help">${meta}${generated}</p>${knockoutHtml(lb)}${standingsTable(lb)}${crossTable(lb)}${rejected}`;
}
