import PosterTile from './PosterTile';

/** Full-width vertical grid — fills the row, no side gaps */
export default function MovieSection({ title, items, id }) {
  if (!items?.length) return null;
  return (
    <section className="section" id={id}>
      <div className="section-head">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      <div className="movie-grid">
        {items.map((m) => (
          <PosterTile key={m.id} movie={m} />
        ))}
      </div>
    </section>
  );
}
