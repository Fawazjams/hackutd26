// Numbered equation blocks for the Details tab, set in Barlow (styles.css .eq*). Owner: Nandhan.
// Builders return HTML strings; numbers passed in come from the plans/prices, never computed here.

/** Variable: italic name with optional subscript / superscript. */
export const v = (name, sub = '', sup = '') => {
  if (sub !== '' && sup !== '') return `<i>${name}</i><span class="eq-ss"><span>${sup}</span><span>${sub}</span></span>`;
  return `<i>${name}</i>${sub !== '' ? `<sub>${sub}</sub>` : ''}${sup !== '' ? `<sup>${sup}</sup>` : ''}`;
};

/** Operator with breathing room: op('=') */
export const op = (s) => `<span class="eq-op">${s}</span>`;

/** Upright function name: fn('min') */
export const fn = (s) => `<span class="eq-fn">${s}</span>`;

/** Big Σ with limits below/above. */
export const sum = (below = '', above = '') =>
  `<span class="eq-sum"><small>${above}</small><span>Σ</span><small>${below}</small></span>`;

/** Stacked fraction. */
export const frac = (num, den) => `<span class="eq-frac"><span>${num}</span><span>${den}</span></span>`;

/** "subject to" side note inside a formula. */
export const st = (s) => `<span class="eq-st">${s}</span>`;

/**
 * One equation block.
 * @param {{n: number|string, f: string, plug?: string, where?: string, inset?: boolean}} o
 *   f: the formula, plug: the same formula with this week's numbers, where: what the symbols mean,
 *   inset: lighter variant for use inside a card.
 */
export function eq({ n, f, plug = '', where = '', inset = false }) {
  return `<div class="eq${inset ? ' eq-in' : ''}">
    <div class="eq-main"><div class="eq-f">${f}</div><span class="eq-n">(${n})</span></div>
    ${plug ? `<div class="eq-plug">${plug}</div>` : ''}
    ${where ? `<div class="eq-where">${where}</div>` : ''}
  </div>`;
}

export const usd = (x) => `${x < -0.5 ? '−' : ''}$${Math.round(Math.abs(Number(x) || 0)).toLocaleString('en-US')}`;
export const usd2 = (x) => `$${(Number(x) || 0).toFixed(2)}`;
