/**
 * The storefront's catalog: which titles we sell, at what price, and in what
 * order they trend. Metadata (plot, poster, cast…) comes from OMDb by IMDb id;
 * run `pnpm catalog:seed` after editing.
 *
 * Ids match sinema-recs (data/catalog.json) where a title exists in both, so a
 * viewer's signals line up across the two services. Prices follow the live
 * Yakwetu site where it lists the title; the rest are placeholders in its
 * KES 49–199 range.
 */

export interface CuratedTitle {
  id: string;
  imdbId: string;
  priceKes: number;
  /** Kenyan titles: their own row on the landing page. */
  featured?: boolean;
}

export const CURATED: CuratedTitle[] = [
  // ── Kenya ──
  { id: "call-me-queen", imdbId: "tt10499972", priceKes: 199, featured: true },
  { id: "kienyeji", imdbId: "tt37174791", priceKes: 199, featured: true },
  { id: "cards-on-the-table", imdbId: "tt38939205", priceKes: 149, featured: true },
  { id: "nairobi-half-life", imdbId: "tt2234428", priceKes: 99, featured: true },
  { id: "40-sticks", imdbId: "tt13483050", priceKes: 149, featured: true },
  { id: "supa-modo", imdbId: "tt7772412", priceKes: 99, featured: true },
  { id: "otis-janam", imdbId: "tt31382216", priceKes: 149, featured: true },
  { id: "kizingo", imdbId: "tt30811260", priceKes: 99, featured: true },
  { id: "kati-kati", imdbId: "tt6039442", priceKes: 99, featured: true },
  { id: "softie", imdbId: "tt11394314", priceKes: 99, featured: true },
  { id: "why-u-hate", imdbId: "tt37533877", priceKes: 99, featured: true },
  { id: "where-the-river-divides", imdbId: "tt27173163", priceKes: 99, featured: true },
  { id: "supastaz", imdbId: "tt18263274", priceKes: 49, featured: true },
  { id: "a-guide-to-dining-out-in-nairobi", imdbId: "tt11608054", priceKes: 49, featured: true },

  // ── Across the continent ──
  { id: "mami-wata", imdbId: "tt6315898", priceKes: 199 },
  { id: "king-of-boys", imdbId: "tt8329618", priceKes: 199 },
  { id: "the-black-book", imdbId: "tt24083908", priceKes: 199 },
  { id: "a-tribe-called-judah", imdbId: "tt29769154", priceKes: 199 },
  { id: "the-woman-king", imdbId: "tt8093700", priceKes: 199 },
  { id: "anikulapo", imdbId: "tt21432050", priceKes: 199 },
  { id: "gangs-of-lagos", imdbId: "tt19704612", priceKes: 199 },
  { id: "soft-love", imdbId: "tt33889574", priceKes: 199 },
  { id: "atlantics", imdbId: "tt10199586", priceKes: 149 },
  { id: "lionheart", imdbId: "tt7707314", priceKes: 149 },
  { id: "the-wedding-party", imdbId: "tt5978822", priceKes: 149 },
  { id: "tsotsi", imdbId: "tt0468565", priceKes: 149 },
  { id: "timbuktu", imdbId: "tt3409392", priceKes: 149 },
  { id: "eyimofe", imdbId: "tt10365870", priceKes: 149 },
  { id: "citation", imdbId: "tt11481312", priceKes: 149 },
  { id: "the-boy-who-harnessed-the-wind", imdbId: "tt7533152", priceKes: 149 },
  { id: "queen-of-katwe", imdbId: "tt4341582", priceKes: 149 },
  { id: "hotel-rwanda", imdbId: "tt0395169", priceKes: 149 },
  { id: "district-9", imdbId: "tt1136608", priceKes: 149 },
  { id: "i-am-not-a-witch", imdbId: "tt6213284", priceKes: 149 },
  { id: "juju-stories", imdbId: "tt11989466", priceKes: 149 },
  { id: "aki-and-pawpaw", imdbId: "tt16411110", priceKes: 149 },
  { id: "the-milkmaid", imdbId: "tt9349882", priceKes: 149 },
  { id: "tug-of-war", imdbId: "tt15138462", priceKes: 149 },
  { id: "sew-the-winter-to-my-skin", imdbId: "tt7416536", priceKes: 149 },
  { id: "brotherhood", imdbId: "tt19704920", priceKes: 149 },
  { id: "queen-of-the-sun", imdbId: "tt12962724", priceKes: 99 },
  { id: "bilal-a-new-breed-of-hero", imdbId: "tt3576728", priceKes: 49 },
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
