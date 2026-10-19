import './charts.css'

export default function ChartFrame({ title, note, empty, emptyText, children }) {
  return (
    <section className="chart-frame" aria-label={title}>
      <div className="chart-frame-heading">
        <h3>{title}</h3>
        {note ? <span>{note}</span> : null}
      </div>
      {empty ? <p className="chart-empty">{emptyText}</p> : children}
    </section>
  )
}
