// Stand-in for pages nobody has built yet. Replace it by registering a real page in App.jsx.
export default function Placeholder({ title }) {
  return (
    <div>
      <h1>{title}</h1>
      <p className="page-note">This page has not been built yet.</p>
    </div>
  )
}
