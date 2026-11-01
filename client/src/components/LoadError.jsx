// Error box with a retry button for the public pages.
export default function LoadError({ message, onRetry }) {
  return (
    <div className="pub-alert" role="alert">
      <strong>Something needs attention</strong>
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
    </div>
  )
}
