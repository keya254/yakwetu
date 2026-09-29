/**
 * The storefront's catalog: which titles we sell, at what price, and in what
 * order they trend. Metadata (plot, poster, cast…) comes from OMDb by IMDb id;
 * run `pnpm catalog:seed` after editing. Video ids are ours (YouTube), not OMDb's.
 *
 * `pnpm recs:sync` pushes these ids to sinema-recs, so a viewer's signals
 * line up across the two services. Prices follow the live
 * Yakwetu site where it lists the title; the rest are placeholders in its
 * KES 49–199 range.
 */

export interface CuratedTitle {
  id: string;
  imdbId: string;
  priceKes: number;
  /** YouTube video id for the VideoBox. Trailers from the film's own or its distributor's channel; must allow embedding. */
  youtubeId: string;
  /** Kenyan titles: their own row on the landing page. */
  featured?: boolean;
}

export const CURATED: CuratedTitle[] = [
  // ── Kenya ──
  { id: "call-me-queen", imdbId: "tt10499972", youtubeId: "X0x28lrGn5E", priceKes: 199, featured: true },
  { id: "kienyeji", imdbId: "tt37174791", youtubeId: "oCQk2xVYxac", priceKes: 199, featured: true },
  { id: "cards-on-the-table", imdbId: "tt38939205", youtubeId: "Wjmm1p9h-TA", priceKes: 149, featured: true },
  { id: "nairobi-half-life", imdbId: "tt2234428", youtubeId: "nRjBLAnx2jU", priceKes: 99, featured: true },
  { id: "40-sticks", imdbId: "tt13483050", youtubeId: "0q_-U7LCRqE", priceKes: 149, featured: true },
  { id: "supa-modo", imdbId: "tt7772412", youtubeId: "G7ToKioHCoU", priceKes: 99, featured: true },
  { id: "otis-janam", imdbId: "tt31382216", youtubeId: "_yBCf5mmpnE", priceKes: 149, featured: true },
  { id: "kizingo", imdbId: "tt30811260", youtubeId: "0mWOctr2ZBk", priceKes: 99, featured: true },
  { id: "kati-kati", imdbId: "tt6039442", youtubeId: "BAxK1RRyul0", priceKes: 99, featured: true },
  { id: "softie", imdbId: "tt11394314", youtubeId: "SbBF4C1Ibgw", priceKes: 99, featured: true },
  { id: "why-u-hate", imdbId: "tt37533877", youtubeId: "d-BdG5ur69k", priceKes: 99, featured: true },
  { id: "where-the-river-divides", imdbId: "tt27173163", youtubeId: "EMrhvjTWNzs", priceKes: 99, featured: true },
  { id: "supastaz", imdbId: "tt18263274", youtubeId: "TX_eoTPr12c", priceKes: 49, featured: true },
  { id: "a-guide-to-dining-out-in-nairobi", imdbId: "tt11608054", youtubeId: "B9BoYRvwprQ", priceKes: 49, featured: true },

  // ── Across the continent ──
  { id: "mami-wata", imdbId: "tt6315898", youtubeId: "BRmj7lyvRlk", priceKes: 199 },
  { id: "king-of-boys", imdbId: "tt8329618", youtubeId: "cF-FQLKaUCk", priceKes: 199 },
  { id: "the-black-book", imdbId: "tt24083908", youtubeId: "6PPH4SOm9gk", priceKes: 199 },
  { id: "a-tribe-called-judah", imdbId: "tt29769154", youtubeId: "pEUZVfeCU94", priceKes: 199 },
  { id: "the-woman-king", imdbId: "tt8093700", youtubeId: "3RDaPV_rJ1Y", priceKes: 199 },
  { id: "anikulapo", imdbId: "tt21432050", youtubeId: "rXIKrHPaB-o", priceKes: 199 },
  { id: "gangs-of-lagos", imdbId: "tt19704612", youtubeId: "CciXkcGPij8", priceKes: 199 },
  { id: "soft-love", imdbId: "tt33889574", youtubeId: "gXi_jjfvMHA", priceKes: 199 },
  { id: "atlantics", imdbId: "tt10199586", youtubeId: "ROku0vfgX-Q", priceKes: 149 },
  { id: "lionheart", imdbId: "tt7707314", youtubeId: "v45GprEyM7U", priceKes: 149 },
  { id: "the-wedding-party", imdbId: "tt5978822", youtubeId: "M8XaN1DtI7E", priceKes: 149 },
  { id: "tsotsi", imdbId: "tt0468565", youtubeId: "LLBW8voO9oY", priceKes: 149 },
  { id: "timbuktu", imdbId: "tt3409392", youtubeId: "Cs2dYAlbINY", priceKes: 149 },
  { id: "eyimofe", imdbId: "tt10365870", youtubeId: "H9LbzskTaBQ", priceKes: 149 },
  { id: "citation", imdbId: "tt11481312", youtubeId: "1eMAYynMc1w", priceKes: 149 },
  { id: "the-boy-who-harnessed-the-wind", imdbId: "tt7533152", youtubeId: "nPkr9HmglG0", priceKes: 149 },
  { id: "queen-of-katwe", imdbId: "tt4341582", youtubeId: "eEsz6o50wrY", priceKes: 149 },
  { id: "hotel-rwanda", imdbId: "tt0395169", youtubeId: "2x8UzELvKlY", priceKes: 149 },
  { id: "district-9", imdbId: "tt1136608", youtubeId: "DyLUwOcR5pk", priceKes: 149 },
  { id: "i-am-not-a-witch", imdbId: "tt6213284", youtubeId: "telx5Pfe2-I", priceKes: 149 },
  { id: "juju-stories", imdbId: "tt11989466", youtubeId: "YnsBvGtLabg", priceKes: 149 },
  { id: "aki-and-pawpaw", imdbId: "tt16411110", youtubeId: "Dz1E1Fquayw", priceKes: 149 },
  { id: "the-milkmaid", imdbId: "tt9349882", youtubeId: "yy6zTDiHLhY", priceKes: 149 },
  { id: "tug-of-war", imdbId: "tt15138462", youtubeId: "Lb8uoU4N3rw", priceKes: 149 },
  { id: "sew-the-winter-to-my-skin", imdbId: "tt7416536", youtubeId: "F92gFZy6QYU", priceKes: 149 },
  { id: "brotherhood", imdbId: "tt19704920", youtubeId: "3fOV0FzO2so", priceKes: 149 },
  { id: "queen-of-the-sun", imdbId: "tt12962724", youtubeId: "svBHQHQecbo", priceKes: 99 },
  { id: "bilal-a-new-breed-of-hero", imdbId: "tt3576728", youtubeId: "VhrZBHwOMUs", priceKes: 49 },
];

/** Trending order until real events drive it: newest and best-rated first, Kenyan titles interleaved. */
export const TRENDING_ORDER = [
  "call-me-queen",
  "mami-wata",
  "kienyeji",
  "king-of-boys",
  "cards-on-the-table",
  "the-black-book",
  "nairobi-half-life",
  "a-tribe-called-judah",
  "40-sticks",
  "atlantics",
  "supa-modo",
  "anikulapo",
  "the-woman-king",
  "kati-kati",
  "lionheart",
  "tsotsi",
];
