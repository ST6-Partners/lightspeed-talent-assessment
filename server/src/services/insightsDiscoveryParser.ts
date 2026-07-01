// ============================================================
// INSIGHTS DISCOVERY PARSER
// Extracts the Colour Dynamics data (conscious + less-conscious
// colour energies) and the 72-type wheel positions from an
// Insights Discovery profile PDF.
//
// The Colour Dynamics page renders two bar charts whose values
// sit in the PDF text layer as, per persona:
//   BLUE GREEN YELLOW RED        (column order, left -> right)
//   5.60 3.60 0.32 3.72          (raw, 0-6 scale)
//   93% 60% 5% 62%               (percent of full)
// The FIRST such block is the Conscious persona, the SECOND is
// the Less Conscious persona. Wheel positions come from the
// "72 Type Wheel" page ("55: Reforming Observer (Accommodating)").
// ============================================================

import { extractText, getDocumentProxy } from 'unpdf';
import type { ColourEnergies } from '../db/schema/insightsDiscovery.js';

export interface ParsedInsightsProfile {
  status: 'ok' | 'partial' | 'failed';
  error?: string;
  typeNumber: number | null;
  typeName: string | null;
  lcTypeNumber: number | null;
  lcTypeName: string | null;
  conscious: ColourEnergies | null;
  lessConscious: ColourEnergies | null;
}

function toEnergies(raw: number[], pct: number[]): ColourEnergies {
  // Column order on the chart is Blue, Green, Yellow, Red.
  return {
    blue: raw[0], green: raw[1], yellow: raw[2], red: raw[3],
    bluePct: pct[0], greenPct: pct[1], yellowPct: pct[2], redPct: pct[3],
  };
}

/**
 * Parse the raw text of a full Insights Discovery PDF.
 * Exported separately so it can be unit-tested without a PDF binary.
 */
export function parseInsightsText(fullText: string): ParsedInsightsProfile {
  const result: ParsedInsightsProfile = {
    status: 'failed',
    typeNumber: null, typeName: null,
    lcTypeNumber: null, lcTypeName: null,
    conscious: null, lessConscious: null,
  };

  const text = fullText.replace(/\r/g, '');

  // ── Colour energies ──────────────────────────────────────
  // Four raw decimals (x.xx) in a row = one persona's raw values.
  const rawBlocks = [...text.matchAll(/(\d+\.\d{1,2})\s+(\d+\.\d{1,2})\s+(\d+\.\d{1,2})\s+(\d+\.\d{1,2})/g)]
    .map((m) => [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])]);
  // Four percentages in a row = one persona's percent values.
  const pctBlocks = [...text.matchAll(/(\d{1,3})%\s+(\d{1,3})%\s+(\d{1,3})%\s+(\d{1,3})%/g)]
    .map((m) => [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[4], 10)]);

  if (rawBlocks.length >= 1 && pctBlocks.length >= 1) {
    result.conscious = toEnergies(rawBlocks[0], pctBlocks[0]);
  }
  if (rawBlocks.length >= 2 && pctBlocks.length >= 2) {
    result.lessConscious = toEnergies(rawBlocks[1], pctBlocks[1]);
  }

  // ── Wheel positions ──────────────────────────────────────
  // "Conscious Wheel Position  55: Reforming Observer (Accommodating)".
  // Capture the type name up to its closing paren; fall back to a short
  // run of words. The Conscious matcher uses a look-behind so it does
  // NOT match inside "Less Conscious Wheel Position".
  const nameCore = String.raw`(\d+)\s*:\s*(.+?\([^)]*\)|[A-Za-z][A-Za-z \-'/]{2,50})`;
  const cMatch = text.match(new RegExp(String.raw`(?<!Less )Conscious Wheel Position\s*:?\s*` + nameCore, 'i'));
  const lcMatch = text.match(new RegExp(String.raw`Less Conscious Wheel Position\s*:?\s*` + nameCore, 'i'));
  if (cMatch) {
    result.typeNumber = parseInt(cMatch[1], 10);
    result.typeName = cMatch[2].trim();
  }
  if (lcMatch) {
    result.lcTypeNumber = parseInt(lcMatch[1], 10);
    result.lcTypeName = lcMatch[2].trim();
  }

  // ── Status ───────────────────────────────────────────────
  if (result.conscious && result.lessConscious) {
    result.status = 'ok';
  } else if (result.conscious || result.typeNumber) {
    result.status = 'partial';
    result.error = 'Some Colour Dynamics fields could not be read from this PDF.';
  } else {
    result.status = 'failed';
    result.error = 'Could not find Colour Dynamics data. Is this an Insights Discovery profile PDF?';
  }
  return result;
}

/**
 * Parse an Insights Discovery PDF from its raw bytes.
 */
export async function parseInsightsDiscoveryPdf(buffer: Buffer): Promise<ParsedInsightsProfile> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return parseInsightsText(text);
  } catch (err: any) {
    return {
      status: 'failed',
      error: err?.message || 'Failed to read PDF.',
      typeNumber: null, typeName: null, lcTypeNumber: null, lcTypeName: null,
      conscious: null, lessConscious: null,
    };
  }
}
