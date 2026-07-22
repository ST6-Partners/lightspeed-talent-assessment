// Insights Discovery profile data.
//
// All profiles below are illustrative samples (no real candidate data).
// Colour energies follow the published Colour Dynamics percentages
// (Conscious + Less Conscious persona).

export type Energies = { blue: number; green: number; yellow: number; red: number };
export type ColourKey = keyof Energies;

export type InsightsProfile = {
  id: string;
  name: string;
  role: string;
  dateCompleted: string;
  consciousPosition: string;
  lessConsciousPosition: string;
  type: string;
  lead: ColourKey;
  supporting: ColourKey;
  preferenceFlow: string;
  conscious: Energies;
  lessConscious: Energies;
  overview: { personalStyle: string; interacting: string; decisionMaking: string };
  strengths: string[];
  weaknesses: string[];
  valueToTeam: string[];
  commEffective: string[];
  commBarriers: string[];
  blindSpots: string;
  oppositeType: { name: string; text: string };
  development: string[];
  real?: boolean;
};

export const COLOURS: Record<ColourKey, { label: string; hex: string }> = {
  red:    { label: 'Red',       hex: '#E5352B' },
  yellow: { label: 'Yellow', hex: '#F5B800' },
  green:  { label: 'Green',     hex: '#2E9E4F' },
  blue:   { label: 'Blue',       hex: '#1E7FC2' },
};
export const COLOUR_ORDER: ColourKey[] = ['blue', 'green', 'yellow', 'red'];

// ── Sample candidates (illustrative only) ──────────────

const tom: InsightsProfile = {
  id: 'tom-fisher',
  name: 'Tom Fisher',
  role: 'Account Executive',
  dateCompleted: '02 Jul 2026',
  consciousPosition: '8: Observing Reformer (Classic)',
  lessConsciousPosition: '7: Coordinating Reformer (Classic)',
  type: 'Observing Reformer',
  lead: 'blue',
  supporting: 'green',
  preferenceFlow: '18.2%',
  conscious: { blue: 84, green: 41, yellow: 22, red: 30 },
  lessConscious: { blue: 72, green: 46, yellow: 18, red: 26 },
  overview: {
    personalStyle:
      'Tom is precise, methodical and quietly determined. He prefers to gather the facts before he acts and takes quiet pride in accuracy and thoroughness. He values order and dislikes being rushed into decisions.',
    interacting:
      'Reserved with people he does not know well, Tom listens more than he speaks and chooses his words carefully. He builds trust slowly but deeply, and is respected for being consistent and reliable.',
    decisionMaking:
      'Tom weighs options carefully and is uncomfortable committing before the analysis is complete. He is risk-aware and prefers decisions grounded in evidence over instinct.',
  },
  strengths: ['Analytical and detail-focused.', 'High personal standards.', 'Dependable follow-through.', 'Objective under pressure.', 'Thorough preparation.', 'Quality-driven.'],
  weaknesses: ['Can be slow to decide.', 'May over-analyse.', 'Reluctant to delegate.', 'Uncomfortable with rapid change.', 'Can appear reserved or distant.'],
  valueToTeam: ['Brings rigour and accuracy.', 'Spots risks others miss.', 'Keeps standards high.', 'A calm, steady presence.', 'Documents and organises well.'],
  commEffective: ['Give him time to prepare.', 'Provide the detail and the data.', 'Be logical and precise.', 'Respect his need to think it through.', 'Put it in writing.'],
  commBarriers: ['Rush him for a decision.', 'Be vague or over-general.', 'Spring surprises on him.', 'Rely on hype over evidence.', 'Skip the detail.'],
  blindSpots:
    'Tom can lose momentum by waiting for certainty that never fully arrives, and may frustrate faster-paced colleagues. His caution can read as negativity, and he may hold onto tasks rather than trust others with them.',
  oppositeType: { name: 'Motivator', text: "Tom's opposite type is the Motivator - outgoing, fast-paced and spontaneous. He may see them as overly casual with detail, while they may find him slow and overly cautious." },
  development: ['Committing before every fact is in.', 'Sharing his thinking out loud earlier.', 'Delegating more.', 'Being open to a faster pace.', 'Leading with the headline.'],
};

