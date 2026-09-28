import PosterTile from './PosterTile';

export default function MovieRow({ title, items, id }) {
  if (!items?.length) return null;
  return (
    <section className="row" id={id}>
      <div className="row-head">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      <div className="scroller">
        {items.map((m) => (
          <PosterTile key={m.id} movie={m} />
        ))}
      </div>
    </section>
  );
}
