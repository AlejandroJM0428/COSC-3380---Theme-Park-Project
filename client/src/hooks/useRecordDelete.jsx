import { useState } from 'react'
import { deleteRecord, reactivateRecord, setRideOpen } from '../api'
import ReasonDialog from '../components/ReasonDialog.jsx'

// The delete / void / reactivate flow for one entity (config/entities.js), moved out of RecordManager.
// callbacks: clearErrors(), setNotice(text), setActionError(text), onReload() (refetch the list), onDeleted() (after a direct delete only)
// returns: remove(row), reactivate(row), deleteLabel, deletePast, reasonDialog (an element to render, or null), cancelAsk() (close the reason dialog)
export default function useRecordDelete(entity, { clearErrors, setNotice, setActionError, onReload, onDeleted }) {
  const [asking, setAsking] = useState(null) // { row, action: 'deactivate' | 'reactivate' | 'close' | 'open' } while the reason dialog is open
  const [askBusy, setAskBusy] = useState(false)
  const [askError, setAskError] = useState('')

  // Optional entity settings: deleteLabel ('Void'), deletePast ('Voided'), askReason (prompt sent as ?reason=), requireReason (dialog with choices)
  const deleteLabel = entity.deleteLabel ?? 'Delete'
  const deletePast = entity.deletePast ?? 'Deleted'

  async function remove(row) {
    if (entity.requireReason) {
      setAskError('')
      setAsking({ row, action: 'deactivate' })
      return
    }
    let query = {}
    if (entity.askReason) {
      const reason = window.prompt(`${deleteLabel} ${entity.describe(row)}? Enter a reason (optional):`)
      if (reason === null) return // pressed Cancel
      query = { reason: reason.trim() }
    } else if (!window.confirm(`${deleteLabel} ${entity.describe(row)}? ${entity.deleteNote ?? 'This cannot be undone.'}`)) {
      return
    }
    clearErrors()
    setNotice('')
    try {
      await deleteRecord(entity.resource, row[entity.idKey], query)
      setNotice(`${deletePast} ${entity.describe(row)}.`)
      onReload()
      onDeleted?.()
    } catch (err) {
      setActionError(err.message)
    }
  }

  // Optional: reactivateLabel ('Reactivate') plus canReactivateRow(row) puts a deactivated row back on with one click.
  async function reactivate(row) {
    if (entity.requireReason) {
      setAskError('')
      setAsking({ row, action: 'reactivate' })
      return
    }
    clearErrors()
    setNotice('')
    try {
      await reactivateRecord(entity.resource, row[entity.idKey])
      setNotice(`Reactivated ${entity.describe(row)}.`)
      onReload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  // Close a ride now / open it again (entity.canCloseRow / canOpenRow). Always asks for a reason, saved in the audit log.
  function askOpenClose(row, action) {
    setAskError('')
    setAsking({ row, action })
  }

  // The reason dialog's Confirm: send the change together with the reason, then close the dialog.
  async function confirmReason(reason) {
    const { row, action } = asking
    setAskBusy(true)
    setAskError('')
    try {
      if (action === 'deactivate') {
        await deleteRecord(entity.resource, row[entity.idKey], { reason })
        setNotice(`${deletePast} ${entity.describe(row)}. Reason: ${reason}`)
      } else if (action === 'close' || action === 'open') {
        const saved = await setRideOpen(entity.resource, row[entity.idKey], action === 'open', reason)
        const still = action === 'open' && saved?.LiveState && saved.LiveState !== 'Open' ? ` It still shows ${saved.LiveState.replace('Closed - ', 'Closed: ')} for guests.` : ''
        setNotice(`${action === 'open' ? 'Reopened' : 'Closed'} ${entity.describe(row)}. Reason: ${reason}.${still}`)
      } else {
        await reactivateRecord(entity.resource, row[entity.idKey], reason)
        setNotice(`Reactivated ${entity.describe(row)}. Reason: ${reason}`)
      }
      setAsking(null)
      onReload()
    } catch (err) {
      setAskError(err.message)
    } finally {
      setAskBusy(false)
    }
  }

  const cancelAsk = () => {
    if (!askBusy) setAsking(null)
  }

  const dialogLabel = (action) =>
    action === 'deactivate' ? deleteLabel : action === 'close' ? 'Close ride' : action === 'open' ? 'Reopen ride' : (entity.reactivateLabel ?? 'Reactivate')

  const reasonDialog = asking ? (
    <ReasonDialog
      title={`${dialogLabel(asking.action)} ${entity.describe(asking.row)}?`}
      message={
        asking.action === 'deactivate'
          ? (entity.deleteNote ?? 'The record is kept.')
          : asking.action === 'close'
            ? 'Guests will see the ride as Closed until it is reopened.'
            : asking.action === 'open'
              ? 'Guests will see the ride as Open again, unless weather or an open maintenance job also closes it.'
              : 'It will show as active again and guests can use it.'
      }
      choices={entity.reasonChoices?.[asking.action] ?? []}
      confirmLabel={dialogLabel(asking.action)}
      danger={asking.action === 'deactivate' || asking.action === 'close'}
      busy={askBusy}
      error={askError}
      onConfirm={confirmReason}
      onCancel={() => setAsking(null)}
    />
  ) : null

  return { remove, reactivate, askOpenClose, deleteLabel, deletePast, reasonDialog, cancelAsk }
}