const aisha: InsightsProfile = {
  id: 'aisha-bello',
  name: 'Aisha Bello',
  role: 'Implementation Lead',
  dateCompleted: '28 Jun 2026',
  consciousPosition: '43: Supporting Coordinator (Classic)',
  lessConsciousPosition: '44: Coordinating Supporter (Classic)',
  type: 'Supporting Coordinator',
  lead: 'green',
  supporting: 'blue',
  preferenceFlow: '21.0%',
  conscious: { blue: 46, green: 80, yellow: 44, red: 18 },
  lessConscious: { blue: 40, green: 70, yellow: 38, red: 22 },
  overview: {
    personalStyle:
      'Aisha is patient, dependable and people-first. She creates a calm, supportive atmosphere and is happiest helping others succeed. She values harmony and loyalty and dislikes conflict.',
    interacting:
      'Warm and approachable, Aisha listens carefully and makes people feel heard. She builds strong, trusting relationships and is often the person others turn to for support.',
    decisionMaking:
      'Aisha seeks consensus and considers the impact of a decision on people. She prefers to take her time and is cautious about changes that could unsettle the team.',
  },
  strengths: ['Excellent listener.', 'Builds trust and loyalty.', 'Calm under pressure.', 'Dependable and consistent.', 'Strong team player.', 'Diplomatic.'],
  weaknesses: ['Avoids necessary conflict.', 'Can be too accommodating.', 'Slow to embrace change.', 'May undersell her own contribution.', 'Takes on too much for others.'],
  valueToTeam: ['Holds the team together.', 'Supports and steadies others.', 'Follows through reliably.', 'Defuses tension.', 'Protects relationships.'],
  commEffective: ['Be warm and genuine.', 'Give her time to reflect.', 'Show how it helps people.', 'Be patient and personal.', 'Avoid pressure tactics.'],
  commBarriers: ['Be aggressive or confrontational.', 'Force a quick decision.', 'Dismiss the human impact.', 'Be cold or transactional.', 'Spring big changes on her.'],
  blindSpots:
    'Aisha can avoid difficult conversations to keep the peace, and may let her own needs go unmet. Her caution around change can slow the team, and she may say yes when she should say no.',
  oppositeType: { name: 'Director', text: "Aisha's opposite type is the Director - direct, fast and results-focused. She may find them blunt, while they may see her as too accommodating." },
  development: ['Voicing disagreement when it matters.', 'Setting clearer boundaries.', 'Being open to faster change.', 'Claiming credit for her work.', 'Making the tough call sooner.'],
};

const maya: InsightsProfile = {
  id: 'maya-chen',
  name: 'Maya Chen',
  role: 'Software Engineer',
  dateCompleted: '30 Jun 2026',
  consciousPosition: '20: Directing Motivator (Classic)',
  lessConsciousPosition: '21: Motivating Director (Classic)',
  type: 'Directing Motivator',
  lead: 'red',
  supporting: 'yellow',
  preferenceFlow: '24.4%',
  conscious: { blue: 30, green: 22, yellow: 62, red: 85 },
  lessConscious: { blue: 26, green: 24, yellow: 55, red: 78 },
  overview: {
    personalStyle:
      'Maya is decisive, competitive and results-driven. She sets a fast pace, welcomes a challenge and wants to get to the point quickly. She is comfortable taking charge and making things happen.',
    interacting:
      'Direct and confident, Maya says what she thinks and expects the same from others. She is energising to work with and drives momentum, though she can be impatient with slower styles.',
    decisionMaking:
      'Maya decides quickly and acts on it. She is comfortable with risk and prefers action over prolonged analysis, sometimes moving before all the detail is in.',
  },
  strengths: ['Decisive and action-oriented.', 'Drives results.', 'Comfortable leading.', 'Thrives on challenge.', 'Sets a fast pace.', 'Direct and clear.'],
  weaknesses: ['Can be impatient.', 'May steamroll quieter voices.', 'Acts before all the facts are in.', 'Low tolerance for routine.', 'Can seem blunt.'],
  valueToTeam: ['Gets things moving.', 'Makes the tough calls.', 'Pushes for results.', 'Cuts through indecision.', 'Sets ambitious goals.'],
  commEffective: ['Be brief and to the point.', 'Focus on results and outcomes.', 'Give her options and control.', 'Move at pace.', 'Be confident and direct.'],
  commBarriers: ['Waffle or over-explain.', 'Slow her down unnecessarily.', 'Be indecisive.', 'Take control away from her.', 'Focus on process over outcome.'],
  blindSpots:
    'Maya can charge ahead before others are ready and may not notice quieter colleagues being left behind. Her directness can land as harsh, and her speed can cut corners on detail.',
  oppositeType: { name: 'Supporter', text: "Maya's opposite type is the Supporter - patient, steady and people-focused. She may find them slow, while they may find her too forceful." },
  development: ['Slowing down to bring others with her.', 'Listening before deciding.', 'Attending to detail.', 'Softening her delivery.', 'Valuing steady contributors.'],
};

export const INSIGHTS_PROFILES: InsightsProfile[] = [maya, aisha, tom];
