import axios from 'axios'

export async function fetchEmployees() {
  const { data } = await axios.get('/api/employees')
  return data
}

export async function fetchStructures() {
  const { data } = await axios.get('/api/salary-structures')
  return data
}

export async function fetchRuns() {
  const { data } = await axios.get('/api/payroll/runs')
  return data
}

export async function fetchSummary() {
  const { data } = await axios.get('/api/payroll/summary')
  return data
}

export async function fetchSettings() {
  const { data } = await axios.get('/api/payroll/settings')
  return data
}
