// Date limits for a dependent's date of birth input. This is only a hint for the date picker:
// the database enforces "under 18" (trg_Customer_BI_Dependent / trg_Customer_BU_Dependent).
function format(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// max = today. min = the day after the date exactly 18 years ago (someone born then turns 18 today).
export function dobWindow() {
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const min = new Date(now)
  min.setFullYear(min.getFullYear() - 18)
  min.setDate(min.getDate() + 1)
  return { min: format(min), max: format(now) }
}
