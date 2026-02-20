import axios from 'axios'

export async function fetchProjects() {
  const { data } = await axios.get('/api/projects')
  return data
}

export async function fetchSummary() {
  const { data } = await axios.get('/api/projects/summary')
  return data
}
