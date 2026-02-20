import axios from 'axios'

export async function fetchValuation() {
  const { data } = await axios.get('/api/inventory-valuation')
  return data
}

export async function fetchMethods() {
  const { data } = await axios.get('/api/inventory-valuation/methods')
  return data
}
