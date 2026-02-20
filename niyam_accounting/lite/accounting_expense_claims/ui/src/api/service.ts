import axios from 'axios'

export async function fetchClaims() {
  const { data } = await axios.get('/api/expense-claims')
  return data
}

export async function fetchCategories() {
  const { data } = await axios.get('/api/expense-categories')
  return data
}

export async function fetchSummary() {
  const { data } = await axios.get('/api/expense-claims/summary')
  return data
}
