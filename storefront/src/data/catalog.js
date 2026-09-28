/* Curated Kenyan fallback (~12). Live list comes from /api/catalog/kenya when TMDB_API_KEY is set. */

export const CATALOG = [
  { id:'nairobi-half-life', title:'Nairobi Half Life', year:2012, genre:'Crime Drama', price:5, bg:'#1a1528', runtime:'1h 36m', rating:'7.4', director:'David Tosh Gitonga', cast:['Joseph Wairimu','Olwenya Maina','Nancy Wanjiru'], blurb:'A young actor chases fame and falls into Nairobi’s underworld.', tmdb:130737, imdb:'tt2187153', poster:'https://upload.wikimedia.org/wikipedia/commons/f/fc/Nairobi_Half_Life_Poster.png' },
  { id:'rafiki', title:'Rafiki', year:2018, genre:'Romance Drama', price:5, bg:'#3f1e3a', runtime:'1h 23m', rating:'6.8', director:'Wanuri Kahiu', cast:['Samantha Mugatsia','Sheila Munyiva','Jimmy Gathu'], blurb:'Two young women fall in love against family and political pressure.', tmdb:505954, imdb:'tt8286894', poster:'' },
  { id:'40-sticks', title:'40 Sticks', year:2020, genre:'Crime Thriller', price:5, bg:'#2a1010', runtime:'1h 21m', rating:'5.9', director:'Orlando Eastwood', cast:['Robert Agengo','Andreas Steiner','Muthoni Gathecha'], blurb:'Prisoners crash in the forest — and someone starts hunting them.', tmdb:718789, imdb:'tt12851524', poster:'' },
  { id:'pumzi', title:'Pumzi', year:2010, genre:'Sci-Fi', price:5, bg:'#102820', runtime:'22m', rating:'7.1', director:'Wanuri Kahiu', cast:['Kudzani Moswela','Leo Ojiambo'], blurb:'In a water-scarce future, a curator risks everything for a seed.', tmdb:57915, imdb:'tt1552211', poster:'' },
  { id:'the-first-grader', title:'The First Grader', year:2010, genre:'Drama', price:5, bg:'#2a2818', runtime:'1h 43m', rating:'7.4', director:'Justin Chadwick', cast:['Oliver Litondo','Naomie Harris','Tony Kgoroge'], blurb:'An 84-year-old Mau Mau veteran demands his right to school.', tmdb:55254, imdb:'tt1361815', poster:'' },
  { id:'something-necessary', title:'Something Necessary', year:2013, genre:'Drama', price:5, bg:'#2a2430', runtime:'1h 25m', rating:'6.9', director:'Judy Kibinge', cast:['Susan Wanjiru','Anne Wanjiru'], blurb:'A lawyer fights for justice after post-election violence.', tmdb:205588, imdb:'tt2912338', poster:'https://upload.wikimedia.org/wikipedia/commons/5/57/Something_Necessary_Poster.png' },
  { id:'from-a-whisper', title:'From a Whisper', year:2008, genre:'Drama', price:5, bg:'#252030', runtime:'1h 19m', rating:'7.0', director:'Wanuri Kahiu', cast:['Ken Ambani','Godwin Mwampembe'], blurb:'Lives collide after the 1998 embassy bombing.', tmdb:74890, imdb:'tt1396223', poster:'' },
  { id:'kati-kati', title:'Kati Kati', year:2016, genre:'Drama', price:5, bg:'#1a1a28', runtime:'1h 15m', rating:'6.7', director:'Mbithi Masya', cast:['Nyokabi Gethaiga','Elsaphan Njora'], blurb:'A young woman wakes in a purgatory of unfinished lives.', tmdb:412140, imdb:'tt5795086', poster:'https://upload.wikimedia.org/wikipedia/commons/8/83/Poster_for_Kati_Kati_presskit.png' },
  { id:'veve', title:'Veve', year:2014, genre:'Crime Drama', price:5, bg:'#1a2a1a', runtime:'1h 34m', rating:'6.5', director:"Ng'endo Mukii", cast:['Lowry Odhiambo','Lizz Njagah'], blurb:'Miraa trade, politics, and impossible choices.', tmdb:298312, poster:'' },
  { id:'stories-of-our-lives', title:'Stories of Our Lives', year:2014, genre:'Drama', price:5, bg:'#2a1e28', runtime:'1h 2m', rating:'7.2', director:'Jim Chuchu', cast:['Ensemble cast'], blurb:'Anthology of queer Kenyan stories, raw and intimate.', tmdb:0, poster:'' },
  { id:'saikati', title:'Saïkati', year:1992, genre:'Romance Adventure', price:5, bg:'#2a3020', runtime:'1h 34m', rating:'6.7', director:'Anne Mungai', cast:['Susan Achieng'], blurb:'A Maasai woman forges her path between tradition and city.', tmdb:0, poster:'' },
  { id:'kibera-kid', title:'Kibera Kid', year:2006, genre:'Short Drama', price:5, bg:'#2a2220', runtime:'15m', rating:'7.0', director:'Nathan Collett', cast:['Godfrey Odhiambo'], blurb:'A boy in Kibera chooses between crime and courage.', tmdb:0, poster:'' },
];

export function getMovieById(id) {
  return CATALOG.find((m) => m.id === id) || null;
}

export function searchMovies(q, list = CATALOG) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return list.slice();
  return list.filter(
    (m) =>
      m.title.toLowerCase().includes(s) ||
      m.genre.toLowerCase().includes(s) ||
      String(m.year).includes(s) ||
      (m.cast || []).join(' ').toLowerCase().includes(s) ||
      (m.blurb || '').toLowerCase().includes(s)
  );
}

export function genresInCatalog(list = CATALOG) {
  return Array.from(new Set(list.map((m) => m.genre))).sort();
}

export function similarMovies(movie, limit = 12, list = CATALOG) {
  if (!movie) return list.slice(0, limit);
  const same = list.filter((m) => m.id !== movie.id && m.genre === movie.genre);
  const rest = list.filter((m) => m.id !== movie.id && m.genre !== movie.genre);
  return same.concat(rest).slice(0, limit);
}

export function posterUrl(m) {
  if (m && m.poster) return m.poster;
  return '';
}

export const MOVIES = CATALOG;
