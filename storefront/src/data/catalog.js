/* Yakwetu catalog — Kenyan / Kenya-set titles for demo.
   Prices are demo-cheap (KES 5–49). Posters: TMDB paths when present, else art gradient. */

export const CATALOG = [
  { id:'nairobi-half-life', title:'Nairobi Half Life', year:2012, genre:'Crime Drama', price:5, emoji:'🌃', bg:'#1a1528', runtime:'1h 36m', rating:'7.4', director:'David Tosh Gitonga', cast:['Joseph Wairimu','Olwenya Maina','Nancy Wanjiru'], blurb:'A young actor chases fame and falls into Nairobi’s underworld.', tmdb:130737, imdb:'tt2187153', poster:'https://upload.wikimedia.org/wikipedia/commons/f/fc/Nairobi_Half_Life_Poster.png' },
  { id:'rafiki', title:'Rafiki', year:2018, genre:'Romance Drama', price:5, emoji:'🌈', bg:'#3f1e3a', runtime:'1h 23m', rating:'6.8', director:'Wanuri Kahiu', cast:['Samantha Mugatsia','Sheila Munyiva','Jimmy Gathu'], blurb:'Two young women fall in love against family and political pressure.', tmdb:505954, imdb:'tt8286894', poster:'' },
  { id:'40-sticks', title:'40 Sticks', year:2020, genre:'Crime Thriller', price:5, emoji:'🪓', bg:'#2a1010', runtime:'1h 21m', rating:'5.9', director:'Orlando Eastwood', cast:['Robert Agengo','Andreas Steiner','Muthoni Gathecha'], blurb:'Prisoners crash in the forest — and someone starts hunting them.', tmdb:718789, imdb:'tt12851524', poster:'' },
  { id:'pumzi', title:'Pumzi', year:2010, genre:'Sci-Fi', price:5, emoji:'🌱', bg:'#102820', runtime:'22m', rating:'7.1', director:'Wanuri Kahiu', cast:['Kudzani Moswela','Leo Ojiambo'], blurb:'In a water-scarce future, a curator risks everything for a seed.', tmdb:57915, imdb:'tt1552211', poster:'' },
  { id:'the-first-grader', title:'The First Grader', year:2010, genre:'Drama', price:5, emoji:'✏️', bg:'#2a2818', runtime:'1h 43m', rating:'7.4', director:'Justin Chadwick', cast:['Oliver Litondo','Naomie Harris','Tony Kgoroge'], blurb:'An 84-year-old Mau Mau veteran demands his right to school.', tmdb:55254, imdb:'tt1361815', poster:'' },
  { id:'something-necessary', title:'Something Necessary', year:2013, genre:'Drama', price:5, emoji:'⚖️', bg:'#2a2430', runtime:'1h 25m', rating:'6.9', director:'Judy Kibinge', cast:['Susan Wanjiru','Anne Wanjiru'], blurb:'A lawyer fights for justice after post-election violence.', tmdb:205588, imdb:'tt2912338', poster:'https://upload.wikimedia.org/wikipedia/commons/5/57/Something_Necessary_Poster.png' },
  { id:'from-a-whisper', title:'From a Whisper', year:2008, genre:'Drama', price:5, emoji:'🕊️', bg:'#252030', runtime:'1h 19m', rating:'7.0', director:'Wanuri Kahiu', cast:['Ken Ambani','Godwin Mwampembe'], blurb:'Lives collide after the 1998 embassy bombing.', tmdb:74890, imdb:'tt1396223', poster:'' },
  { id:'kati-kati', title:'Kati Kati', year:2016, genre:'Drama', price:5, emoji:'👻', bg:'#1a1a28', runtime:'1h 15m', rating:'6.7', director:'Mbithi Masya', cast:['Nyokabi Gethaiga','Elsaphan Njora'], blurb:'A young woman wakes in a purgatory of unfinished lives.', tmdb:412140, imdb:'tt5795086', poster:'https://upload.wikimedia.org/wikipedia/commons/8/83/Poster_for_Kati_Kati_presskit.png' },
  { id:'veve', title:'Veve', year:2014, genre:'Crime Drama', price:5, emoji:'🌿', bg:'#1a2a1a', runtime:'1h 34m', rating:'6.5', director:'Ng\'endo Mukii', cast:['Lowry Odhiambo','Lizz Njagah'], blurb:'Miraa trade, politics, and impossible choices.', tmdb:298312, poster:'' },
  { id:'18-hours', title:'18 Hours', year:2017, genre:'Medical Thriller', price:5, emoji:'🚑', bg:'#201818', runtime:'1h 30m', rating:'6.4', director:'Njue Kevin', cast:['Brian Ogola','Nice Githinji'], blurb:'A paramedic races the clock on a life-or-death shift.', tmdb:467892, poster:'' },
  { id:'click-click-bang', title:'Click Click Bang', year:2022, genre:'Crime Thriller', price:5, emoji:'💥', bg:'#301820', runtime:'1h 40m', rating:'6.6', director:'Tosh Gitonga', cast:['Ojwang\'','Nyokabi Gethaiga'], blurb:'A musician’s grind turns dangerous when the wrong deal lands.', tmdb:0, poster:'' },
  { id:'mission-to-rescue', title:'Mission to Rescue', year:2021, genre:'Action Thriller', price:5, emoji:'🚁', bg:'#1e2838', runtime:'1h 35m', rating:'6.2', director:'Gilbert Lukalia', cast:['Brian Ogola','Sarah Hassan'], blurb:'A high-stakes rescue across hostile terrain.', tmdb:0, poster:'' },
  { id:'stories-of-our-lives', title:'Stories of Our Lives', year:2014, genre:'Drama', price:5, emoji:'📖', bg:'#2a1e28', runtime:'1h 2m', rating:'7.2', director:'Jim Chuchu', cast:['Ensemble cast'], blurb:'Anthology of queer Kenyan stories, raw and intimate.', tmdb:0, poster:'' },
  { id:'the-rugged-priest', title:'The Rugged Priest', year:2011, genre:'Drama', price:5, emoji:'⛪', bg:'#2a2218', runtime:'1h 40m', rating:'6.8', director:'Bob Nyanja', cast:['Ainea Ojiambo'], blurb:'A priest confronts land conflict and corruption.', tmdb:0, poster:'' },
  { id:'togetherness-supreme', title:'Togetherness Supreme', year:2010, genre:'Drama', price:5, emoji:'🤝', bg:'#243028', runtime:'1h 30m', rating:'6.5', director:'Nathan Collett', cast:['Wilson Maina','Daniels Wataka'], blurb:'Football, friendship, and tribal tension in Kibera.', tmdb:0, poster:'' },
  { id:'dangerous-affair', title:'Dangerous Affair', year:2002, genre:'Romance Drama', price:5, emoji:'💔', bg:'#3a1e28', runtime:'1h 40m', rating:'6.3', director:'Judy Kibinge', cast:['Callie Green','Mayanja'], blurb:'Desire and betrayal in early-2000s Nairobi society.', tmdb:0, poster:'' },
  { id:'house-of-lungula', title:'House of Lungula', year:2013, genre:'Comedy Thriller', price:5, emoji:'🏡', bg:'#302018', runtime:'1h 25m', rating:'6.0', director:'Jordan Riber', cast:['Edward Kagumbu','Nice Githinji'], blurb:'Secrets explode under one chaotic roof.', tmdb:0, poster:'' },
  { id:'malooned', title:'Malooned', year:2007, genre:'Comedy', price:5, emoji:'🏝️', bg:'#2a3020', runtime:'1h 30m', rating:'6.1', director:'Bob Nyanja', cast:['Charles Bukeko'], blurb:'Stranded strangers, bad decisions, big laughs.', tmdb:0, poster:'' },
  { id:'kibera-kid', title:'Kibera Kid', year:2006, genre:'Short Drama', price:5, emoji:'👦', bg:'#2a2220', runtime:'15m', rating:'7.0', director:'Nathan Collett', cast:['Godfrey Odhiambo'], blurb:'A boy in Kibera chooses between crime and courage.', tmdb:0, poster:'' },
  { id:'saikati', title:'Saïkati', year:1992, genre:'Romance Adventure', price:5, emoji:'🌍', bg:'#2a3020', runtime:'1h 34m', rating:'6.7', director:'Anne Mungai', cast:['Susan Achieng'], blurb:'A Maasai woman forges her path between tradition and city.', tmdb:0, poster:'' },
  { id:'poacher', title:'Poacher', year:2018, genre:'Eco Thriller', price:5, emoji:'🐘', bg:'#1a2818', runtime:'1h 28m', rating:'6.4', director:'Tom Burris', cast:['Brian Ogola'], blurb:'Rangers and cartels collide over ivory.', tmdb:0, poster:'' },
  { id:'volume', title:'Volume', year:2023, genre:'Drama Series', price:5, emoji:'📺', bg:'#1a1020', runtime:'Episodes', rating:'7.0', director:'Tosh Gitonga', cast:['Ensemble'], blurb:'A tense portrait of power and ambition in modern Kenya.', tmdb:0, poster:'' },
  { id:'wall-street-boy', title:'The Wall Street Boy', year:2023, genre:'Drama', price:5, emoji:'📈', bg:'#1e2830', runtime:'1h 45m', rating:'6.5', director:'Kipkemboi', cast:['Ensemble'], blurb:'Ambition from the village to high finance.', tmdb:0, poster:'' },
  { id:'mono', title:'MONO', year:2023, genre:'Comedy Drama', price:5, emoji:'🎧', bg:'#1e2030', runtime:'1h 30m', rating:'6.3', director:'Kenyan indie', cast:['Ensemble'], blurb:'One track, one dream, too many opinions.', tmdb:0, poster:'' },
  { id:'shuga', title:'Shuga', year:2009, genre:'Drama', price:5, emoji:'💉', bg:'#301828', runtime:'Series', rating:'7.5', director:'MTV / Africa', cast:['Ensemble'], blurb:'Youth, love, and hard truths about HIV.', tmdb:0, poster:'' },
  { id:'nairobi-nights', title:'Nairobi Nights', year:2024, genre:'Crime Drama', price:5, emoji:'🔦', bg:'#2b1e3f', runtime:'1h 42m', rating:'7.1', director:'Yakwetu Original', cast:['Amina Otieno','Brian Kamau','Faith Wambui'], blurb:'A night-shift courier becomes witness to a city-wide sting.', tmdb:0, poster:'' },
  { id:'sauti-ya-mtaa', title:'Sauti ya Mtaa', year:2024, genre:'Music Drama', price:5, emoji:'🎤', bg:'#3f1e2e', runtime:'1h 28m', rating:'7.0', director:'Yakwetu Original', cast:['DJ Tempo','Nyawira','MC Panya'], blurb:'An underground MC risks everything for one breakthrough night.', tmdb:0, poster:'' },
  { id:'katana', title:'Katana', year:2024, genre:'Coastal Thriller', price:5, emoji:'🗡️', bg:'#1e3f38', runtime:'1h 35m', rating:'6.9', director:'Yakwetu Original', cast:['Hassan Ali','Mercy Chebet'], blurb:'Smuggling and betrayal on the Kenyan coast.', tmdb:0, poster:'' },
  { id:'matatu-diaries', title:'The Matatu Diaries', year:2024, genre:'Comedy', price:5, emoji:'🚌', bg:'#3f341e', runtime:'1h 20m', rating:'7.2', director:'Yakwetu Original', cast:['Conductor Joe','Sharon','Stage Man'], blurb:'Chaos, romance, and Sheng on a Route 46 matatu.', tmdb:0, poster:'' },
  { id:'kifaru', title:'Kifaru', year:2024, genre:'Wildlife Doc', price:5, emoji:'🦏', bg:'#263f1e', runtime:'1h 10m', rating:'7.6', director:'Yakwetu Original', cast:['Rangers of Lewa'], blurb:'Rangers race to protect the last northern white rhinos.', tmdb:0, poster:'' },
  { id:'dhahabu', title:'Dhahabu', year:2024, genre:'Romance', price:5, emoji:'💛', bg:'#3f2a1e', runtime:'1h 32m', rating:'6.8', director:'Yakwetu Original', cast:['Lina','Juma','Auntie Bea'], blurb:'Gold, jealousy, and a love that won’t stay buried.', tmdb:0, poster:'' },
  { id:'wazi', title:'Wazi', year:2024, genre:'Psych Thriller', price:5, emoji:'🌀', bg:'#1e2a3f', runtime:'1h 38m', rating:'7.0', director:'Yakwetu Original', cast:['Dr. Wanjiru','Patient X'], blurb:'A therapist’s patient may know her darkest secret.', tmdb:0, poster:'' },
  { id:'baraka', title:'Baraka ya Bibi', year:2024, genre:'Family Drama', price:5, emoji:'🏠', bg:'#331e3f', runtime:'1h 25m', rating:'7.1', director:'Yakwetu Original', cast:['Bibi Njeri','Grandson','Pastor'], blurb:'A grandmother’s secret reshapes three generations.', tmdb:0, poster:'' },
  { id:'chokora', title:'Chokora', year:2005, genre:'Crime Drama', price:5, emoji:'🏙️', bg:'#22202a', runtime:'1h 20m', rating:'6.4', director:'Kenyan indie', cast:['Ensemble'], blurb:'Street life and survival on Nairobi’s edges.', tmdb:0, poster:'' },
  { id:'disconnect', title:'Disconnect', year:2018, genre:'Thriller', price:5, emoji:'📵', bg:'#1a2230', runtime:'1h 22m', rating:'6.2', director:'Kenyan indie', cast:['Ensemble'], blurb:'A missing phone sparks a night of paranoia.', tmdb:0, poster:'' },
  { id:'the-letter', title:'The Letter', year:2019, genre:'Drama', price:5, emoji:'✉️', bg:'#282030', runtime:'1h 30m', rating:'6.5', director:'Kenyan indie', cast:['Ensemble'], blurb:'A letter forces a family to face what silence protected.', tmdb:0, poster:'' },
  { id:'our-strength', title:'Our Strength', year:2012, genre:'Drama', price:5, emoji:'💪', bg:'#203028', runtime:'1h 15m', rating:'6.3', director:'Kenyan indie', cast:['Ensemble'], blurb:'Community resilience after upheaval.', tmdb:0, poster:'' },
  { id:'shattered', title:'Shattered', year:2011, genre:'Thriller', price:5, emoji:'🪞', bg:'#281820', runtime:'1h 28m', rating:'6.0', director:'Kenyan indie', cast:['Ensemble'], blurb:'A fractured marriage turns dangerous.', tmdb:0, poster:'' },
  { id:'grave-yard', title:'Grave Yard', year:2014, genre:'Horror', price:5, emoji:'🪦', bg:'#181818', runtime:'1h 20m', rating:'5.8', director:'Cezmiq Cast', cast:['Ensemble'], blurb:'What was buried refuses to stay quiet.', tmdb:0, poster:'' },
  { id:'through-hell', title:'Through Hell', year:2014, genre:'Horror', price:5, emoji:'🔥', bg:'#2a1010', runtime:'1h 25m', rating:'5.7', director:'Cezmiq Cast', cast:['Ensemble'], blurb:'A night journey that won’t let you wake up.', tmdb:0, poster:'' },
  { id:'the-hammer', title:'The Hammer', year:2015, genre:'Action', price:5, emoji:'🔨', bg:'#281818', runtime:'1h 30m', rating:'6.1', director:'Cezmiq Cast', cast:['Ensemble'], blurb:'Street justice with no soft landings.', tmdb:0, poster:'' },
  { id:'game-of-wits', title:'Game of Wits', year:2017, genre:'Thriller', price:5, emoji:'♟️', bg:'#222030', runtime:'1h 28m', rating:'6.2', director:'Kenyan indie', cast:['Ensemble'], blurb:'A mind game where every move costs someone.', tmdb:0, poster:'' },
  { id:'toto-millionaire', title:'Toto Millionaire', year:2007, genre:'Family Comedy', price:5, emoji:'💰', bg:'#303018', runtime:'1h 20m', rating:'6.4', director:'Kenyan indie', cast:['Ensemble'], blurb:'A child’s windfall turns the estate upside down.', tmdb:0, poster:'' },
  { id:'fundi-mentals', title:'Fundi-Mentals', year:2014, genre:'Comedy', price:5, emoji:'🔧', bg:'#2a2818', runtime:'1h 15m', rating:'6.0', director:'Kenyan indie', cast:['Ensemble'], blurb:'Handymen, hustles, and hilarious side quests.', tmdb:0, poster:'' },
  { id:'dance-for-wives', title:'The Dance for Wives', year:2009, genre:'Romance Drama', price:5, emoji:'💃', bg:'#3a2030', runtime:'1h 30m', rating:'6.1', director:'Paul Ekuru', cast:['Ensemble'], blurb:'Desire and duty collide in a charged social circle.', tmdb:0, poster:'' },
  { id:'balloon-safari', title:'Balloon Safari', year:1975, genre:'Wildlife Doc', price:5, emoji:'🎈', bg:'#2a3820', runtime:'1h 00m', rating:'7.0', director:'Classic Kenya', cast:['Documentary'], blurb:'Classic aerial journey over East African wildlife.', tmdb:0, poster:'' },
  { id:'mzima', title:'Mzima: Portrait of a Spring', year:1972, genre:'Nature Doc', price:5, emoji:'💧', bg:'#183028', runtime:'50m', rating:'7.2', director:'Classic Kenya', cast:['Documentary'], blurb:'Life around a spring that feeds the savannah.', tmdb:0, poster:'' },
  { id:'intellectual-scum', title:'Intellectual Scum', year:2015, genre:'Satire', price:5, emoji:'🧠', bg:'#282030', runtime:'45m', rating:'6.8', director:'Kenyan indie', cast:['Ensemble'], blurb:'Sharp satire on academia and empty talk.', tmdb:0, poster:'' },
  { id:'i-want-to-be-a-pilot', title:'I Want to Be a Pilot', year:2006, genre:'Short Drama', price:5, emoji:'✈️', bg:'#1e2838', runtime:'12m', rating:'7.3', director:'Diego Quemada-Diez', cast:['Ensemble'], blurb:'A child’s dream against impossible odds.', tmdb:0, poster:'' },
  { id:'haba-na-haba', title:'Haba na Haba', year:2013, genre:'Drama', price:5, emoji:'🧩', bg:'#282428', runtime:'1h 20m', rating:'6.4', director:'Kenyan indie', cast:['Ensemble'], blurb:'Little by little — a story of incremental hope.', tmdb:0, poster:'' },
  { id:'nangos', title:'Nangos', year:2009, genre:'Drama', price:5, emoji:'🌾', bg:'#2a3020', runtime:'1h 25m', rating:'6.2', director:'Kenyan indie', cast:['Ensemble'], blurb:'Rural lives under pressure from change.', tmdb:0, poster:'' },
  { id:'the-stigma', title:'The Stigma', year:2007, genre:'Drama', price:5, emoji:'🗣️', bg:'#2a2030', runtime:'1h 20m', rating:'6.3', director:'Kenyan indie', cast:['Ensemble'], blurb:'Silence and stigma confront a community.', tmdb:0, poster:'' },
];

export function getMovieById(id) {
  return CATALOG.find((m) => m.id === id) || null;
}

export function searchMovies(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return CATALOG.slice();
  return CATALOG.filter(
    (m) =>
      m.title.toLowerCase().includes(s) ||
      m.genre.toLowerCase().includes(s) ||
      String(m.year).includes(s) ||
      (m.cast || []).join(' ').toLowerCase().includes(s) ||
      (m.blurb || '').toLowerCase().includes(s)
  );
}

export function genresInCatalog() {
  return Array.from(new Set(CATALOG.map((m) => m.genre))).sort();
}

export function similarMovies(movie, limit = 12) {
  if (!movie) return CATALOG.slice(0, limit);
  const same = CATALOG.filter((m) => m.id !== movie.id && m.genre === movie.genre);
  const rest = CATALOG.filter((m) => m.id !== movie.id && m.genre !== movie.genre);
  return same.concat(rest).slice(0, limit);
}

export function posterUrl(m) {
  if (m && m.poster) return m.poster;
  return '';
}

export function catalogForAI(limit = 55) {
  return CATALOG.slice(0, limit)
    .map((m) => `${m.title} (${m.genre}, KES ${m.price})`)
    .join('; ');
}

export const MOVIES = CATALOG;
