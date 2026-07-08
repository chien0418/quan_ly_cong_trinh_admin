export const DEFAULT_PIN = '0000'

export function isValidPin(value: string) {
  return /^\d{4}$/.test(value.trim())
}

export function encodePin(employeeCode: string, pin: string) {
  const code = employeeCode.trim().toUpperCase()
  const normalizedPin = pin.trim()
  if (!isValidPin(normalizedPin)) {
    throw new Error('PINは4桁の数字で入力してください。')
  }
  return `KJ-${code}-${normalizedPin}`
}
