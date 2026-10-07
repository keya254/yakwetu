import PosterTile from './PosterTile';

/** Titled, horizontally scrolling row — cut-off last card signals more. */
export default function MovieSection({ title, description, items, id }) {
  if (!items?.length) return null;
  return (
    <section className="section" id={id}>
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {description ? <p className="section-desc">{description}</p> : null}
        </div>
        <span className="section-count">{items.length}</span>
      </div>
      <div className="no-scrollbar">
        <ul className="row-track">
          {items.map((m) => (
            <li key={m.id}>
              <PosterTile movie={m} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
