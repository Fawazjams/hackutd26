// Key moments of the week, built from the two plans (never hand-written): when our plan and ASAP
// diverge, why ASAP overheats and what our plan does at the same hour. Every number comes from the
// API (plan items, overheats, zone_temps, temp_limit_c); this file only picks and words them.

import { hourLabel, money, num, shortName } from './format.js';

const COOLING = /^(CRAC|CDU|CHILLER)/i;     // same rule as backend simulate.is_cooling_task
const TAIL_HRS = 3;                          // a zone stays hot a few hours after cooling returns (thermal inertia)
const GROUP_HRS = 2;                         // early starts this close together share one card

const zoneNum = (z) => Number(String(z).replace(/\D/g, ''));
const nearZones = (a, b) => Math.abs(zoneNum(a) - zoneNum(b)) <= 1;   // zones in a line share backup cooling
const overlapHrs = (a, b) => Math.max(0, Math.min(a.end_hour, b.end_hour) - Math.max(a.start_hour, b.start_hour));
const deg = (c) => `${Number(c).toFixed(1)} °C`;
const clock = (h) => hourLabel(h).split(' ')[1];
const isCooling = (i) => COOLING.test(i.equipment || '');
const andList = (xs) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

function coolingPairs(plan) {
  const cool = plan.items.filter(isCooling);
  const out = [];
  for (let i = 0; i < cool.length; i++) {
    for (let j = i + 1; j < cool.length; j++) {
      const [a, b] = [cool[i], cool[j]];
      if (nearZones(a.zone, b.zone) && overlapHrs(a, b) > 0) out.push([a, b]);
    }
  }
  return out;
}

/** [{hour, plan: 'optimized'|'asap', contrast?: 'optimized', title, text}] sorted by hour. */
export function buildBeats(ours, asap) {
  if (!ours?.items || !asap?.items) return [];
  const beats = [];
  const limit = ours.temp_limit_c ?? asap.temp_limit_c;
  const tempAt = (plan, h, z) => plan.zone_temps?.[h]?.[z];

  // 1. Our plan starts jobs earlier than ASAP, for less money (grouped when close together).
  const early = ours.items
    .map(o => ({ o, a: asap.byTask.get(o.task_id) }))
    // cooling jobs are explained by the cooling cards below
    .filter(({ o, a }) => a && !isCooling(o) && o.start_hour < a.start_hour && a.total > o.total)
    .sort((x, y) => x.o.start_hour - y.o.start_hour);
  for (let k = 0; k < early.length;) {
    const group = [early[k]];
    while (++k < early.length && early[k].o.start_hour - group[0].o.start_hour <= GROUP_HRS) group.push(early[k]);
    const saved = group.reduce((s, { o, a }) => s + (a.total - o.total), 0);
    const jobs = andList(group.map(({ o }) => `${shortName(o.name)} at ${clock(o.start_hour)}`));
    const waits = [...new Set(group.map(({ a }) => a.start_label))];
    beats.push({
      hour: group[0].o.start_hour, plan: 'optimized',
      title: group.length === 1 ? `Our plan starts ${shortName(group[0].o.name)} early` : `Our plan starts ${group.length} jobs early`,
      text: `${jobs}. ASAP waits until ${andList(waits)}. ${group.length === 1 ? 'It costs' : 'Together they cost'} ${money(saved)} less in our plan.`,
    });
  }

  // 2. ASAP runs cooling jobs in neighboring zones at the same time.
  for (const [a, b] of coolingPairs(asap)) {
    const oa = ours.byTask.get(a.task_id), ob = ours.byTask.get(b.task_id);
    const ov = oa && ob ? overlapHrs(oa, ob) : null;
    const oursText = ov == null ? ''
      : ov === 0 ? ' Our plan never runs them together.'
      : ` Our plan overlaps them for ${ov} h, from ${hourLabel(Math.max(oa.start_hour, ob.start_hour))}.`;
    beats.push({
      hour: Math.max(a.start_hour, b.start_hour), plan: 'asap', contrast: 'optimized',   // director: then show ours, same hour
      title: 'ASAP takes down two cooling units at once',
      text: `${a.equipment} (zone ${a.zone}) and ${b.equipment} (zone ${b.zone}) both start at ${hourLabel(Math.max(a.start_hour, b.start_hour))}. Neighboring zones back each other up on cooling, so this leaves no backup.${oursText}`,
    });
  }

  // 3. Overheat episodes (consecutive hours), explained with the cooling jobs that caused them.
  for (const [plan, key, label, other, otherLabel] of [[asap, 'asap', 'ASAP', ours, 'Our plan'], [ours, 'optimized', 'Our plan', asap, 'ASAP']]) {
    const hot = [...(plan.overheats || [])].sort((x, y) => x.hour - y.hour || y.temp_c - x.temp_c);
    let lastHour = -99;
    for (const oh of hot) {
      const startsEpisode = oh.hour > lastHour + 1;
      lastHour = Math.max(lastHour, oh.hour);
      if (!startsEpisode) continue;
      const causes = plan.items.filter(i => isCooling(i) && nearZones(i.zone, oh.zone)
        && i.start_hour <= oh.hour && oh.hour < i.end_hour + TAIL_HRS);
      const since = causes.length ? Math.min(...causes.map(i => i.start_hour)) : null;
      const why = causes.length
        ? `, because ${andList(causes.map(i => i.equipment))} cooling ${causes.length > 1 ? 'have' : 'has'} been down since ${hourLabel(since)}` : '';
      const theirs = tempAt(other, oh.hour, oh.zone);
      const episode = hot.filter(x => x.hour >= oh.hour && x.hour <= lastHour + 3);
      beats.push({
        hour: oh.hour, plan: key, ...(key === 'asap' ? { contrast: 'optimized' } : {}),
        title: `${label}: zone ${oh.zone} overheats`,
        text: `Zone ${oh.zone} reaches ${deg(oh.temp_c)}${limit != null ? `, over the ${deg(limit)} limit` : ''}${why}. `
          + `${num(oh.gpus_lost)} GPUs lost this hour, ${money(oh.cost)}.`
          + (theirs != null ? ` ${otherLabel}: zone ${oh.zone} at ${deg(theirs)}.` : '')
          + (episode.length > 1 ? ` ${episode.length} overheat zone-hours before the hall cools down.` : ''),
      });
    }
  }

  // 4. Our plan overlaps neighboring cooling jobs briefly but stays under the limit.
  if (ours.zone_temps?.length && limit != null) {
    for (const [a, b] of coolingPairs(ours)) {
      const from = Math.max(a.start_hour, b.start_hour);
      const to = Math.min(a.end_hour, b.end_hour);
      if ((ours.overheats || []).some(o => o.hour >= from && o.hour < to + TAIL_HRS)) continue;
      let peak = null;
      for (let h = from; h < Math.min(to + TAIL_HRS, ours.zone_temps.length); h++) {
        for (const z of new Set([a.zone, b.zone])) {
          const t = tempAt(ours, h, z);
          if (t != null && (!peak || t > peak.t)) peak = { t, z };
        }
      }
      if (!peak) continue;
      beats.push({
        hour: from, plan: 'optimized',
        title: 'Our plan overlaps the cooling work briefly, safely',
        text: `${a.equipment} and ${b.equipment} cooling are both down for ${to - from} h. Zone ${peak.z} peaks at ${deg(peak.t)}, under the ${deg(limit)} limit.`,
      });
    }
  }

  return beats.sort((x, y) => x.hour - y.hour);
}
