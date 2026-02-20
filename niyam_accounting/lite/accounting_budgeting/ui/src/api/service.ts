import axios from 'axios'

export async function fetchVersions() {
  const { data } = await axios.get('/api/budget-versions')
  return data
}

export async function fetchForecast() {
  const { data } = await axios.get('/api/budget-forecast')
  return data
}

export async function fetchAlerts() {
  const { data } = await axios.get('/api/budget-alerts')
  return data
}

export async function fetchReports() {
  const { data } = await axios.get('/api/saved-reports')
  return data
}
