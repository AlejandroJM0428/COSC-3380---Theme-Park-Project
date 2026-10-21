// Shows an error message (including messages raised by database triggers).
export default function ErrorBanner({ message, onClose }) {
  if (!message) return null
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  )
}
