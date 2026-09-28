/* Yakwetu movie catalog — Kenyan / Kenya-set titles for demo streaming.
   Publicly known film titles (Wikipedia etc.). Stylized posters only (no IMDb assets). */

const CATALOG = [
  // Crime / urban
  { id: 'nairobi-half-life', title: 'Nairobi Half Life', year: 2012, genre: 'Crime Drama', price: 150, emoji: '🌃', bg: '#1a1528', blurb: 'A young actor chases fame and falls into Nairobi’s underworld.' },
  { id: 'nairobi-nights', title: 'Nairobi Nights', year: 2024, genre: 'Crime Drama', price: 150, emoji: '🔦', bg: '#2b1e3f', blurb: 'A night-shift courier becomes witness to a city-wide sting.' },
  { id: '40-sticks', title: '40 Sticks', year: 2020, genre: 'Crime Thriller', price: 140, emoji: '🪓', bg: '#2a1010', blurb: 'Prisoners crash in the forest — and someone starts hunting them.' },
  { id: 'click-click-bang', title: 'Click Click Bang', year: 2022, genre: 'Crime Thriller', price: 145, emoji: '💥', bg: '#301820', blurb: 'A musician’s grind turns dangerous when the wrong deal lands.' },
  { id: 'mission-to-rescue', title: 'Mission to Rescue', year: 2021, genre: 'Action Thriller', price: 145, emoji: '🚁', bg: '#1e2838', blurb: 'A high-stakes rescue mission across hostile terrain.' },
  { id: 'chokora', title: 'Chokora', year: 2005, genre: 'Crime Drama', price: 110, emoji: '🏙️', bg: '#22202a', blurb: 'Street life and survival on Nairobi’s edges.' },
  { id: 'disconnect', title: 'Disconnect', year: 2018, genre: 'Thriller', price: 130, emoji: '📵', bg: '#1a2230', blurb: 'A missing phone sparks a night of paranoia and chase.' },
  { id: 'katana', title: 'Katana', year: 2024, genre: 'Coastal Thriller', price: 140, emoji: '🗡️', bg: '#1e3f38', blurb: 'Smuggling and betrayal on the Kenyan coast.' },
  { id: 'wazi', title: 'Wazi', year: 2024, genre: 'Psych Thriller', price: 140, emoji: '🌀', bg: '#1e2a3f', blurb: 'A therapist’s patient may know her darkest secret.' },
  { id: 'veve', title: 'Veve', year: 2014, genre: 'Crime Drama', price: 125, emoji: '🌿', bg: '#1a2a1a', blurb: 'Miraa trade, politics, and a young man’s impossible choices.' },

  // Drama / social
  { id: 'rafiki', title: 'Rafiki', year: 2018, genre: 'Romance Drama', price: 140, emoji: '🌈', bg: '#3f1e3a', blurb: 'Two young women fall in love against family and politics.' },
  { id: 'something-necessary', title: 'Something Necessary', year: 2013, genre: 'Drama', price: 120, emoji: '⚖️', bg: '#2a2430', blurb: 'A lawyer fights for justice after post-election violence.' },
  { id: 'from-a-whisper', title: 'From a Whisper', year: 2008, genre: 'Drama', price: 120, emoji: '🕊️', bg: '#252030', blurb: 'Lives collide after the 1998 embassy bombing.' },
  { id: 'the-rugged-priest', title: 'The Rugged Priest', year: 2011, genre: 'Drama', price: 115, emoji: '⛪', bg: '#2a2218', blurb: 'A priest confronts land conflict and corruption.' },
  { id: 'stories-of-our-lives', title: 'Stories of Our Lives', year: 2014, genre: 'Drama', price: 110, emoji: '📖', bg: '#2a1e28', blurb: 'Anthology of queer Kenyan stories, raw and intimate.' },
  { id: 'togetherness-supreme', title: 'Togetherness Supreme', year: 2010, genre: 'Drama', price: 110, emoji: '🤝', bg: '#243028', blurb: 'Football, friendship, and tribal tension in Kibera.' },
  { id: 'the-first-grader', title: 'The First Grader', year: 2010, genre: 'Drama', price: 125, emoji: '✏️', bg: '#2a2818', blurb: 'An 84-year-old Mau Mau veteran demands his right to school.' },
  { id: 'kati-kati', title: 'Kati Kati', year: 2016, genre: 'Drama', price: 130, emoji: '👻', bg: '#1a1a28', blurb: 'A young woman wakes in a purgatory of unfinished lives.' },
  { id: 'baraka', title: 'Baraka ya Bibi', year: 2024, genre: 'Family Drama', price: 115, emoji: '🏠', bg: '#331e3f', blurb: 'A grandmother’s secret reshapes three generations.' },
  { id: 'sauti-ya-mtaa', title: 'Sauti ya Mtaa', year: 2024, genre: 'Music Drama', price: 120, emoji: '🎤', bg: '#3f1e2e', blurb: 'An underground MC risks everything for one breakthrough night.' },
  { id: 'dangerous-affair', title: 'Dangerous Affair', year: 2002, genre: 'Romance Drama', price: 100, emoji: '💔', bg: '#3a1e28', blurb: 'Desire and betrayal in early-2000s Nairobi society.' },
  { id: 'the-letter', title: 'The Letter', year: 2019, genre: 'Drama', price: 120, emoji: '✉️', bg: '#282030', blurb: 'A letter forces a family to face what silence protected.' },
  { id: 'our-strength', title: 'Our Strength', year: 2012, genre: 'Drama', price: 105, emoji: '💪', bg: '#203028', blurb: 'Community resilience after upheaval.' },
  { id: 'wall-street-boy', title: 'The Wall Street Boy', year: 2023, genre: 'Drama', price: 135, emoji: '📈', bg: '#1e2830', blurb: 'Ambition and hustle from the village to high finance.' },

  // Thriller / horror / mystery
  { id: '18-hours', title: '18 Hours', year: 2017, genre: 'Medical Thriller', price: 135, emoji: '🚑', bg: '#201818', blurb: 'A paramedic races the clock on a life-or-death shift.' },
  { id: 'house-of-lungula', title: 'House of Lungula', year: 2013, genre: 'Comedy Thriller', price: 110, emoji: '🏡', bg: '#302018', blurb: 'Secrets explode under one chaotic roof.' },
  { id: 'shattered', title: 'Shattered', year: 2011, genre: 'Thriller', price: 115, emoji: '🪞', bg: '#281820', blurb: 'A fractured marriage turns dangerous.' },
  { id: 'poacher', title: 'Poacher', year: 2018, genre: 'Eco Thriller', price: 130, emoji: '🐘', bg: '#1a2818', blurb: 'Rangers and cartels collide over ivory.' },
  { id: 'grave-yard', title: 'Grave Yard', year: 2014, genre: 'Horror', price: 105, emoji: '🪦', bg: '#181818', blurb: 'What was buried refuses to stay quiet.' },
  { id: 'through-hell', title: 'Through Hell', year: 2014, genre: 'Horror', price: 105, emoji: '🔥', bg: '#2a1010', blurb: 'A night journey that won’t let you wake up.' },
  { id: 'the-hammer', title: 'The Hammer', year: 2015, genre: 'Action', price: 110, emoji: '🔨', bg: '#281818', blurb: 'Street justice with no soft landings.' },
  { id: 'game-of-wits', title: 'Game of Wits', year: 2017, genre: 'Thriller', price: 120, emoji: '♟️', bg: '#222030', blurb: 'A mind game where every move costs someone.' },

  // Comedy
  { id: 'matatu-diaries', title: 'The Matatu Diaries', year: 2024, genre: 'Comedy', price: 100, emoji: '🚌', bg: '#3f341e', blurb: 'Chaos, romance, and Sheng on a Route 46 matatu.' },
  { id: 'malooned', title: 'Malooned', year: 2007, genre: 'Comedy', price: 100, emoji: '🏝️', bg: '#2a3020', blurb: 'Stranded strangers, bad decisions, big laughs.' },
  { id: 'toto-millionaire', title: 'Toto Millionaire', year: 2007, genre: 'Family Comedy', price: 95, emoji: '💰', bg: '#303018', blurb: 'A child’s windfall turns the whole estate upside down.' },
  { id: 'fundi-mentals', title: 'Fundi-Mentals', year: 2014, genre: 'Comedy', price: 95, emoji: '🔧', bg: '#2a2818', blurb: 'Handymen, hustles, and hilarious side quests.' },
  { id: 'mono', title: 'MONO', year: 2023, genre: 'Comedy Drama', price: 125, emoji: '🎧', bg: '#1e2030', blurb: 'One track, one dream, too many opinions.' },

  // Romance
  { id: 'dhahabu', title: 'Dhahabu', year: 2024, genre: 'Romance', price: 110, emoji: '💛', bg: '#3f2a1e', blurb: 'Gold, jealousy, and a love that won’t stay buried.' },
  { id: 'saikati', title: 'Saïkati', year: 1992, genre: 'Romance Adventure', price: 100, emoji: '🌍', bg: '#2a3020', blurb: 'A Maasai woman forges her path between tradition and city.' },
  { id: 'dance-for-wives', title: 'The Dance for Wives', year: 2009, genre: 'Romance Drama', price: 100, emoji: '💃', bg: '#3a2030', blurb: 'Desire and duty collide in a charged social circle.' },

  // Sci-fi / speculative
  { id: 'pumzi', title: 'Pumzi', year: 2010, genre: 'Sci-Fi', price: 120, emoji: '🌱', bg: '#102820', blurb: 'In a water-scarce future, a museum curator risks everything for a seed.' },
  { id: 'volume', title: 'Volume', year: 2023, genre: 'Drama Series', price: 160, emoji: '📺', bg: '#1a1020', blurb: 'Tosh Gitonga’s tense portrait of power and ambition.' },

  // Documentary / wildlife / heritage
  { id: 'kifaru', title: 'Kifaru', year: 2024, genre: 'Wildlife Doc', price: 130, emoji: '🦏', bg: '#263f1e', blurb: 'Rangers race to protect the last northern white rhinos.' },
  { id: 'balloon-safari', title: 'Balloon Safari', year: 1975, genre: 'Wildlife Doc', price: 90, emoji: '🎈', bg: '#2a3820', blurb: 'Classic aerial journey over East African wildlife.' },
  { id: 'mzima', title: 'Mzima: Portrait of a Spring', year: 1972, genre: 'Nature Doc', price: 90, emoji: '💧', bg: '#183028', blurb: 'Life around a spring that feeds the savannah.' },
  { id: 'kibera-kid', title: 'Kibera Kid', year: 2006, genre: 'Short Drama', price: 80, emoji: '👦', bg: '#2a2220', blurb: 'A boy in Kibera chooses between crime and courage.' },
  { id: 'intellectual-scum', title: 'Intellectual Scum', year: 2015, genre: 'Satire', price: 95, emoji: '🧠', bg: '#282030', blurb: 'Sharp satire on academia and empty talk.' },
  { id: 'i-want-to-be-a-pilot', title: 'I Want to Be a Pilot', year: 2006, genre: 'Short Drama', price: 80, emoji: '✈️', bg: '#1e2838', blurb: 'A child’s dream against impossible odds.' },
  { id: 'shuga', title: 'Shuga', year: 2009, genre: 'Drama', price: 100, emoji: '💉', bg: '#301828', blurb: 'Youth, love, and hard truths about HIV.' },
  { id: 'haba-na-haba', title: 'Haba na Haba', year: 2013, genre: 'Drama', price: 105, emoji: '🧩', bg: '#282428', blurb: 'Little by little — a story of incremental hope.' },
  { id: 'nangos', title: 'Nangos', year: 2009, genre: 'Drama', price: 100, emoji: '🌾', bg: '#2a3020', blurb: 'Rural lives under pressure from change.' },
  { id: 'the-stigma', title: 'The Stigma', year: 2007, genre: 'Drama', price: 100, emoji: '🗣️', bg: '#2a2030', blurb: 'Silence and stigma confront a community.' },
];

function getMovieById(id) {
  return CATALOG.find((m) => m.id === id) || null;
}

function searchMovies(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return CATALOG.slice();
  return CATALOG.filter(
    (m) =>
      m.title.toLowerCase().includes(s) ||
      m.genre.toLowerCase().includes(s) ||
      String(m.year).includes(s) ||
      (m.blurb || '').toLowerCase().includes(s)
  );
}

function genresInCatalog() {
  const set = new Set(CATALOG.map((m) => m.genre));
  return Array.from(set).sort();
}

function moviesByGenre(genre) {
  return CATALOG.filter((m) => m.genre === genre);
}

/** Compact list for AI prompts / SMS recommenders */
function catalogForAI(limit = 50) {
  return CATALOG.slice(0, limit)
    .map((m) => `${m.title} (${m.genre}, KES ${m.price})`)
    .join('; ');
}

// Back-compat alias used by older pages
const MOVIES = CATALOG;
