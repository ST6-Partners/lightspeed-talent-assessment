// Insights Discovery profile data.
//
// Nikolas Ueber is a REAL uploaded Insights Discovery Personal Profile
// (25: Inspiring Motivator, Classic; completed 13 May 2025). It is stored here
// verbatim and used as the template shape for the other, illustrative sample
// candidates below. Colour energies are the published Colour Dynamics
// percentages (Conscious + Less Conscious persona).

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

const nikolas: InsightsProfile = {
  id: 'nikolas-ueber',
  name: 'Nikolas Ueber',
  role: 'Sample — uploaded profile',
  dateCompleted: '13 May 2025',
  consciousPosition: '25: Inspiring Motivator (Classic)',
  lessConsciousPosition: '24: Directing Motivator (Classic)',
  type: 'Inspiring Motivator',
  lead: 'yellow',
  supporting: 'red',
  preferenceFlow: '25.6%',
  conscious: { blue: 39, green: 28, yellow: 83, red: 73 },
  lessConscious: { blue: 17, green: 27, yellow: 61, red: 72 },
  overview: {
    personalStyle:
      "Nikolas has high energy and is always striking out in a forward direction. He follows his impulses, moving strongly towards his goal. He tends to enjoy the company of like-minded people and may be somewhat less interested in his opposite types. Routine is the real bad news for him and it may sap his energy. He radiates goodwill and enthusiasm, and is optimistic about life in general and human potential in particular. He is strong on initiative and creativity, but may often be weak on the completion of projects. He is an imaginative and creative visionary who is a source of inspiration to most.",
    interacting:
      "Nikolas enjoys involvement in many activities, with a variety of people. He is stimulated by doing the unexpected or the unusual, and prefers to understand and relate to people's views rather than be judgmental of them. His ability to empower others is one of his most impressive qualities. Usually verbal and persuasive, he is very effective in a leadership role, able to persuade others of the value of his vision. He is noted for his innate ability to inspire and encourage those around him and exhibits excellent interpersonal skills.",
    decisionMaking:
      "With his enthusiasm and spontaneity, Nikolas brings a refreshing approach to decision making. Always restless, he would rather put off dealing with troublesome details, preferring to move on to something new. He may find it difficult to make decisions based purely on objective considerations and has a tendency towards higher-risk decisions. Imaginative and adaptable, he values inspiration above all else. He is prepared to make decisions through group consensus, and may sometimes make decisions based on how he feels about a situation rather than how it actually is.",
  },
  strengths: [
    'Challenges convention.',
    'Skilled at defusing tense situations.',
    'Becomes involved in many activities.',
    'Outwardly directed energy ensures a fast friendly pace.',
    'Creative decision maker.',
    'Ability to see options and alternatives.',
    'Provides involvement and participation in direction.',
    'High profile and visibility.',
    'Has an outgoing nature and builds relationships quickly.',
    'Motivates others to "achieve the impossible".',
  ],
  weaknesses: [
    'May occasionally say something without thinking, and then regret it.',
    "Doesn't always take time to hear others' views.",
    'Can come across as superficial or shallow.',
    'Becomes impatient with routine and repetition.',
    'Not always attracted to what is practical.',
    'May ignore others who contribute in a less energetic style.',
    'Some of his ideas may be perceived as unrealistic.',
    'Knows the answer before the question is asked.',
    'Will tend to be influenced by the last person he speaks to.',
    "May miss others' reactions to his actions.",
  ],
  valueToTeam: [
    'Is the life and soul of the group - often "centre stage".',
    'Provides charismatic leadership.',
    'Promotes ideas to, with and through others.',
    'Boosts self-esteem in others.',
    'Can focus effectively on both task and people issues.',
    'Works well with a variety of tasks and activities.',
    'Brings a fresh outlook.',
    'Is an excellent mediator.',
    'Initiates and self-starts the projects.',
    'Provides inspiration and perspiration.',
  ],
  commEffective: [
    'Allow time for fun and socialising.',
    'Talk tangibly and with enthusiasm.',
    'Talk about him and areas he finds stimulating.',
    'Provide information that stimulates conversation.',
    'Be bright, be brief and be gone.',
    'Acknowledge his flashes of creative brilliance.',
    'Appeal to his open style of decision making.',
    'Be prepared to discuss a wide range of topics.',
    'Share in and promote his ideas and visions.',
    'Acknowledge his talent for leadership.',
  ],
  commBarriers: [
    'Insist on cumbersome reporting procedures.',
    'Burden him with too many papers to read.',
    'Criticise, condemn or suppress his enthusiasm.',
    'Prevent him moving on to other challenges.',
    'Compete directly with him for control.',
    'Fail to recognise his best personal achievements.',
    'Criticise his ideas too harshly or personally.',
    'Take credit for his ideas.',
    'Impose a "can\'t be done" or defeatist attitude on him.',
    'Limit his range or scope of activity.',
  ],
  blindSpots:
    "Nikolas should take care not to act on things too spontaneously, try to co-operate more, and learn to be more considerate of people's feelings. With his boldness and abundant energy, he may give the impression that task is significantly more important than people. Tending to take on too much at one time, he can find himself overloaded and unable to keep his commitments, and can make mistakes by deciding before receiving all the information. Under pressure he acts in a domineering way, but he needs to consciously stop and listen to others before charging ahead with his own idea. When under pressure he may get the job done by cutting corners or neglecting quality.",
  oppositeType: {
    name: 'Coordinator',
    text:
      "Nikolas's opposite Insights type is the Coordinator, Jung's \"Introverted Sensing\" type. The Coordinator is a careful, cautious, conventional person who is diplomatic and sincere - very loyal, precise and disciplined with high standards. Coordinators prefer a structured, ordered manner, focusing on established guidelines rather than future possibilities. To Nikolas they can appear slow in decision making, procrastinating until all the facts are available. They prefer a steady-paced environment with little interpersonal aggression and are among the most private of the Insights types.",
  },
  development: [
    'Listening more than he talks.',
    'Taking life more seriously.',
    'Monitoring the in/out process flow of the department or office he works in.',
    'Having things well thought out in advance.',
    'Appreciating that there are circumstances where order and structure are essential.',
    'Not seeking to relate all new ideas to his own situation.',
    'Paying attention to every detail and developing a systematic methodology.',
    'Reducing the level of activities in his life.',
    'Really listening to the views of others.',
  ],
  real: true,
};

// ── Sample candidates, templated off the real profile shape ──────────────

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

export const INSIGHTS_PROFILES: InsightsProfile[] = [nikolas, maya, aisha, tom];
